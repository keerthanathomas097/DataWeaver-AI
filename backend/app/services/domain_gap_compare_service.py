import json
import uuid
import hashlib
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple, Set

import numpy as np
from sqlmodel import Session, select

from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.models.domain_gap import (
    DomainSampleSet,
    DatasetDomainGapResult,
    WorkspaceDomainGapComparison,
)
from app.services import dataset_service
from app.services.vector_service import get_profiling_collection
from app.services.profiling_service import calculate_dataset_file_checksum, get_duplicate_statistics
from app.services.domain_gap_service import (
    compute_sample_dataset_similarities,
    compute_dataset_baseline,
    load_domain_gap_config,
    sign_url,
)

logger = logging.getLogger(__name__)

DEFAULT_COMPARE_CONFIG: Dict[str, Any] = {
    "require_duplicate_detection": True,
    "max_datasets": 12,
    "near_miss_margin": 0.10,
    "size_ratio_warning": 5,
    "default_reference": "median_of_dataset_cutoffs",
}


def load_domain_gap_compare_config() -> Dict[str, Any]:
    """Loads workspace domain gap comparison configuration with fallback to defaults."""
    cfg_path = Path(__file__).parent.parent.parent / "config" / "domain_gap_compare_config.json"
    if cfg_path.exists():
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                return {**DEFAULT_COMPARE_CONFIG, **loaded}
        except Exception as e:
            logger.warning(f"Failed to load domain_gap_compare_config.json: {e}. Using defaults.")
    return DEFAULT_COMPARE_CONFIG.copy()


