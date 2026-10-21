import io
import os
import uuid
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Set

import numpy as np
import joblib
from sqlmodel import Session, select
from sklearn.decomposition import PCA

from app.models.dataset import Dataset
from app.models.domain_gap import DomainSampleSet, DatasetDomainGapResult
from app.services.vector_service import get_profiling_collection
from app.services.profiling_embedding_service import get_or_create_profiling_embeddings
from app.services.profiling_service import calculate_dataset_file_checksum
from app.services.storage_service import minio_client
from app.config import settings

logger = logging.getLogger(__name__)


def load_domain_gap_config() -> Dict[str, Any]:
    """Loads domain gap evaluation configuration parameters."""
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "domain_gap_config.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "max_samples": 30,
        "min_samples_recommended": 10,
        "max_file_mb": 10,
        "allowed_types": ["image/jpeg", "image/png", "image/webp"],
        "baseline_max_images": 500,
        "baseline_exclude_similarity_above": 0.97,
        "covered_percentile": 10,
        "verdict_bands": {"low_gap_min_pct": 80, "moderate_min_pct": 50},
        "plot_max_points": 1500,
        "umap": {"n_neighbors": 15, "min_dist": 0.1, "metric": "cosine", "random_state": 42},
        "pca_fallback_below_images": 30,
    }


def extract_class_label(image_path: str, dataset_storage_path: Optional[str]) -> Optional[str]:
    """
    Extracts class name from relative directory structure, correctly handling
    train/val/test split directories.
    """
    if not image_path or not dataset_storage_path:
        return None
    prefix = dataset_storage_path.rstrip("/") + "/"
    rel = image_path[len(prefix):] if image_path.startswith(prefix) else image_path
    parts = rel.split("/")
    if len(parts) > 1:
        # Check if first component is a split folder
        if parts[0].lower() in {"train", "val", "validation", "test", "testing"} and len(parts) > 2:
            return parts[1]
        return parts[0]
    return None


def get_projections_dir() -> Path:
    """Returns local path to persist 2D projection reducers, adjacent to chroma data."""
    chroma_parent = Path("D:/dataweaver")
    if chroma_parent.exists():
        proj_dir = chroma_parent / "projections"
    else:
        proj_dir = Path(__file__).resolve().parent.parent.parent / "data" / "projections"
    proj_dir.mkdir(parents=True, exist_ok=True)
    return proj_dir


def sign_url(storage_path: str, expires_hours: int = 2) -> str:
    """Generates presigned GET URL for a MinIO object key."""
    if not storage_path:
        return ""
    try:
        return minio_client.presigned_get_object(
            settings.minio_bucket_name,
            storage_path,
            expires=timedelta(hours=expires_hours),
        )
    except Exception as e:
        logger.warning(f"Failed to generate presigned URL for {storage_path}: {e}")
        return ""


def compute_mmd_rbf(X: np.ndarray, Y: np.ndarray, max_samples: int = 1000) -> float:
    """
    Computes Maximum Mean Discrepancy (MMD) with an RBF kernel using the median heuristic.
    Calculated on original normalized high-dimensional embeddings (e.g. 768-D DINOv2).
    
    X: shape (M, d) - target samples
    Y: shape (N, d) - source dataset embeddings
    """
    M = len(X)
    N = len(Y)
    if M == 0 or N == 0:
        return 0.0

    if N > max_samples:
        rng = np.random.RandomState(42)
        idx = rng.choice(N, size=max_samples, replace=False)
        Y_sub = Y[idx]
        N = len(Y_sub)
    else:
        Y_sub = Y

    # Squared Euclidean distances: ||x - y||^2 = 2 - 2 * <x, y> for L2-normalized vectors
    sim_XY = np.dot(X, Y_sub.T)
    dist_sq_XY = np.clip(2.0 - 2.0 * sim_XY, 0.0, 4.0)

    # Median heuristic for bandwidth gamma
    med_dist_sq = float(np.median(dist_sq_XY))
    if med_dist_sq <= 1e-6:
        gamma = 1.0
    else:
        gamma = 1.0 / (2.0 * med_dist_sq)

    # Kernel matrices
    sim_XX = np.dot(X, X.T)
    dist_sq_XX = np.clip(2.0 - 2.0 * sim_XX, 0.0, 4.0)
    K_XX = np.exp(-gamma * dist_sq_XX)

    sim_YY = np.dot(Y_sub, Y_sub.T)
    dist_sq_YY = np.clip(2.0 - 2.0 * sim_YY, 0.0, 4.0)
    K_YY = np.exp(-gamma * dist_sq_YY)

    K_XY = np.exp(-gamma * dist_sq_XY)

    # Unbiased MMD^2 estimator
    if M > 1:
        sum_XX = float((np.sum(K_XX) - np.trace(K_XX)) / (M * (M - 1)))
    else:
        sum_XX = float(np.mean(K_XX))

    if N > 1:
        sum_YY = float((np.sum(K_YY) - np.trace(K_YY)) / (N * (N - 1)))
    else:
        sum_YY = float(np.mean(K_YY))

    sum_XY = float(2.0 * np.mean(K_XY))

    mmd_sq = sum_XX + sum_YY - sum_XY
    mmd = float(np.sqrt(max(0.0, mmd_sq)))
    return round(mmd, 4)


