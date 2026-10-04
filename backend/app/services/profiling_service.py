import io
import uuid
import hashlib
import datetime
from collections import Counter
from typing import Dict, List, Optional, Any, Tuple, Union
import numpy as np
from PIL import Image
import scipy.ndimage
from sklearn.cluster import DBSCAN
from sklearn.metrics import silhouette_score
from sqlmodel import Session, select

from app.database import engine
from app.config import settings
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.profiling import DatasetProfilingResult
from app.services.storage_service import minio_client, get_image_bytes, get_image_as_pil
from app.services.profiling_embedding_service import get_or_create_profiling_embeddings
from app.services.discovery_service import groq_client
import json

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff")


def calculate_dataset_file_checksum(dataset_storage_path: str) -> Tuple[str, List[str], int]:
    """
    Scans MinIO recursively for image files under dataset_storage_path,
    sorts them deterministically by object name, and produces a stable SHA-256 checksum:
        SHA256(";".join(f"{name}:{etag}:{size}" for sorted entries))
    Returns:
        (checksum_hex, image_paths_list, total_bytes)
    """
    if not dataset_storage_path:
        return "", [], 0

    objects = minio_client.list_objects(
        settings.minio_bucket_name,
        prefix=dataset_storage_path,
        recursive=True,
    )

    image_entries = []
    total_bytes = 0

    for obj in objects:
        name_lower = obj.object_name.lower()
        if any(name_lower.endswith(ext) for ext in IMAGE_EXTENSIONS):
            etag = obj.etag.strip('"') if obj.etag else ""
            size = obj.size or 0
            total_bytes += size
            image_entries.append((obj.object_name, etag, size))

    image_entries.sort(key=lambda x: x[0])
    image_paths = [x[0] for x in image_entries]

    hash_source = ";".join(f"{name}:{etag}:{size}" for name, etag, size in image_entries)
    checksum = hashlib.sha256(hash_source.encode("utf-8")).hexdigest()

    return checksum, image_paths, total_bytes


def extract_basic_image_stats(image_paths: List[str], batch_size: int = 32) -> Dict[str, Any]:
    """
    Streams image files from MinIO, computing width, height, resolution,
    aspect ratio, file size, format, color mode, and channel distributions.
    Releases memory after each image to avoid excessive RAM consumption.
    """
    total_count = len(image_paths)
    if total_count == 0:
        return {
            "total_images": 0,
            "readable_images": 0,
            "corrupt_images": 0,
            "formats": {},
            "color_modes": {},
            "channels": {},
            "dimensions": {},
            "aspect_ratios": {},
            "file_sizes_bytes": {},
        }

    widths = []
    heights = []
    aspect_ratios = []
    resolutions = []
    file_sizes = []
    formats = Counter()
    color_modes = Counter()
    channels_count = Counter()
    corrupt_images = 0

    aspect_bins = {"portrait": 0, "square": 0, "landscape": 0}

    for path in image_paths:
        data = get_image_bytes(path)
        if data is None:
            corrupt_images += 1
            continue

        size_bytes = len(data)
        file_sizes.append(size_bytes)

        try:
            with Image.open(io.BytesIO(data)) as img:
                w, h = img.size
                fmt = (img.format or "UNKNOWN").upper()
                mode = img.mode or "UNKNOWN"
                ch = len(img.getbands())

                widths.append(w)
                heights.append(h)
                res = w * h
                resolutions.append(res)
                ar = round(w / float(h), 2) if h > 0 else 1.0
                aspect_ratios.append(ar)

                if ar < 0.85:
                    aspect_bins["portrait"] += 1
                elif ar <= 1.15:
                    aspect_bins["square"] += 1
                else:
                    aspect_bins["landscape"] += 1

                formats[fmt] += 1
                color_modes[mode] += 1
                channels_count[ch] += 1
        except Exception as e:
            print(f"Error parsing image {path} for basic stats: {e}")
            corrupt_images += 1

    readable_count = len(widths)

    def calc_num_stats(arr: List[float | int]) -> Dict[str, float]:
        if not arr:
            return {"min": 0.0, "max": 0.0, "mean": 0.0, "std": 0.0}
        np_arr = np.array(arr, dtype=np.float64)
        return {
            "min": round(float(np.min(np_arr)), 2),
            "max": round(float(np.max(np_arr)), 2),
            "mean": round(float(np.mean(np_arr)), 2),
            "std": round(float(np.std(np_arr)), 2),
        }

    return {
        "total_images": total_count,
        "readable_images": readable_count,
        "corrupt_images": corrupt_images,
        "dimensions": {
            "width": calc_num_stats(widths),
            "height": calc_num_stats(heights),
            "resolution": calc_num_stats(resolutions),
        },
        "aspect_ratios": {
            "stats": calc_num_stats(aspect_ratios),
            "categories": aspect_bins,
        },
        "file_sizes_bytes": {
            "total_bytes": int(sum(file_sizes)),
            "stats": calc_num_stats(file_sizes),
        },
        "formats": dict(formats),
        "color_modes": dict(color_modes),
        "channels": dict(channels_count),
    }


