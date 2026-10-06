import io
import os
import uuid
import datetime
from collections import Counter
from typing import Dict, List, Optional, Any, Tuple
import numpy as np
import torch
from PIL import Image
from sqlmodel import Session, select

from app.config import settings
from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.models.clip_finding import DatasetClipFinding
from app.services.embedding_service import get_clip_components
from app.services.storage_service import minio_client, get_image_as_pil
from app.services.profiling_service import calculate_dataset_file_checksum

# In-memory LRU-like cache for ad-hoc free-text search queries: (dataset_id_str, query_lower) -> result
_TEXT_MATCH_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
MAX_TEXT_CACHE_ENTRIES = 100


def get_image_safely(path: str) -> Optional[Image.Image]:
    """
    Attempts to load an image from MinIO via get_image_as_pil.
    Falls back to local file system if path exists locally (useful for unit tests/fixtures).
    """
    try:
        pil_img = get_image_as_pil(path)
        if pil_img is not None:
            return pil_img
    except Exception:
        pass

    if os.path.exists(path):
        try:
            return Image.open(path)
        except Exception as e:
            print(f"Error opening local image {path}: {e}")
            return None

    return None


def score_images_against_text(
    image_paths: List[str],
    text_queries: List[str],
    batch_size: int = 16,
) -> Dict[str, Dict[str, float]]:
    """
    Shared CLIP scoring engine.
    Encodes images and text queries using the existing cached CLIP ViT-B/32 model.
    Computes cosine similarity between every image and every text query.
    Returns:
        { image_path: { text_query: similarity_score, ... }, ... }
    """
    if not image_paths or not text_queries:
        return {}

    device, clip_proc, clip_model = get_clip_components()

    def _to_device(inputs):
        if hasattr(inputs, "to"):
            return inputs.to(device)
        if isinstance(inputs, dict):
            return {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
        return inputs

    # 1. Encode text queries in a single batched pass
    text_inputs = clip_proc(
        text=text_queries,
        return_tensors="pt",
        padding=True,
        truncation=True,
    )
    text_inputs = _to_device(text_inputs)

    with torch.no_grad():
        text_features = clip_model.get_text_features(**text_inputs)
        if hasattr(text_features, "pooler_output"):
            text_features = text_features.pooler_output
        # L2-normalize text features
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        text_features_np = text_features.cpu().numpy().astype(np.float32)

    # 2. Encode images in batches of batch_size
    results: Dict[str, Dict[str, float]] = {}

    for i in range(0, len(image_paths), batch_size):
        batch_paths = image_paths[i : i + batch_size]
        loaded_images = []
        valid_paths = []

        for p in batch_paths:
            img = get_image_safely(p)
            if img is not None:
                rgb_img = img.convert("RGB") if img.mode != "RGB" else img
                loaded_images.append(rgb_img)
                valid_paths.append(p)
            else:
                # Default zero scores for unreadable images
                results[p] = {q: 0.0 for q in text_queries}

        if not loaded_images:
            continue

        clip_inputs = clip_proc(images=loaded_images, return_tensors="pt")
        clip_inputs = _to_device(clip_inputs)
        if device == "cuda":
            clip_inputs = {
                k: v.half() if (hasattr(v, "dtype") and v.dtype == torch.float32) else v for k, v in clip_inputs.items()
            }

        with torch.no_grad():
            img_features = clip_model.get_image_features(**clip_inputs)
            if hasattr(img_features, "pooler_output"):
                img_features = img_features.pooler_output
            # L2-normalize image features
            img_features = img_features / img_features.norm(dim=-1, keepdim=True)
            img_features_np = img_features.cpu().numpy().astype(np.float32)

        # 3. Compute cosine similarity: img_features_np @ text_features_np.T
        # Shape: (len(valid_paths), len(text_queries))
        sim_matrix = np.matmul(img_features_np, text_features_np.T)

        for p_idx, p in enumerate(valid_paths):
            results[p] = {
                text_queries[q_idx]: round(float(sim_matrix[p_idx, q_idx]), 4)
                for q_idx in range(len(text_queries))
            }

    return results


def generate_presigned_url(storage_path: str) -> str:
    """Generates a safe pre-signed download URL for thumbnail display."""
    if not storage_path:
        return ""
    try:
        from datetime import timedelta
        return minio_client.presigned_get_object(
            settings.minio_bucket_name,
            storage_path,
            expires=timedelta(hours=2),
        )
    except Exception as e:
        print(f"Error generating presigned URL for {storage_path}: {e}")
        return ""


def check_label_match(
    dataset_id: uuid.UUID,
    session: Session,
    threshold: float = 0.20,
) -> Dict[str, Any]:
    """
    Evaluates semantic match between dataset images and their assigned class labels.
    Uses score_images_against_text() to compare each image against 'a photo of a {label}'.
    Flags images with similarity score < threshold.
    Caches findings in tbl_dataset_clip_findings and mirrors summary into profiling_results.
    """
    dataset = session.get(Dataset, dataset_id)
    if not dataset or not dataset.dataset_storage_path:
        return {
            "has_labels": False,
            "status": "unavailable",
            "reason": "Dataset or storage path not found.",
            "mismatch_ratio": None,
            "total_evaluated": 0,
            "mismatched_count": 0,
            "threshold": threshold,
            "worst_matches": [],
        }

    checksum, image_paths, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
    if not image_paths:
        return {
            "has_labels": False,
            "status": "unavailable",
            "reason": "No image files found in dataset storage.",
            "mismatch_ratio": None,
            "total_evaluated": 0,
            "mismatched_count": 0,
            "threshold": threshold,
            "worst_matches": [],
        }

    # Extract folder-based taxonomy
    prefix = dataset.dataset_storage_path.rstrip("/") + "/"
    labeled_entries: List[Tuple[str, str]] = []
    class_counts = Counter()
    subfolder_count = 0

    for path in image_paths:
        rel = path[len(prefix):] if path.startswith(prefix) else path
        parts = rel.split("/")
        if len(parts) > 1:
            cls_name = parts[0].strip()
            if cls_name:
                class_counts[cls_name] += 1
                subfolder_count += 1
                labeled_entries.append((path, cls_name))

    # Must have >= 70% in subfolders and > 1 class to consider folder-labeled
    if subfolder_count < len(image_paths) * 0.7 or len(class_counts) <= 1:
        no_label_result = {
            "has_labels": False,
            "status": "unavailable",
            "reason": "No folder-based class taxonomy detected in dataset storage path.",
            "mismatch_ratio": None,
            "total_evaluated": 0,
            "mismatched_count": 0,
            "threshold": threshold,
            "worst_matches": [],
        }
        _save_clip_finding(session, dataset_id, checksum, no_label_result)
        return no_label_result

    # Build unique text queries for each class
    unique_classes = list(class_counts.keys())
    class_queries = {cls: f"a photo of a {cls}" for cls in unique_classes}
    unique_query_list = list(class_queries.values())

    all_paths = [e[0] for e in labeled_entries]
    scores_by_path = score_images_against_text(all_paths, unique_query_list, batch_size=16)

    evaluated_records = []
    mismatched_count = 0

    for path, cls_name in labeled_entries:
        query_text = class_queries[cls_name]
        similarity = scores_by_path.get(path, {}).get(query_text, 0.0)
        is_mismatched = similarity < threshold
        if is_mismatched:
            mismatched_count += 1

        evaluated_records.append({
            "image_path": path,
            "label": cls_name,
            "query_text": query_text,
            "score": similarity,
            "mismatched": is_mismatched,
        })

    total_evaluated = len(evaluated_records)
    mismatch_ratio = round(mismatched_count / float(total_evaluated), 4) if total_evaluated > 0 else 0.0

    # Sort ascending by score to find the lowest/worst matching samples (capped at top 20)
    evaluated_records.sort(key=lambda x: x["score"])
    top_worst_records = evaluated_records[:20]

    worst_matches = []
    for rec in top_worst_records:
        worst_matches.append({
            "image_path": rec["image_path"],
            "label": rec["label"],
            "score": rec["score"],
            "image_url": generate_presigned_url(rec["image_path"]),
        })

    result = {
        "has_labels": True,
        "status": "available",
        "mismatch_ratio": mismatch_ratio,
        "threshold": threshold,
        "total_evaluated": total_evaluated,
        "mismatched_count": mismatched_count,
        "class_breakdown": {
            cls: {
                "count": count,
                "label_query": class_queries[cls],
            }
            for cls, count in class_counts.most_common()
        },
        "worst_matches": worst_matches,
    }

    _save_clip_finding(session, dataset_id, checksum, result)
    return result


def _save_clip_finding(
    session: Session,
    dataset_id: uuid.UUID,
    checksum: str,
    label_match_data: Dict[str, Any],
) -> None:
    """
    Upserts into tbl_dataset_clip_findings AND mirrors summary into
    latest_profiling.profile_payload['clip_findings'] so the rules engine can resolve
    'clip_findings.label_match.mismatch_ratio'.
    """
    now = datetime.datetime.utcnow()

    finding = session.exec(
        select(DatasetClipFinding).where(DatasetClipFinding.dataset_id == dataset_id)
    ).first()

    if not finding:
        finding = DatasetClipFinding(
            dataset_id=dataset_id,
            file_list_checksum=checksum,
            label_match_data=label_match_data,
            computed_at=now,
        )
        session.add(finding)
    else:
        finding.file_list_checksum = checksum
        finding.label_match_data = label_match_data
        finding.computed_at = now
        finding.updated_at = now
        session.add(finding)

    # Mirror into latest profiling result payload if one exists
    latest_profiling = session.exec(
        select(DatasetProfilingResult)
        .where(DatasetProfilingResult.dataset_id == dataset_id)
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if latest_profiling and isinstance(latest_profiling.profile_payload, dict):
        current_payload = dict(latest_profiling.profile_payload)
        current_payload.setdefault("clip_findings", {})
        current_payload["clip_findings"]["label_match"] = {
            "has_labels": label_match_data.get("has_labels", False),
            "mismatch_ratio": label_match_data.get("mismatch_ratio"),
            "threshold": label_match_data.get("threshold", 0.20),
            "total_evaluated": label_match_data.get("total_evaluated", 0),
            "mismatched_count": label_match_data.get("mismatched_count", 0),
        }
        latest_profiling.profile_payload = current_payload
        session.add(latest_profiling)

    session.commit()


def get_cached_clip_analysis(dataset_id: uuid.UUID, session: Session) -> Optional[Dict[str, Any]]:
    """Returns cached clip analysis from tbl_dataset_clip_findings if exists."""
    finding = session.exec(
        select(DatasetClipFinding).where(DatasetClipFinding.dataset_id == dataset_id)
    ).first()
    if finding and finding.label_match_data:
        return finding.label_match_data
    return None


def search_text_match(
    dataset_id: uuid.UUID,
    query_text: str,
    session: Session,
    top_k: int = 10,
) -> Dict[str, Any]:
    """
    On-demand free-text purpose match.
    Scores all images in the dataset against a user query text using score_images_against_text().
    Returns score distribution (for histogram) and top-k best / worst matching samples.
    Caches in in-memory dict for rapid re-querying.
    """
    clean_query = query_text.strip()
    if not clean_query:
        raise ValueError("query_text cannot be empty.")

    cache_key = (str(dataset_id), clean_query.lower())
    if cache_key in _TEXT_MATCH_CACHE:
        return _TEXT_MATCH_CACHE[cache_key]

    dataset = session.get(Dataset, dataset_id)
    if not dataset or not dataset.dataset_storage_path:
        raise ValueError("Dataset or storage path not found.")

    _, image_paths, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
    if not image_paths:
        return {
            "query_text": clean_query,
            "total_images_scored": 0,
            "score_distribution": {
                "bins": ["< 0.15", "0.15 - 0.20", "0.20 - 0.25", "0.25 - 0.30", "> 0.30"],
                "counts": [0, 0, 0, 0, 0],
                "mean_score": 0.0,
                "min_score": 0.0,
                "max_score": 0.0,
            },
            "best_matches": [],
            "worst_matches": [],
        }

    # Score images against the query text
    scores_by_path = score_images_against_text(image_paths, [clean_query], batch_size=16)

    scored_items = []
    scores_list = []

    for p in image_paths:
        sim = scores_by_path.get(p, {}).get(clean_query, 0.0)
        scores_list.append(sim)
        scored_items.append({
            "image_path": p,
            "score": sim,
        })

    # Sort descending for best matches
    scored_items.sort(key=lambda x: x["score"], reverse=True)

    best_k = scored_items[:top_k]
    worst_k = list(reversed(scored_items[-top_k:])) if len(scored_items) >= top_k else list(reversed(scored_items))

    for item in best_k:
        item["image_url"] = generate_presigned_url(item["image_path"])
    for item in worst_k:
        item["image_url"] = generate_presigned_url(item["image_path"])

    # Calculate 5 score distribution bins
    bin_counts = [0, 0, 0, 0, 0]
    for s in scores_list:
        if s < 0.15:
            bin_counts[0] += 1
        elif s < 0.20:
            bin_counts[1] += 1
        elif s < 0.25:
            bin_counts[2] += 1
        elif s < 0.30:
            bin_counts[3] += 1
        else:
            bin_counts[4] += 1

    mean_score = round(float(np.mean(scores_list)), 4) if scores_list else 0.0
    min_score = round(float(np.min(scores_list)), 4) if scores_list else 0.0
    max_score = round(float(np.max(scores_list)), 4) if scores_list else 0.0

    result = {
        "query_text": clean_query,
        "total_images_scored": len(scored_items),
        "score_distribution": {
            "bins": ["< 0.15", "0.15 - 0.20", "0.20 - 0.25", "0.25 - 0.30", "> 0.30"],
            "counts": bin_counts,
            "mean_score": mean_score,
            "min_score": min_score,
            "max_score": max_score,
        },
        "best_matches": best_k,
        "worst_matches": worst_k,
    }

    # Evict if cache exceeds max entries
    if len(_TEXT_MATCH_CACHE) >= MAX_TEXT_CACHE_ENTRIES:
        _TEXT_MATCH_CACHE.pop(next(iter(_TEXT_MATCH_CACHE)))

    _TEXT_MATCH_CACHE[cache_key] = result
    return result