def compute_comparison_signature(items: List[Tuple[uuid.UUID, str]]) -> str:
    """
    Computes a deterministic SHA-256 signature for a set of datasets and their file checksums.
    items: List of (dataset_id, file_list_checksum) tuples.
    """
    normalized = sorted([(str(d_id), str(chk)) for d_id, chk in items])
    encoded = json.dumps(normalized, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def evaluate_workspace_datasets_eligibility(
    session: Session,
    workspace_id: uuid.UUID,
    user_id: Optional[uuid.UUID] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Evaluates all datasets in a workspace for domain gap comparison eligibility.
    Returns: (eligible_datasets, ineligible_datasets)
    """
    if config is None:
        config = load_domain_gap_compare_config()

    require_dup = config.get("require_duplicate_detection", True)
    max_datasets = config.get("max_datasets", 12)

    # Fetch all datasets in workspace
    datasets_query = select(Dataset).where(Dataset.workspace_id == workspace_id)
    all_datasets = session.exec(datasets_query).all()

    eligible: List[Dict[str, Any]] = []
    ineligible: List[Dict[str, Any]] = []

    chroma_coll = None
    try:
        chroma_coll = get_profiling_collection()
    except Exception as e:
        logger.warning(f"Could not initialize chroma collection for eligibility checks: {e}")

    for ds in all_datasets:
        # Check storage path & count
        if not ds.dataset_storage_path or (ds.dataset_image_count or 0) <= 0:
            ineligible.append({
                "dataset_id": ds.dataset_id,
                "dataset_name": ds.dataset_name,
                "dataset_image_count": ds.dataset_image_count or 0,
                "reason": "no_images",
                "details": "Dataset has no images or storage path is missing.",
            })
            continue

        # Check profiling completed
        profiling = session.exec(
            select(DatasetProfilingResult)
            .where(DatasetProfilingResult.dataset_id == ds.dataset_id)
            .order_by(DatasetProfilingResult.computed_at.desc())
        ).first()

        if not profiling or profiling.status != "completed" or not profiling.profile_payload:
            ineligible.append({
                "dataset_id": ds.dataset_id,
                "dataset_name": ds.dataset_name,
                "dataset_image_count": ds.dataset_image_count or 0,
                "reason": "not_profiled",
                "details": "Dataset profiling has not been completed.",
            })
            continue

        # Check duplicate detection if required
        if require_dup:
            dup_stats = profiling.profile_payload.get("duplicates") or {}
            dup_completed = (
                ds.dataset_status == "duplicates_detected"
                or (isinstance(dup_stats, dict) and dup_stats.get("status") in ("completed", "duplicates_detected"))
                or (isinstance(dup_stats, dict) and dup_stats.get("duplicate_groups_count") is not None and dup_stats.get("status") != "not_run")
            )
            if not dup_completed:
                ineligible.append({
                    "dataset_id": ds.dataset_id,
                    "dataset_name": ds.dataset_name,
                    "dataset_image_count": ds.dataset_image_count or 0,
                    "reason": "duplicates_not_run",
                    "details": "Duplicate detection has not been completed for this dataset.",
                })
                continue

        # Check checksum
        checksum, image_paths, _ = calculate_dataset_file_checksum(ds.dataset_storage_path)
        if not checksum or not image_paths:
            ineligible.append({
                "dataset_id": ds.dataset_id,
                "dataset_name": ds.dataset_name,
                "dataset_image_count": ds.dataset_image_count or 0,
                "reason": "no_images",
                "details": "No valid image files found in dataset storage path.",
            })
            continue

        # Check embeddings in ChromaDB (profiling_embeddings collection)
        # Note: We do NOT generate missing embeddings here; we only check presence.
        has_embeddings = False
        if chroma_coll:
            try:
                recs = chroma_coll.get(where={"dataset_id": str(ds.dataset_id)}, limit=1)
                if recs and recs.get("ids") and len(recs["ids"]) > 0:
                    has_embeddings = True
            except Exception as e:
                logger.warning(f"Error querying ChromaDB for dataset {ds.dataset_id}: {e}")
                has_embeddings = False

        # Also consider valid if single-dataset domain gap result already exists for this checksum
        existing_single_result = session.exec(
            select(DatasetDomainGapResult).where(
                DatasetDomainGapResult.dataset_id == ds.dataset_id,
                DatasetDomainGapResult.file_list_checksum == checksum,
            )
        ).first()

        if not has_embeddings and not existing_single_result:
            ineligible.append({
                "dataset_id": ds.dataset_id,
                "dataset_name": ds.dataset_name,
                "dataset_image_count": ds.dataset_image_count or 0,
                "reason": "embeddings_missing",
                "details": "Profiling embeddings are missing from ChromaDB. Run single-dataset assessment or profiling to generate them.",
            })
            continue

        eligible.append({
            "dataset": ds,
            "dataset_id": ds.dataset_id,
            "dataset_name": ds.dataset_name,
            "dataset_image_count": ds.dataset_image_count or len(image_paths),
            "checksum": checksum,
            "image_paths": image_paths,
            "existing_result": existing_single_result.result if existing_single_result else None,
        })

    # Sort eligible deterministically by name
    eligible.sort(key=lambda x: x["dataset_name"].lower())

    # Apply max_datasets cap
    if len(eligible) > max_datasets:
        overflow = eligible[max_datasets:]
        eligible = eligible[:max_datasets]
        for item in overflow:
            ineligible.append({
                "dataset_id": item["dataset_id"],
                "dataset_name": item["dataset_name"],
                "dataset_image_count": item["dataset_image_count"],
                "reason": "max_datasets_exceeded",
                "details": f"Comparison is limited to {max_datasets} datasets. Dataset exceeded active comparison limit.",
            })

    return eligible, ineligible


def build_or_retrieve_comparison_matrix(
    session: Session,
    workspace_id: uuid.UUID,
    sample_set: DomainSampleSet,
    eligible_datasets: List[Dict[str, Any]],
    force_recompute: bool = False,
) -> Tuple[List[Dict[str, Any]], str, datetime]:
    """
    Retrieves or computes the (dataset x photo) similarity matrix.
    Reuses existing single-dataset cached results when available, or calculates
    dot products against stored Chroma embeddings (skipping UMAP projection).
    Returns: (matrix, signature, computed_at)
    """
    signature_items = [(e["dataset_id"], e["checksum"]) for e in eligible_datasets]
    sig = compute_comparison_signature(signature_items)

    if not force_recompute:
        cached_comp = session.exec(
            select(WorkspaceDomainGapComparison).where(
                WorkspaceDomainGapComparison.workspace_id == workspace_id,
                WorkspaceDomainGapComparison.sample_set_id == sample_set.sample_set_id,
                WorkspaceDomainGapComparison.signature == sig,
            )
        ).first()

        if cached_comp and cached_comp.matrix:
            return cached_comp.matrix, cached_comp.signature, cached_comp.computed_at

    # Compute comparison matrix
    config = load_domain_gap_config()
    chroma_coll = get_profiling_collection()

    sample_paths = sample_set.image_paths or []
    S = np.array(sample_set.embeddings, dtype=np.float32)
    if len(S) > 0:
        S_norms = np.linalg.norm(S, axis=1, keepdims=True)
        S = np.where(S_norms > 0, S / S_norms, S)

    matrix: List[Dict[str, Any]] = []

    for item in eligible_datasets:
        ds_id = item["dataset_id"]
        ds_name = item["dataset_name"]
        ds_count = item["dataset_image_count"]
        checksum = item["checksum"]
        existing_res = item.get("existing_result")

        # Fast path 1: Check if single-dataset result is already cached in tbl_dataset_domain_gap_results
        if not existing_res:
            cached_single = session.exec(
                select(DatasetDomainGapResult).where(
                    DatasetDomainGapResult.dataset_id == ds_id,
                    DatasetDomainGapResult.sample_set_id == sample_set.sample_set_id,
                    DatasetDomainGapResult.file_list_checksum == checksum,
                )
            ).first()
            if cached_single and cached_single.result:
                existing_res = cached_single.result

        if existing_res and "baseline" in existing_res and "samples" in existing_res:
            cutoff = existing_res.get("baseline", {}).get("threshold")
            baseline_median = existing_res.get("baseline", {}).get("median")
            per_photo = []
            for s in existing_res.get("samples", []):
                idx = s.get("index", 0)
                nearest_item = s.get("nearest", [{}])[0] if s.get("nearest") else {}
                per_photo.append({
                    "sample_index": idx,
                    "sample_path": sample_paths[idx] if idx < len(sample_paths) else s.get("image_path", ""),
                    "similarity": round(float(s.get("nearest_similarity", nearest_item.get("similarity", 0.0))), 4),
                    "nearest_image_path": nearest_item.get("image_path", ""),
                })

            matrix.append({
                "dataset_id": str(ds_id),
                "dataset_name": ds_name,
                "dataset_image_count": ds_count,
                "cutoff": round(float(cutoff), 4) if cutoff is not None else None,
                "baseline_median": round(float(baseline_median), 4) if baseline_median is not None else None,
                "per_photo": per_photo,
            })
            continue

        # Fast path 2: Query ChromaDB embeddings directly (dot-product & baseline, no UMAP)
        records = chroma_coll.get(
            where={"dataset_id": str(ds_id)},
            include=["embeddings", "metadatas"],
        )

        if not records or not records.get("ids") or len(records["ids"]) == 0:
            logger.warning(f"No ChromaDB embeddings found for dataset {ds_id}")
            continue

        embeddings_map = {}
        for rid, emb, meta in zip(records["ids"], records["embeddings"], records["metadatas"]):
            img_p = meta.get("image_path") if meta else None
            if img_p:
                embeddings_map[img_p] = emb

        image_paths = item.get("image_paths", [])
        dataset_paths = [p for p in image_paths if p in embeddings_map]
        if not dataset_paths:
            # Fallback to whatever paths were returned in metadata
            dataset_paths = list(embeddings_map.keys())

        if not dataset_paths:
            continue

        D = np.array([embeddings_map[p] for p in dataset_paths], dtype=np.float32)
        D_norms = np.linalg.norm(D, axis=1, keepdims=True)
        D = np.where(D_norms > 0, D / D_norms, D)

        raw_samples, _ = compute_sample_dataset_similarities(
            S=S, D=D, dataset_paths=dataset_paths, sample_paths=sample_paths
        )
        cutoff, baseline_median, _, _ = compute_dataset_baseline(
            D=D, config=config, rng_seed=42
        )

        per_photo = []
        for s in raw_samples:
            idx = s["index"]
            nearest_item = s["nearest"][0] if s["nearest"] else {}
            per_photo.append({
                "sample_index": idx,
                "sample_path": sample_paths[idx] if idx < len(sample_paths) else "",
                "similarity": s["nearest_similarity"],
                "nearest_image_path": nearest_item.get("image_path", ""),
            })

        matrix.append({
            "dataset_id": str(ds_id),
            "dataset_name": ds_name,
            "dataset_image_count": ds_count,
            "cutoff": round(float(cutoff), 4),
            "baseline_median": round(float(baseline_median), 4),
            "per_photo": per_photo,
        })

    # Save or update cache in tbl_workspace_domain_gap_comparisons
    now = datetime.utcnow()
    existing_rec = session.exec(
        select(WorkspaceDomainGapComparison).where(
            WorkspaceDomainGapComparison.workspace_id == workspace_id,
            WorkspaceDomainGapComparison.sample_set_id == sample_set.sample_set_id,
            WorkspaceDomainGapComparison.signature == sig,
        )
    ).first()

    if existing_rec:
        existing_rec.matrix = matrix
        existing_rec.computed_at = now
        session.add(existing_rec)
    else:
        new_rec = WorkspaceDomainGapComparison(
            workspace_id=workspace_id,
            sample_set_id=sample_set.sample_set_id,
            signature=sig,
            matrix=matrix,
            computed_at=now,
            created_at=now,
        )
        session.add(new_rec)

    session.commit()
    return matrix, sig, now


def derive_comparison_metrics(
    matrix: List[Dict[str, Any]],
    sample_set: DomainSampleSet,
    requested_reference: Optional[float] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Derives all comparison metrics, rankings, caveats, and greedy combined coverage
    from the stored similarity matrix and reference cutoff.
    """
    if config is None:
        config = load_domain_gap_compare_config()

    sample_paths = sample_set.image_paths or []
    sample_count = len(sample_paths)
    near_miss_margin = config.get("near_miss_margin", 0.10)
    size_ratio_limit = config.get("size_ratio_warning", 5)

    # 1. Determine reference cutoffs
    cutoffs = [entry["cutoff"] for entry in matrix if entry.get("cutoff") is not None]
    if cutoffs:
        ref_min = round(float(np.min(cutoffs)), 4)
        ref_max = round(float(np.max(cutoffs)), 4)
        default_ref = round(float(np.median(cutoffs)), 4)
    else:
        ref_min = 0.50
        ref_max = 0.90
        default_ref = 0.70

    if requested_reference is not None:
        reference_similarity = round(float(requested_reference), 4)
    else:
        reference_similarity = default_ref

    near_miss_threshold = round(reference_similarity - near_miss_margin, 4)

    # 2. Per-dataset derived metrics
    valid_counts = [e.get("dataset_image_count", 0) for e in matrix if e.get("dataset_image_count", 0) > 0]
    min_count = min(valid_counts) if valid_counts else 0
    max_count = max(valid_counts) if valid_counts else 0

    evaluated_candidates: List[Dict[str, Any]] = []

    for entry in matrix:
        ds_id = entry["dataset_id"]
        ds_name = entry["dataset_name"]
        ds_count = entry.get("dataset_image_count", 0)
        cutoff = entry.get("cutoff")
        base_median = entry.get("baseline_median")
        raw_per_photo = entry.get("per_photo", [])

        sims = [p.get("similarity", 0.0) for p in raw_per_photo]
        n_photos = len(sims) or sample_count or 1

        median_sim = round(float(np.median(sims)), 4) if sims else 0.0
        mean_sim = round(float(np.mean(sims)), 4) if sims else 0.0

        covered_count = sum(1 for s in sims if s >= reference_similarity)
        near_miss_count = sum(1 for s in sims if near_miss_threshold <= s < reference_similarity)
        far_count = sum(1 for s in sims if s < near_miss_threshold)

        cov_pct = round(100.0 * covered_count / n_photos, 1)
        near_pct = round(100.0 * near_miss_count / n_photos, 1)
        far_pct = round(100.0 * far_count / n_photos, 1)

        # Own cutoff evaluation
        own_cov_count = sum(1 for s in sims if s >= (cutoff if cutoff is not None else reference_similarity))
        own_cov_pct = round(100.0 * own_cov_count / n_photos, 1)

        # Size warning
        size_warning = None
        if len(valid_counts) > 1 and ds_count > 0 and min_count > 0:
            if ds_count >= size_ratio_limit * min_count:
                size_warning = f"Dataset is {round(ds_count / min_count, 1)}x larger than the smallest evaluated dataset ({min_count} images), which may give it a nearest-neighbor retrieval advantage."
            elif max_count >= size_ratio_limit * ds_count:
                size_warning = f"Dataset is {round(max_count / ds_count, 1)}x smaller than the largest evaluated dataset ({max_count} images)."

        # Attach presigned URLs to photo items
        formatted_per_photo = []
        for p in raw_per_photo:
            s_path = p.get("sample_path", "")
            n_path = p.get("nearest_image_path", "")
            formatted_per_photo.append({
                "sample_index": p.get("sample_index", 0),
                "sample_path": s_path,
                "sample_url": sign_url(s_path) if s_path else None,
                "similarity": p.get("similarity", 0.0),
                "nearest_image_path": n_path,
                "nearest_image_url": sign_url(n_path) if n_path else None,
            })

        evaluated_candidates.append({
            "dataset_id": ds_id,
            "dataset_name": ds_name,
            "dataset_image_count": ds_count,
            "cutoff": cutoff,
            "baseline_median": base_median,
            "median_similarity": median_sim,
            "mean_similarity": mean_sim,
            "covered_count": covered_count,
            "near_miss_count": near_miss_count,
            "far_count": far_count,
            "coverage_pct": cov_pct,
            "near_miss_pct": near_pct,
            "far_pct": far_pct,
            "own_cutoff_covered_count": own_cov_count,
            "own_cutoff_coverage_pct": own_cov_pct,
            "size_warning": size_warning,
            "per_photo": formatted_per_photo,
        })

    # 3. Deterministic ranking:
    # Sort primarily by median_similarity DESC, then covered_count DESC, then dataset_name ASC
    evaluated_candidates.sort(
        key=lambda x: (-x["median_similarity"], -x["covered_count"], x["dataset_name"].lower())
    )

    for i, c in enumerate(evaluated_candidates):
        c["rank"] = i + 1

    # 4. Greedy combined coverage (up to 3 datasets)
    combined_steps = []
    if evaluated_candidates and sample_count > 0:
        uncovered_indices = set(range(sample_count))
        cumulative_covered = set()
        pool = list(evaluated_candidates)

        for step_idx in range(1, min(4, len(evaluated_candidates) + 1)):
            best_addition_ds = None
            best_new_covered = set()

            for cand in pool:
                # Which of uncovered_indices are covered by cand at reference_similarity?
                cov_for_cand = {
                    p["sample_index"]
                    for p in cand["per_photo"]
                    if p["sample_index"] in uncovered_indices and p["similarity"] >= reference_similarity
                }
                if len(cov_for_cand) > len(best_new_covered):
                    best_new_covered = cov_for_cand
                    best_addition_ds = cand

            # If no additional coverage can be gained after step 1, break
            if not best_addition_ds or (step_idx > 1 and len(best_new_covered) == 0):
                break

            cumulative_covered.update(best_new_covered)
            uncovered_indices.difference_update(best_new_covered)
            pool.remove(best_addition_ds)

            cum_pct = round(100.0 * len(cumulative_covered) / sample_count, 1)
            combined_steps.append({
                "step": step_idx,
                "dataset_id": best_addition_ds["dataset_id"],
                "dataset_name": best_addition_ds["dataset_name"],
                "newly_covered_count": len(best_new_covered),
                "cumulative_covered_count": len(cumulative_covered),
                "cumulative_coverage_pct": cum_pct,
            })

    # 5. Summary sentence
    best_id = None
    best_name = None
    if evaluated_candidates:
        best = evaluated_candidates[0]
        best_id = best["dataset_id"]
        best_name = best["dataset_name"]
        summary = (
            f"{best_name} provides the strongest coverage for your real-world photos "
            f"({best['coverage_pct']}% covered at reference cutoff {reference_similarity:.2f}, "
            f"median similarity {best['median_similarity']:.2f})."
        )
        if len(evaluated_candidates) > 1:
            runner_up = evaluated_candidates[1]
            summary += (
                f" {runner_up['dataset_name']} is the closest alternative with "
                f"{runner_up['coverage_pct']}% coverage."
            )
    else:
        summary = "No eligible datasets available for workspace domain gap comparison."

    # 6. Caveats
    caveats = []
    if sample_count < 10:
        caveats.append(
            f"Small sample set ({sample_count} photos evaluated). We recommend 10 to 30 real-world photos for robust domain comparison."
        )
    if any(c.get("size_warning") for c in evaluated_candidates):
        caveats.append(
            f"Dataset size variation exceeds {size_ratio_limit}x across candidates; larger datasets have more candidate images and may display slightly higher nearest-neighbor similarities."
        )
    caveats.append(
        "Embeddings reflect visual feature similarity from DINOv2 and should be validated alongside downstream task accuracy."
    )

    # 7. Sample photos list with URLs
    sample_photos = [
        {
            "index": i,
            "path": p,
            "url": sign_url(p) if p else None,
        }
        for i, p in enumerate(sample_paths)
    ]

    return {
        "reference_similarity": reference_similarity,
        "reference_min": ref_min,
        "reference_max": ref_max,
        "default_reference": default_ref,
        "near_miss_margin": near_miss_margin,
        "near_miss_threshold": near_miss_threshold,
        "best_match_dataset_id": best_id,
        "best_match_dataset_name": best_name,
        "summary_sentence": summary,
        "ranked_datasets": evaluated_candidates,
        "combined_coverage": combined_steps,
        "caveats": caveats,
        "sample_photos": sample_photos,
    }