def calculate_quality_metrics(
    image_paths: List[str],
    blur_threshold: float = 100.0,
    under_exposure_pct_threshold: float = 25.0,
    over_exposure_pct_threshold: float = 25.0,
    max_flagged_samples: int = 25,
) -> Dict[str, Any]:
    """
    Computes heuristic quality metrics using SciPy and NumPy:
    - Laplacian variance for blur detection (scipy.ndimage.laplace)
    - Mean luminance for brightness
    - Luminance std for contrast
    - Low-intensity (<15) and high-intensity (>240) clipping percentages for exposure
    Returns aggregated quality distributions and flagged image references.
    """
    laplacian_vars = []
    brightnesses = []
    contrasts = []

    blurred_count = 0
    under_exposed_count = 0
    over_exposed_count = 0
    normal_count = 0
    flagged_images = []

    for path in image_paths:
        data = get_image_bytes(path)
        if data is None:
            continue

        try:
            with Image.open(io.BytesIO(data)) as img:
                # Convert to grayscale for illumination and edge analysis
                gray = np.array(img.convert("L"), dtype=np.float64)

                # 1. Blur via discrete Laplacian variance
                lap = scipy.ndimage.laplace(gray)
                var_lap = float(np.var(lap))
                laplacian_vars.append(var_lap)

                # 2. Brightness (mean) and Contrast (std)
                mean_lum = float(np.mean(gray))
                std_lum = float(np.std(gray))
                brightnesses.append(mean_lum)
                contrasts.append(std_lum)

                # 3. Exposure clipping
                total_px = float(gray.size)
                under_pct = float(np.sum(gray < 15.0) / total_px * 100.0)
                over_pct = float(np.sum(gray > 240.0) / total_px * 100.0)

                issues = []
                if var_lap < blur_threshold:
                    blurred_count += 1
                    issues.append(f"blur (var: {round(var_lap, 1)})")
                if under_pct >= under_exposure_pct_threshold:
                    under_exposed_count += 1
                    issues.append(f"underexposed ({round(under_pct, 1)}% dark)")
                if over_pct >= over_exposure_pct_threshold:
                    over_exposed_count += 1
                    issues.append(f"overexposed ({round(over_pct, 1)}% clipped)")

                if not issues:
                    normal_count += 1
                else:
                    if len(flagged_images) < max_flagged_samples:
                        flagged_images.append({
                            "image_path": path,
                            "issues": issues,
                            "laplacian_var": round(var_lap, 2),
                            "brightness": round(mean_lum, 2),
                            "contrast": round(std_lum, 2),
                        })
        except Exception as e:
            print(f"Error calculating quality for {path}: {e}")

    def calc_stats(arr: List[float]) -> Dict[str, float]:
        if not arr:
            return {"min": 0.0, "max": 0.0, "mean": 0.0, "std": 0.0}
        npa = np.array(arr)
        return {
            "min": round(float(np.min(npa)), 2),
            "max": round(float(np.max(npa)), 2),
            "mean": round(float(np.mean(npa)), 2),
            "std": round(float(np.std(npa)), 2),
        }

    total_evaluated = len(laplacian_vars)
    return {
        "evaluated_images": total_evaluated,
        "counts": {
            "blurred": blurred_count,
            "under_exposed": under_exposed_count,
            "over_exposed": over_exposed_count,
            "normal": normal_count,
        },
        "percentages": {
            "blurred_pct": round(blurred_count / total_evaluated * 100.0, 2) if total_evaluated else 0.0,
            "under_exposed_pct": round(under_exposed_count / total_evaluated * 100.0, 2) if total_evaluated else 0.0,
            "over_exposed_pct": round(over_exposed_count / total_evaluated * 100.0, 2) if total_evaluated else 0.0,
            "normal_pct": round(normal_count / total_evaluated * 100.0, 2) if total_evaluated else 0.0,
        },
        "laplacian_variance": calc_stats(laplacian_vars),
        "brightness": calc_stats(brightnesses),
        "contrast": calc_stats(contrasts),
        "thresholds": {
            "blur_laplacian_threshold": blur_threshold,
            "under_exposure_pct_threshold": under_exposure_pct_threshold,
            "over_exposure_pct_threshold": over_exposure_pct_threshold,
            "type": "heuristic",
        },
        "flagged_samples": flagged_images,
    }