def attach_presigned_urls(result_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep-copies or decorates cached result with fresh presigned URLs on read.
    Presigned URLs are never persisted in the database.
    """
    out = json.loads(json.dumps(result_data))
    
    # Sign sample thumbnail URLs and their nearest dataset images
    for sample in out.get("samples", []):
        sample["thumbnail_url"] = sign_url(sample.get("image_path", ""))
        for near in sample.get("nearest", []):
            near["image_url"] = sign_url(near.get("image_path", ""))

    # Sign dataset plot points
    for pt in out.get("dataset_points", []):
        pt["image_url"] = sign_url(pt.get("image_path", ""))

    return out


def compute_sample_dataset_similarities(
    S: np.ndarray,
    D: np.ndarray,
    dataset_paths: List[str],
    sample_paths: List[str],
) -> Tuple[List[Dict[str, Any]], Set[int]]:
    """
    Computes pairwise cosine similarities between samples matrix S (M, d) and
    dataset images matrix D (N, d).
    Returns list of sample dicts (with index, nearest top-3 list, nearest_similarity)
    and the set of all top-3 dataset indices.
    """
    M = len(S)
    sim_matrix = np.dot(S, D.T)  # Shape (M, N)
    raw_samples = []
    top3_dataset_indices_set = set()

    for i in range(M):
        row = sim_matrix[i]
        top3_indices = np.argsort(row)[::-1][:3]
        for idx in top3_indices:
            top3_dataset_indices_set.add(int(idx))

        nearest_sim = float(row[top3_indices[0]])
        nearest_list = [
            {
                "image_path": dataset_paths[int(idx)],
                "similarity": round(float(row[idx]), 4),
            }
            for idx in top3_indices
        ]

        raw_samples.append({
            "index": i,
            "image_path": sample_paths[i] if i < len(sample_paths) else "",
            "nearest": nearest_list,
            "nearest_similarity": round(nearest_sim, 4),
        })

    return raw_samples, top3_dataset_indices_set


def compute_dataset_baseline(
    D: np.ndarray,
    config: Dict[str, Any],
    rng_seed: int = 42,
) -> Tuple[float, float, List[float], np.ndarray]:
    """
    Computes empirical baseline threshold and median similarity from dataset embeddings D.
    Returns: (threshold, baseline_median, baseline_distribution, baseline_indices)
    """
    N = len(D)
    baseline_max = min(config.get("baseline_max_images", 500), N)
    rng = np.random.RandomState(rng_seed)
    if N <= baseline_max:
        baseline_indices = np.arange(N)
    else:
        baseline_indices = rng.choice(N, size=baseline_max, replace=False)

    B = D[baseline_indices]
    B_sims = np.dot(B, D.T)  # Shape (baseline_max, N)
    exclude_thresh = config.get("baseline_exclude_similarity_above", 0.97)

    baseline_distribution = []
    for j in range(len(baseline_indices)):
        orig_idx = baseline_indices[j]
        row = B_sims[j].copy()
        row[orig_idx] = -1.0  # Exclude self-similarity

        # Exclude near-copies above 0.97
        valid_neighbors = row[row <= exclude_thresh]
        if len(valid_neighbors) > 0:
            baseline_distribution.append(float(np.max(valid_neighbors)))
        else:
            baseline_distribution.append(0.0)

    covered_pctile = config.get("covered_percentile", 10)
    if baseline_distribution:
        threshold = float(np.percentile(baseline_distribution, covered_pctile))
        baseline_median = float(np.median(baseline_distribution))
    else:
        threshold = 0.65
        baseline_median = 0.75

    return round(threshold, 4), round(baseline_median, 4), baseline_distribution, baseline_indices


def compute_domain_gap(
    session: Session,
    dataset_id: uuid.UUID,
    sample_set_id: uuid.UUID,
    force_recompute: bool = False,
) -> Dict[str, Any]:
    """
    Evaluates semantic domain gap between uploaded target domain samples and dataset images.
    Returns structured analysis with coverage %, verdict, nearest neighbors, baseline statistics,
    and a 2D projection for the interactive scatter plot.
    """
    dataset = session.get(Dataset, dataset_id)
    if not dataset or not dataset.dataset_storage_path:
        raise ValueError("Dataset not found or storage path is missing.")

    sample_set = session.get(DomainSampleSet, sample_set_id)
    if not sample_set or not sample_set.embeddings:
        raise ValueError("Domain sample set not found or contains no embeddings.")

    config = load_domain_gap_config()

    # Get dataset file checksum and paths
    checksum, image_paths, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
    if not checksum or not image_paths:
        raise ValueError("No images found in dataset storage path.")

    # 1. Check existing cached result in database
    if not force_recompute:
        cached_record = session.exec(
            select(DatasetDomainGapResult).where(
                DatasetDomainGapResult.dataset_id == dataset_id,
                DatasetDomainGapResult.sample_set_id == sample_set_id,
                DatasetDomainGapResult.file_list_checksum == checksum,
            )
        ).first()
        if cached_record and cached_record.result:
            return attach_presigned_urls(cached_record.result)

    # 2. Ensure dataset has DINOv2 profiling embeddings (cached in ChromaDB)
    embeddings_map = get_or_create_profiling_embeddings(dataset_id, image_paths)
    if not embeddings_map:
        raise ValueError("Failed to retrieve or generate dataset profiling embeddings.")

    # Convert dataset embeddings into normalized matrix D
    dataset_paths = [p for p in image_paths if p in embeddings_map]
    if not dataset_paths:
        raise ValueError("Dataset has no valid embedded images.")

    D = np.array([embeddings_map[p] for p in dataset_paths], dtype=np.float32)
    D_norms = np.linalg.norm(D, axis=1, keepdims=True)
    D = np.where(D_norms > 0, D / D_norms, D)

    # 3. Sample embeddings matrix S
    sample_paths = sample_set.image_paths
    S = np.array(sample_set.embeddings, dtype=np.float32)
    S_norms = np.linalg.norm(S, axis=1, keepdims=True)
    S = np.where(S_norms > 0, S / S_norms, S)

    M = len(S)
    N = len(D)

    # 4. Pairwise cosine similarity between samples and dataset images (via shared pure helper)
    raw_samples, top3_dataset_indices_set = compute_sample_dataset_similarities(
        S=S, D=D, dataset_paths=dataset_paths, sample_paths=sample_paths
    )

    # 5. Baseline distribution computation (via shared pure helper)
    threshold, baseline_median, baseline_distribution, baseline_indices = compute_dataset_baseline(
        D=D, config=config, rng_seed=42
    )
    covered_pctile = config.get("covered_percentile", 10)

    # Mark samples as covered or uncovered
    covered_count = 0
    for s in raw_samples:
        is_cov = s["nearest_similarity"] >= threshold
        s["covered"] = bool(is_cov)
        if is_cov:
            covered_count += 1

    coverage_pct = round((covered_count / M) * 100, 1)

    # 6. Verdict from verdict_bands
    bands = config.get("verdict_bands", {})
    low_gap_min = bands.get("low_gap_min_pct", 80)
    mod_gap_min = bands.get("moderate_min_pct", 50)

    if coverage_pct >= low_gap_min:
        verdict = "Low gap"
    elif coverage_pct >= mod_gap_min:
        verdict = "Moderate gap"
    else:
        verdict = "High gap"

    # Centroid similarity
    c_D = np.mean(D, axis=0)
    c_D = c_D / np.linalg.norm(c_D)
    c_S = np.mean(S, axis=0)
    c_S = c_S / np.linalg.norm(c_S)
    centroid_similarity = round(float(np.dot(c_S, c_D)), 4)

    # Quantitative distribution distance: Maximum Mean Discrepancy (MMD)
    mmd_value = compute_mmd_rbf(S, D)
    distribution_distance = {
        "metric": "Maximum Mean Discrepancy (MMD)",
        "value": mmd_value,
        "kernel": "RBF (median heuristic)",
        "description": "Measures the overall statistical divergence between the source dataset and target sample distributions in original 768-D DINOv2 feature space. Lower values indicate closer global distribution alignment.",
    }

    # 7. Caveats
    caveats = []
    min_rec = config.get("min_samples_recommended", 10)
    if M < min_rec:
        caveats.append(f"Few samples: Only {M} photos evaluated (recommended: at least {min_rec}). Add more real-setting photos for a more representative assessment.")
    if N < 100:
        caveats.append(f"Small dataset: The dataset contains only {N} images, which inherently limits feature space coverage.")
    caveats.append("Heuristic estimate, not a guarantee: Domain coverage is calculated using visual feature proximity in DINOv2 space and should be verified alongside model evaluation.")

    # 8. 2D Projection (UMAP with PCA fallback)
    rng = np.random.RandomState(42)
    plot_max_pts = min(config.get("plot_max_points", 1500), N)

    # Build plot subset: MUST include all top-3 dataset neighbors of every sample
    mandatory_indices = list(top3_dataset_indices_set)
    if len(mandatory_indices) < plot_max_pts:
        remaining_candidates = [idx for idx in range(N) if idx not in top3_dataset_indices_set]
        needed = plot_max_pts - len(mandatory_indices)
        if remaining_candidates:
            sampled_remain = list(rng.choice(remaining_candidates, size=min(needed, len(remaining_candidates)), replace=False))
            selected_plot_indices = sorted(mandatory_indices + sampled_remain)
        else:
            selected_plot_indices = sorted(mandatory_indices)
    else:
        selected_plot_indices = sorted(mandatory_indices[:plot_max_pts])

    D_plot = D[selected_plot_indices]
    D_plot_paths = [dataset_paths[idx] for idx in selected_plot_indices]

    # Reducer persistence
    projections_dir = get_projections_dir()
    reducer_path = projections_dir / f"reducer_{dataset_id}_{checksum}.joblib"
    reducer = None
    projection_method = "umap"
    pca_fallback_below = config.get("pca_fallback_below_images", 30)

    if len(D_plot) < pca_fallback_below:
        projection_method = "pca"
        reducer = PCA(n_components=2, random_state=42)
        reducer.fit(D_plot)
    else:
        # Check if saved reducer exists
        if reducer_path.exists():
            try:
                cached_data = joblib.load(reducer_path)
                reducer = cached_data.get("reducer")
                projection_method = cached_data.get("method", "umap")
            except Exception as e:
                logger.warning(f"Failed to load cached reducer from {reducer_path}: {e}")
                reducer = None

        if reducer is None:
            # Try UMAP
            try:
                import umap
                umap_cfg = config.get("umap", {})
                n_neighbors = min(umap_cfg.get("n_neighbors", 15), len(D_plot) - 1)
                reducer = umap.UMAP(
                    n_neighbors=max(2, n_neighbors),
                    min_dist=umap_cfg.get("min_dist", 0.1),
                    metric=umap_cfg.get("metric", "cosine"),
                    random_state=umap_cfg.get("random_state", 42),
                    n_components=2,
                )
                reducer.fit(D_plot)
                projection_method = "umap"
                joblib.dump({"reducer": reducer, "method": "umap"}, reducer_path)
            except Exception as e:
                logger.warning(f"UMAP projection fit failed or unavailable ({e}). Using PCA(2) fallback.")
                projection_method = "pca"
                reducer = PCA(n_components=2, random_state=42)
                reducer.fit(D_plot)

    # Transform both datasets into the SAME 2D projection
    D_2d = reducer.transform(D_plot)
    S_2d = reducer.transform(S)

    # Normalize 2D points to SVG coordinate space [5, 95]
    all_x = np.concatenate([D_2d[:, 0], S_2d[:, 0]])
    all_y = np.concatenate([D_2d[:, 1], S_2d[:, 1]])
    x_min, x_max = float(np.min(all_x)), float(np.max(all_x))
    y_min, y_max = float(np.min(all_y)), float(np.max(all_y))
    x_span = (x_max - x_min) if (x_max - x_min) > 1e-6 else 1.0
    y_span = (y_max - y_min) if (y_max - y_min) > 1e-6 else 1.0

    # Project samples
    for i, s in enumerate(raw_samples):
        px = round(5.0 + ((float(S_2d[i, 0]) - x_min) / x_span) * 90.0, 2)
        py = round(95.0 - ((float(S_2d[i, 1]) - y_min) / y_span) * 90.0, 2)
        s["x"] = px
        s["y"] = py

    # Project dataset points
    dataset_points = []
    for j in range(len(D_plot)):
        px = round(5.0 + ((float(D_2d[j, 0]) - x_min) / x_span) * 90.0, 2)
        py = round(95.0 - ((float(D_2d[j, 1]) - y_min) / y_span) * 90.0, 2)
        p_path = D_plot_paths[j]
        class_lbl = extract_class_label(p_path, dataset.dataset_storage_path)
        dataset_points.append({
            "image_path": p_path,
            "x": px,
            "y": py,
            "class_label": class_lbl,
        })

    # 8.5 Build baseline points array for the target chart visualization
    baseline_points = []
    for j in range(len(baseline_indices)):
        orig_idx = int(baseline_indices[j])
        sim_val = round(float(baseline_distribution[j]), 4)
        p_path = dataset_paths[orig_idx]
        c_lbl = extract_class_label(p_path, dataset.dataset_storage_path)
        baseline_points.append({
            "similarity": sim_val,
            "class_label": c_lbl,
        })

    # 9. Build persisted result JSON payload (raw paths, no presigned URLs)
    result_payload = {
        "coverage_pct": coverage_pct,
        "verdict": verdict,
        "counts": {
            "total_samples": M,
            "covered_samples": covered_count,
            "uncovered_samples": M - covered_count,
            "dataset_images_evaluated": N,
            "plotted_dataset_points": len(dataset_points),
        },
        "baseline": {
            "median": baseline_median,
            "threshold": threshold,
            "percentile": covered_pctile,
        },
        "baseline_points": baseline_points,
        "mean_nearest_similarity": round(float(np.mean([s["nearest_similarity"] for s in raw_samples])), 4),
        "median_nearest_similarity": round(float(np.median([s["nearest_similarity"] for s in raw_samples])), 4),
        "centroid_similarity": centroid_similarity,
        "distribution_distance": distribution_distance,
        "caveats": caveats,
        "projection_method": projection_method,
        "samples": raw_samples,
        "dataset_points": dataset_points,
    }

    # Save to database cache
    try:
        existing_res = session.exec(
            select(DatasetDomainGapResult).where(
                DatasetDomainGapResult.dataset_id == dataset_id,
                DatasetDomainGapResult.sample_set_id == sample_set_id,
                DatasetDomainGapResult.file_list_checksum == checksum,
            )
        ).first()

        if existing_res:
            existing_res.result = result_payload
            existing_res.computed_at = datetime.utcnow()
            session.add(existing_res)
        else:
            new_res = DatasetDomainGapResult(
                dataset_id=dataset_id,
                sample_set_id=sample_set_id,
                file_list_checksum=checksum,
                computed_at=datetime.utcnow(),
                result=result_payload,
            )
            session.add(new_res)

        session.commit()
    except Exception as e:
        logger.error(f"Error saving domain gap result to database: {e}")
        session.rollback()

    # Return freshly signed URLs
    return attach_presigned_urls(result_payload)