def get_duplicate_statistics(session: Session, dataset_id: uuid.UUID) -> Dict[str, Any]:
    """
    Reads existing deduplication tables (tbl_dataset_duplicate_groups and
    tbl_dataset_duplicate_group_images) for the specified dataset.
    Returns 'not_yet_computed' if deduplication has not run, avoiding failure.
    """
    dataset = session.get(Dataset, dataset_id)
    if not dataset:
        return {"status": "dataset_not_found"}

    # Query duplicate groups for this dataset
    groups = session.exec(
        select(DatasetDuplicateGroup).where(DatasetDuplicateGroup.dataset_id == dataset_id)
    ).all()

    if not groups:
        if dataset.dataset_status != "duplicates_detected":
            return {
                "status": "not_yet_computed",
                "message": "Duplicate detection has not yet been executed for this dataset.",
            }
        else:
            return {
                "status": "completed",
                "duplicate_groups_count": 0,
                "affected_images_count": 0,
                "duplicate_ratio": 0.0,
                "near_duplicates_count": 0,
                "exact_duplicates_count": 0,
            }

    group_ids = [g.duplicate_group_id for g in groups]
    images = session.exec(
        select(DatasetDuplicateGroupImage).where(
            DatasetDuplicateGroupImage.duplicate_group_id.in_(group_ids)
        )
    ).all()

    total_affected = len(images)
    exact_groups = sum(1 for g in groups if g.duplicate_group_detection_method == "exact_hash")
    near_groups = sum(1 for g in groups if g.duplicate_group_detection_method != "exact_hash")

    total_images_in_dataset = dataset.dataset_image_count or max(total_affected, 1)
    duplicate_ratio = round(total_affected / float(total_images_in_dataset), 4)

    return {
        "status": "completed",
        "duplicate_groups_count": len(groups),
        "affected_images_count": total_affected,
        "duplicate_ratio": duplicate_ratio,
        "exact_duplicate_groups": exact_groups,
        "near_duplicate_groups": near_groups,
    }


def calculate_label_distribution(image_paths: List[str], dataset_storage_path: str) -> Dict[str, Any]:
    """
    Infers class labels from directory structures under dataset_storage_path.
    If subfolders are detected (e.g. datasets/.../class_name/img.jpg), counts
    per class and calculates imbalance metrics.
    If images are flat, returns status 'unavailable'.
    """
    if not image_paths or not dataset_storage_path:
        return {"status": "unavailable", "reason": "No image paths provided"}

    prefix = dataset_storage_path.rstrip("/") + "/"
    class_counts = Counter()
    subfolder_count = 0

    for path in image_paths:
        if path.startswith(prefix):
            rel = path[len(prefix):]
        else:
            rel = path

        parts = rel.split("/")
        if len(parts) > 1:
            # Subfolder exists (e.g. ['class_a', 'sub', 'img.png'] -> 'class_a')
            cls_name = parts[0]
            class_counts[cls_name] += 1
            subfolder_count += 1

    # Require at least 70% of images to reside in subdirectories to consider them classes
    if subfolder_count < len(image_paths) * 0.7 or len(class_counts) <= 1:
        return {
            "status": "unavailable",
            "reason": "No folder-based class taxonomy detected in dataset storage path.",
        }

    counts = list(class_counts.values())
    num_classes = len(class_counts)
    total_labeled = sum(counts)

    min_c = min(counts)
    max_c = max(counts)
    std_c = round(float(np.std(counts)), 2)
    max_min_ratio = round(max_c / float(min_c), 2) if min_c > 0 else None

    # Imbalance classification
    if max_min_ratio is not None:
        if max_min_ratio <= 1.5:
            balance_indicator = "well_balanced"
        elif max_min_ratio <= 4.0:
            balance_indicator = "moderately_imbalanced"
        else:
            balance_indicator = "heavily_imbalanced"
    else:
        balance_indicator = "indeterminate"

    class_percentages = {
        cls_name: round(cnt / float(total_labeled) * 100.0, 2)
        for cls_name, cnt in class_counts.most_common()
    }

    return {
        "status": "available",
        "num_classes": num_classes,
        "total_labeled_images": total_labeled,
        "class_counts": dict(class_counts.most_common()),
        "class_percentages": class_percentages,
        "metrics": {
            "count_std": std_c,
            "max_class_count": max_c,
            "min_class_count": min_c,
            "max_to_min_ratio": max_min_ratio,
            "balance_indicator": balance_indicator,
        },
    }


def calculate_clustering_statistics(
    embeddings_map: Dict[str, List[float]],
    eps: float = 0.35,
    min_samples: int = 2,
) -> Dict[str, Any]:
    """
    Performs DBSCAN clustering over DINOv2 embeddings (768-dim, L2-normalized).
    Calculates number of visual clusters, noise/outlier count, noise ratio,
    and silhouette score (if valid conditions are met).
    """
    total_samples = len(embeddings_map)
    if total_samples < 3:
        return {
            "status": "insufficient_data",
            "cluster_count": 0,
            "noise_count": total_samples,
            "noise_ratio": 1.0,
            "silhouette_score": None,
            "cluster_size_distribution": [],
            "note": "At least 3 embeddings are required for clustering.",
        }

    # Convert to float32 matrix
    X = np.array(list(embeddings_map.values()), dtype=np.float32)

    # DBSCAN with cosine distance
    db = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
    db.fit(X)
    labels = db.labels_

    unique_labels = set(labels)
    clusters = [lbl for lbl in unique_labels if lbl != -1]
    cluster_count = len(clusters)
    noise_count = int(np.sum(labels == -1))
    noise_ratio = round(noise_count / float(total_samples), 4)

    cluster_counts = Counter(labels)
    cluster_sizes = [count for lbl, count in cluster_counts.items() if lbl != -1]
    cluster_sizes.sort(reverse=True)

    # Silhouette score: requires at least 2 non-noise clusters and sufficient core samples
    non_noise_mask = labels != -1
    non_noise_count = int(np.sum(non_noise_mask))
    computed_silhouette = None

    if cluster_count >= 2 and non_noise_count > cluster_count:
        try:
            score = silhouette_score(
                X[non_noise_mask],
                labels[non_noise_mask],
                metric="cosine",
            )
            computed_silhouette = round(float(score), 4)
        except Exception as e:
            print(f"Error computing silhouette score: {e}")
            computed_silhouette = None

    return {
        "status": "completed",
        "parameters": {
            "eps": eps,
            "min_samples": min_samples,
            "metric": "cosine",
        },
        "total_samples": total_samples,
        "cluster_count": cluster_count,
        "noise_count": noise_count,
        "noise_ratio": noise_ratio,
        "cluster_size_distribution": cluster_sizes,
        "silhouette_score": computed_silhouette,
        "interpretation_note": (
            "Clusters represent groups of visually similar images in DINOv2 feature space. "
            "Silhouette score reflects cluster cohesion and separation; it is not a direct ground-truth accuracy metric."
        ),
    }


def extract_llm_metadata(
    dataset_storage_path: str,
    user_description: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extracts high-level dataset metadata (stated purpose, collection method, known limitations)
    using the existing Groq client (LLaMA 3.3 70B).
    Reads README or metadata files from MinIO if present, falling back to user_description.
    Gracefully handles failure without breaking the overall profiling pipeline.
    """
    text_content = ""

    # Check MinIO storage prefix for documentation files
    doc_candidates = ("readme.md", "readme.txt", "readme", "metadata.json", "dataset-metadata.json")
    try:
        objects = minio_client.list_objects(
            settings.minio_bucket_name,
            prefix=dataset_storage_path,
            recursive=True,
        )
        for obj in objects:
            filename = obj.object_name.split("/")[-1].lower()
            if filename in doc_candidates:
                data = get_image_bytes(obj.object_name)
                if data:
                    text_content = data.decode("utf-8", errors="ignore")[:7000]
                    print(f"Found dataset documentation file: {obj.object_name}")
                    break
    except Exception as e:
        print(f"Error checking MinIO for documentation files: {e}")

    # Fallback to user description if MinIO documentation was not found
    if not text_content and user_description:
        text_content = user_description.strip()[:7000]

    if not text_content or len(text_content) < 15:
        return {
            "status": "unavailable",
            "message": "No README or documentation text was found for AI metadata extraction.",
            "stated_purpose": None,
            "collection_method": None,
            "known_limitations": None,
        }

    prompt = f"""You are an expert AI dataset curation researcher.
Extract structured metadata from the following dataset documentation.
Return ONLY valid JSON, with no explanation or backticks, in this exact format:
{{
  "stated_purpose": "<clear 1-2 sentence description of what the dataset was created for, or null if unknown>",
  "collection_method": "<clear 1-2 sentence description of how images were acquired, captured, or labeled, or null if unknown>",
  "known_limitations": "<clear 1-2 sentence summary of documented biases, class imbalances, or hardware constraints, or null if unknown>"
}}

Documentation text:
\"\"\"{text_content}\"\"\"
"""
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
        raw_output = response.choices[0].message.content.strip()
        cleaned_json = raw_output.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(cleaned_json)
        return {
            "status": "completed",
            "stated_purpose": parsed.get("stated_purpose"),
            "collection_method": parsed.get("collection_method"),
            "known_limitations": parsed.get("known_limitations"),
            "source": "groq_llama_3.3_70b",
        }
    except Exception as e:
        print(f"LLM metadata extraction failed: {e}")
        return {
            "status": "failed",
            "message": f"Extraction could not be completed: {str(e)}",
            "stated_purpose": None,
            "collection_method": None,
            "known_limitations": None,
        }


def check_profiling_cancellation(dataset_id: uuid.UUID) -> bool:
    """Checks whether the profiling run has been cancelled by the user."""
    with Session(engine) as session:
        record = session.exec(
            select(DatasetProfilingResult)
            .where(DatasetProfilingResult.dataset_id == dataset_id)
            .order_by(DatasetProfilingResult.computed_at.desc())
        ).first()
        if record and record.status == "cancelled":
            return True
    return False


def build_profile_payload(
    dataset: Union[Dataset, Dict[str, Any]],
    checksum: str,
    basic_stats: Dict[str, Any],
    quality: Dict[str, Any],
    duplicates: Dict[str, Any],
    labels: Dict[str, Any],
    diversity: Dict[str, Any],
    metadata_insights: Dict[str, Any],
) -> Dict[str, Any]:
    """Combines all analysis sections into a structured profile payload."""
    if isinstance(dataset, dict):
        dataset_section = {
            "dataset_id": str(dataset.get("dataset_id", "")),
            "workspace_id": str(dataset.get("workspace_id")) if dataset.get("workspace_id") else None,
            "dataset_name": dataset.get("dataset_name"),
            "dataset_source_type": dataset.get("dataset_source_type"),
            "dataset_source_url": dataset.get("dataset_source_url"),
            "dataset_license": dataset.get("dataset_license"),
            "dataset_image_count": dataset.get("dataset_image_count"),
            "dataset_storage_path": dataset.get("dataset_storage_path"),
            "dataset_domain": dataset.get("dataset_domain"),
            "file_list_checksum": checksum,
        }
    else:
        dataset_section = {
            "dataset_id": str(dataset.dataset_id),
            "workspace_id": str(dataset.workspace_id) if dataset.workspace_id else None,
            "dataset_name": dataset.dataset_name,
            "dataset_source_type": dataset.dataset_source_type,
            "dataset_source_url": dataset.dataset_source_url,
            "dataset_license": dataset.dataset_license,
            "dataset_image_count": dataset.dataset_image_count,
            "dataset_storage_path": dataset.dataset_storage_path,
            "dataset_domain": dataset.dataset_domain,
            "file_list_checksum": checksum,
        }

    return {
        "profiling_version": "1.0",
        "computed_at": datetime.datetime.utcnow().isoformat(),
        "dataset": dataset_section,
        "basic_statistics": basic_stats,
        "quality": quality,
        "duplicates": duplicates,
        "labels": labels,
        "diversity": diversity,
        "metadata_insights": metadata_insights,
    }


def run_profiling_pipeline(
    dataset_id: uuid.UUID,
    user_description: Optional[str] = None,
    eps: float = 0.35,
    min_samples: int = 2,
):
    """
    Background Task pipeline orchestrating complete dataset profiling.
    Follows established project patterns for background execution, cancellation,
    and progress tracking in tbl_dataset_profiling_results.
    """
    print(f"Starting Dataset Profiling pipeline for dataset: {dataset_id}")

    with Session(engine) as session:
        dataset = session.get(Dataset, dataset_id)
        if not dataset:
            print(f"Profiling failed: Dataset {dataset_id} not found.")
            return

        if not dataset.dataset_storage_path:
            print(f"Profiling failed: Dataset {dataset_id} has no storage path.")
            return

        # Extract primitive attributes and metadata dictionary before session closes / commit occurs
        dataset_storage_path = str(dataset.dataset_storage_path)
        dataset_info = {
            "dataset_id": str(dataset.dataset_id),
            "workspace_id": str(dataset.workspace_id) if dataset.workspace_id else None,
            "dataset_name": dataset.dataset_name,
            "dataset_source_type": dataset.dataset_source_type,
            "dataset_source_url": dataset.dataset_source_url,
            "dataset_license": dataset.dataset_license,
            "dataset_image_count": dataset.dataset_image_count,
            "dataset_storage_path": dataset.dataset_storage_path,
            "dataset_domain": dataset.dataset_domain,
        }

        # Create or update active profiling record
        profiling_record = DatasetProfilingResult(
            dataset_id=dataset_id,
            file_list_checksum="in_progress",
            status="profiling",
            profile_payload={"stage": "initializing"},
        )
        session.add(profiling_record)
        session.commit()
        session.refresh(profiling_record)
        profiling_id = profiling_record.profiling_id

    try:
        # Stage 1: Checksum & File Enumeration
        if check_profiling_cancellation(dataset_id):
            return

        checksum, image_paths, total_bytes = calculate_dataset_file_checksum(dataset_storage_path)
        print(f"Dataset {dataset_id}: Found {len(image_paths)} images, checksum: {checksum[:12]}...")

        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.file_list_checksum = checksum
                rec.profile_payload = {"stage": "calculating_basic_stats"}
                session.add(rec)
                session.commit()

        # Stage 2: Basic Image Statistics
        if check_profiling_cancellation(dataset_id):
            return
        basic_stats = extract_basic_image_stats(image_paths)

        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.profile_payload = {"stage": "calculating_quality"}
                session.add(rec)
                session.commit()

        # Stage 3: Quality Metrics
        if check_profiling_cancellation(dataset_id):
            return
        quality_metrics = calculate_quality_metrics(image_paths)

        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.profile_payload = {"stage": "calculating_duplicates"}
                session.add(rec)
                session.commit()

        # Stage 4: Duplicate Statistics
        if check_profiling_cancellation(dataset_id):
            return
        with Session(engine) as session:
            duplicate_stats = get_duplicate_statistics(session, dataset_id)

        # Stage 5: Label / Class Distribution
        if check_profiling_cancellation(dataset_id):
            return
        label_dist = calculate_label_distribution(image_paths, dataset_storage_path)

        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.profile_payload = {"stage": "generating_embeddings"}
                session.add(rec)
                session.commit()

        # Stage 6: DINOv2 Profiling Embeddings (using profiling_embeddings collection)
        if check_profiling_cancellation(dataset_id):
            return
        embeddings_map = get_or_create_profiling_embeddings(dataset_id, image_paths, batch_size=16)

        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.profile_payload = {"stage": "clustering"}
                session.add(rec)
                session.commit()

        # Stage 7: Visual Diversity & Clustering
        if check_profiling_cancellation(dataset_id):
            return
        clustering_stats = calculate_clustering_statistics(embeddings_map, eps=eps, min_samples=min_samples)

        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.profile_payload = {"stage": "extracting_metadata"}
                session.add(rec)
                session.commit()

        # Stage 8: Optional LLM Metadata Enrichment
        if check_profiling_cancellation(dataset_id):
            return
        llm_metadata = extract_llm_metadata(dataset_storage_path, user_description=user_description)

        # Final Assembly and persistence within task's session
        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                if rec.status == "cancelled":
                    print(f"Profiling job {profiling_id} was cancelled before final commit.")
                    return

                current_dataset = session.get(Dataset, dataset_id)
                full_payload = build_profile_payload(
                    dataset=current_dataset or dataset_info,
                    checksum=checksum,
                    basic_stats=basic_stats,
                    quality=quality_metrics,
                    duplicates=duplicate_stats,
                    labels=label_dist,
                    diversity=clustering_stats,
                    metadata_insights=llm_metadata,
                )

                rec.status = "completed"
                rec.profile_payload = full_payload
                rec.updated_at = datetime.datetime.utcnow()
                session.add(rec)
                session.commit()

        print(f"Dataset Profiling pipeline completed successfully for dataset {dataset_id}")

    except Exception as e:
        print(f"Dataset Profiling pipeline failed for dataset {dataset_id}: {e}")
        with Session(engine) as session:
            rec = session.get(DatasetProfilingResult, profiling_id)
            if rec:
                rec.status = "failed"
                rec.profile_payload = {"error": str(e)}
                rec.updated_at = datetime.datetime.utcnow()
                session.add(rec)
                session.commit()
