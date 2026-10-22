import json
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold, train_test_split
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sqlmodel import Session, select

from app.database import engine
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.profiling import DatasetProfilingResult
from app.models.learning_curve import DatasetLearningCurveResult


logger = logging.getLogger(__name__)


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


def sign_url(storage_path: str, expires_hours: int = 2) -> str:
    """Generates presigned GET URL for a MinIO object key."""
    if not storage_path:
        return ""
    try:
        from datetime import timedelta
        from app.services.storage_service import minio_client
        from app.config import settings
        return minio_client.presigned_get_object(
            settings.minio_bucket_name,
            storage_path,
            expires=timedelta(hours=expires_hours),
        )
    except Exception as e:
        logger.warning(f"Failed to generate presigned URL for {storage_path}: {e}")
        return ""


def calculate_dataset_file_checksum(dataset_storage_path: str) -> Tuple[str, List[str], int]:
    """
    Scans MinIO recursively for image files under dataset_storage_path,
    sorts them deterministically by object name, and produces a stable SHA-256 checksum:
        SHA256(";".join(f"{name}:{etag}:{size}" for sorted entries))
    """
    if not dataset_storage_path:
        return "", [], 0
    from app.services.storage_service import minio_client
    from app.config import settings
    image_extensions = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff")
    try:
        objects = minio_client.list_objects(
            settings.minio_bucket_name,
            prefix=dataset_storage_path,
            recursive=True,
        )
        image_entries = []
        total_bytes = 0
        for obj in objects:
            name_lower = obj.object_name.lower()
            if any(name_lower.endswith(ext) for ext in image_extensions):
                etag = obj.etag.strip('"') if obj.etag else ""
                size = obj.size or 0
                total_bytes += size
                image_entries.append((obj.object_name, etag, size))
        image_entries.sort(key=lambda x: x[0])
        image_paths = [x[0] for x in image_entries]
        hash_source = ";".join(f"{name}:{etag}:{size}" for name, etag, size in image_entries)
        checksum = hashlib.sha256(hash_source.encode("utf-8")).hexdigest()
        return checksum, image_paths, total_bytes
    except Exception as e:
        logger.warning(f"Failed to calculate checksum for {dataset_storage_path}: {e}")
        return "", [], 0


def get_profiling_collection():
    from app.services.vector_service import get_profiling_collection as _get_coll
    return _get_coll()


logger = logging.getLogger(__name__)


def load_learning_curve_config() -> Dict[str, Any]:
    """Loads learning curve configuration parameters with fallback defaults."""
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "learning_curve_config.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load learning curve config from {config_path}: {e}")

    return {
        "fractions": [0.10, 0.25, 0.50, 0.75, 1.0],
        "n_splits": 5,
        "n_repeats": 3,
        "random_seed": 42,
        "min_images_per_class": 20,
        "recommended_images_per_class": 50,
        "min_classes": 2,
        "max_images_used": 5000,
        "group_confidence_min": 0.95,
        "max_group_share": 0.25,
        "flat_from_start_tolerance": 0.02,
        "improving_gain_min": 0.03,
        "weak_signal_margin": 0.10,
        "class_benefit_gain_min": 0.05,
        "per_class_compare_fraction": 0.25,
        "confused_pairs_max": 5,
        "mislabel_candidates_max": 24,
        "mislabel_min_confidence": 0.80,
        "job_timeout_seconds": 600,
    }


def compute_params_hash(config: Dict[str, Any]) -> str:
    """Computes a deterministic SHA-256 hash of the execution parameters."""
    hash_keys = [
        "fractions",
        "n_splits",
        "n_repeats",
        "random_seed",
        "min_images_per_class",
        "min_classes",
        "max_images_used",
        "group_confidence_min",
        "max_group_share",
        "flat_from_start_tolerance",
        "improving_gain_min",
        "weak_signal_margin",
        "class_benefit_gain_min",
        "per_class_compare_fraction",
    ]
    canonical = {k: config.get(k) for k in hash_keys if k in config}
    serialized = json.dumps(canonical, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def check_eligibility(
    dataset_id: Any,
    session: Session,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str], Optional[str], Dict[str, Any]]:
    """
    Checks if a dataset is eligible for learning curve computation.
    Returns: (is_eligible, reason_code, message, details)
    """
    if config is None:
        config = load_learning_curve_config()

    dataset = session.get(Dataset, dataset_id)
    if not dataset:
        return False, "not_found", "Dataset does not exist.", {}

    # 1. Profiled status check
    prof = session.exec(
        select(DatasetProfilingResult)
        .where(
            DatasetProfilingResult.dataset_id == dataset_id,
            DatasetProfilingResult.status == "completed",
        )
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if not prof:
        return (
            False,
            "not_profiled",
            "This dataset has not been profiled yet. Run dataset profiling first.",
            {},
        )

    # 2. ChromaDB embeddings check
    coll = get_profiling_collection()
    recs = coll.get(where={"dataset_id": str(dataset_id)}, limit=1)
    if not recs or not recs.get("ids") or len(recs["ids"]) == 0:
        return (
            False,
            "not_profiled",
            "No profiling fingerprints found for this dataset. Please re-run profiling.",
            {},
        )

    # 3. Label extraction check
    storage_path = dataset.dataset_storage_path or ""
    all_recs = coll.get(where={"dataset_id": str(dataset_id)}, include=["metadatas"])
    metadatas = all_recs.get("metadatas") or []
    image_paths = [m.get("image_path") for m in metadatas if m and m.get("image_path")]

    class_counts: Dict[str, int] = {}
    for path in image_paths:
        cls_name = extract_class_label(path, storage_path)
        if cls_name:
            class_counts[cls_name] = class_counts.get(cls_name, 0) + 1

    min_classes = config.get("min_classes", 2)
    min_images_per_class = config.get("min_images_per_class", 20)

    if not class_counts or len(class_counts) == 0:
        return (
            False,
            "no_labels",
            "No folder-based class taxonomy was detected for this dataset.",
            {"detected_classes": 0},
        )

    if len(class_counts) < min_classes:
        return (
            False,
            "too_few_classes",
            f"Dataset must have at least {min_classes} classes to train a test model (found {len(class_counts)}).",
            {"detected_classes": len(class_counts), "required_classes": min_classes},
        )

    min_count = min(class_counts.values()) if class_counts else 0
    smallest_class = min(class_counts, key=class_counts.get) if class_counts else ""

    if min_count < min_images_per_class:
        return (
            False,
            "too_few_images",
            f"Class '{smallest_class}' has {min_count} images, but at least {min_images_per_class} images are required per class.",
            {
                "smallest_class": smallest_class,
                "smallest_count": min_count,
                "required_images": min_images_per_class,
                "class_counts": class_counts,
            },
        )

    return True, None, None, {"class_counts": class_counts}


def resolve_verdict(
    fractions_data: List[Dict[str, Any]],
    num_classes: int,
    config: Dict[str, Any],
) -> Tuple[str, float]:
    """
    Determines the deterministic plain-language verdict from the learning curve points.
    Returns: (verdict, last_step_gain)
    """
    chance_level = 1.0 / max(num_classes, 1)
    weak_signal_margin = config.get("weak_signal_margin", 0.10)
    flat_from_start_tolerance = config.get("flat_from_start_tolerance", 0.02)
    improving_gain_min = config.get("improving_gain_min", 0.03)

    valid_fractions = [f for f in fractions_data if not f.get("skipped", False)]
    if not valid_fractions:
        return "weak_signal", 0.0

    final_point = valid_fractions[-1]
    final_score = final_point["score_mean"]
    final_std = final_point["score_std"]

    first_point = valid_fractions[0]
    first_score = first_point["score_mean"]

    prev_point = valid_fractions[-2] if len(valid_fractions) > 1 else first_point
    prev_score = prev_point["score_mean"]
    last_step_gain = round(final_score - prev_score, 4)

    # 1. weak_signal: final mean <= chance + weak_signal_margin
    if final_score <= (chance_level + weak_signal_margin):
        return "weak_signal", last_step_gain

    # 2. flat_from_start: smallest-fraction mean >= final mean - flat_from_start_tolerance
    if first_score >= (final_score - flat_from_start_tolerance):
        return "flat_from_start", last_step_gain

    # 3. still_improving: (final - previous) >= improving_gain_min AND > final_std
    if (last_step_gain >= improving_gain_min) and (last_step_gain > final_std):
        return "still_improving", last_step_gain

    # 4. levelling_off: everything else
    return "levelling_off", last_step_gain


def compute_learning_curve(
    dataset_id: Any,
    session: Session,
    config: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Executes the learning curve computation across sample fractions.
    """
    if config is None:
        config = load_learning_curve_config()

    dataset = session.get(Dataset, dataset_id)
    if not dataset:
        raise ValueError("Dataset not found")

    prof = session.exec(
        select(DatasetProfilingResult)
        .where(
            DatasetProfilingResult.dataset_id == dataset_id,
            DatasetProfilingResult.status == "completed",
        )
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if not prof:
        raise ValueError("Dataset not profiled")

    storage_path = dataset.dataset_storage_path or ""
    coll = get_profiling_collection()

    # 1. Load ChromaDB embeddings and image paths
    recs = coll.get(
        where={"dataset_id": str(dataset_id)},
        include=["embeddings", "metadatas"],
    )

    all_embeddings = recs.get("embeddings")
    all_metadatas = recs.get("metadatas")

    if all_embeddings is None or len(all_embeddings) == 0:
        raise ValueError("No embeddings found in ChromaDB collection")
    if all_metadatas is None:
        all_metadatas = []

    # Map paths to classes
    valid_paths: List[str] = []
    valid_embeddings: List[List[float]] = []
    valid_classes: List[str] = []

    for emb, meta in zip(all_embeddings, all_metadatas):
        p = meta.get("image_path") if meta else None
        if not p:
            continue
        cls_name = extract_class_label(p, storage_path)
        if cls_name:
            valid_paths.append(p)
            valid_embeddings.append(emb)
            valid_classes.append(cls_name)

    unique_classes = sorted(list(set(valid_classes)))
    num_classes = len(unique_classes)
    class_to_idx = {c: i for i, c in enumerate(unique_classes)}
    y_all = np.array([class_to_idx[c] for c in valid_classes], dtype=int)
    X_all = np.array(valid_embeddings, dtype=np.float32)

    images_total = len(valid_paths)
    max_images_used = config.get("max_images_used", 5000)
    random_seed = config.get("random_seed", 42)

    caveats: List[str] = [
        "baseline_test_model"
    ]

    # Stratified subsampling if dataset exceeds max_images_used
    if images_total > max_images_used:
        train_idx, _ = train_test_split(
            np.arange(images_total),
            train_size=max_images_used,
            stratify=y_all,
            random_state=random_seed,
        )
        selected_indices = np.sort(train_idx)
        X_used = X_all[selected_indices]
        y_used = y_all[selected_indices]
        paths_used = [valid_paths[i] for i in selected_indices]
        images_used = max_images_used
        caveats.append("sampled_subset")
    else:
        X_used = X_all
        y_used = y_all
        paths_used = valid_paths
        images_used = images_total

    class_counts = {
        cls_name: int(np.sum(y_used == class_to_idx[cls_name]))
        for cls_name in unique_classes
    }

    recommended_images_per_class = config.get("recommended_images_per_class", 50)
    if min(class_counts.values()) < recommended_images_per_class:
        caveats.append("small_dataset")

    # 2. Build Duplicate Groups
    group_conf_min = config.get("group_confidence_min", 0.95)
    max_group_share = config.get("max_group_share", 0.25)

    dup_groups = session.exec(
        select(DatasetDuplicateGroup).where(
            DatasetDuplicateGroup.dataset_id == dataset.dataset_id,
            DatasetDuplicateGroup.duplicate_group_confidence_score >= group_conf_min,
        )
    ).all()

    path_to_group: Dict[str, str] = {}
    for g in dup_groups:
        imgs = session.exec(
            select(DatasetDuplicateGroupImage).where(
                DatasetDuplicateGroupImage.duplicate_group_id == g.duplicate_group_id
            )
        ).all()
        for img in imgs:
            path_to_group[img.image_storage_path] = str(g.duplicate_group_id)

    # Assign group IDs for each used image
    assigned_groups: List[str] = []
    for idx, path in enumerate(paths_used):
        g_id = path_to_group.get(path, f"single_{idx}")
        assigned_groups.append(g_id)

    group_counts: Dict[str, int] = {}
    for g_id in assigned_groups:
        group_counts[g_id] = group_counts.get(g_id, 0) + 1

    largest_group_size = max(group_counts.values()) if group_counts else 1
    largest_group_share = largest_group_size / float(images_used)

    n_splits = config.get("n_splits", 5)
    n_repeats = config.get("n_repeats", 3)

    use_grouping = True
    if largest_group_share > max_group_share:
        use_grouping = False
    else:
        # Check if StratifiedGroupKFold can partition without crashing or leaving classes empty
        try:
            sgkf_test = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=random_seed)
            for _, val_idx in sgkf_test.split(X_used, y_used, groups=assigned_groups):
                if len(np.unique(y_used[val_idx])) < num_classes:
                    use_grouping = False
                    break
        except Exception:
            use_grouping = False

    grouping_mode = "duplicate_groups" if use_grouping else "none_fallback"
    if not use_grouping:
        caveats.append("grouping_fallback")

    # 3. Learning Curve Training across Repeats, Folds, and Fractions
    fractions = config.get("fractions", [0.10, 0.25, 0.50, 0.75, 1.0])
    total_steps = n_repeats * len(fractions)
    step_count = 0

    # Store scores per fraction across all (repeat, fold) runs
    fraction_scores: Dict[float, List[float]] = {f: [] for f in fractions}
    fraction_train_sizes: Dict[float, List[int]] = {f: [] for f in fractions}
    fraction_class_recalls: Dict[float, Dict[int, List[float]]] = {
        f: {c: [] for c in range(num_classes)} for f in fractions
    }
    fraction_skipped: Dict[float, bool] = {f: False for f in fractions}

    # Store out-of-fold predictions and probabilities at fraction 1.0 for each image
    oof_predictions_100: List[Tuple[int, int]] = []  # (true_class, predicted_class)
    # image_idx -> list of predicted probability vectors when held out
    oof_probabilities_100: Dict[int, List[np.ndarray]] = {i: [] for i in range(images_used)}

    for repeat in range(n_repeats):
        seed = random_seed + repeat

        if use_grouping:
            splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
            splits = list(splitter.split(X_used, y_used, groups=assigned_groups))
        else:
            splitter = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=seed)
            splits = list(splitter.split(X_used, y_used))

        for f_idx, fraction in enumerate(fractions):
            pct_text = int(round(fraction * 100))
            if progress_callback:
                progress_callback(
                    stage=f"Testing with {pct_text}% of the images...",
                    progress=round(step_count / float(total_steps), 2),
                )
            step_count += 1

            for fold_idx, (train_idx, val_idx) in enumerate(splits):
                X_train_fold, y_train_fold = X_used[train_idx], y_used[train_idx]
                X_val, y_val = X_used[val_idx], y_used[val_idx]

                # Check if we can form a class-stratified subsample with >= 2 images per class
                if fraction < 1.0:
                    sub_indices = []
                    can_sample = True
                    rng = np.random.RandomState(seed * 100 + fold_idx * 10 + f_idx)

                    for c in range(num_classes):
                        c_train_indices = np.where(y_train_fold == c)[0]
                        n_c = len(c_train_indices)
                        if n_c < 2:
                            can_sample = False
                            break
                        target_c = max(2, int(round(n_c * fraction)))
                        target_c = min(target_c, n_c)
                        chosen = rng.choice(c_train_indices, size=target_c, replace=False)
                        sub_indices.extend(chosen)

                    if not can_sample:
                        fraction_skipped[fraction] = True
                        continue

                    sub_indices = np.array(sub_indices)
                    X_train = X_train_fold[sub_indices]
                    y_train = y_train_fold[sub_indices]
                else:
                    X_train = X_train_fold
                    y_train = y_train_fold

                # Fit LogisticRegression
                clf = LogisticRegression(
                    max_iter=1000,
                    class_weight="balanced",
                    random_state=seed,
                    solver="lbfgs",
                )
                clf.fit(X_train, y_train)

                y_pred = clf.predict(X_val)
                score = balanced_accuracy_score(y_val, y_pred)

                fraction_scores[fraction].append(float(score))
                fraction_train_sizes[fraction].append(len(X_train))

                # Per-class recall for this fold
                for c in range(num_classes):
                    c_mask = (y_val == c)
                    if np.sum(c_mask) > 0:
                        rec = float(np.sum((y_pred == c) & c_mask) / np.sum(c_mask))
                        fraction_class_recalls[fraction][c].append(rec)

                # Collect out-of-fold predictions at 100%
                if fraction == 1.0:
                    probs = clf.predict_proba(X_val)
                    for val_pos, global_img_idx in enumerate(val_idx):
                        oof_predictions_100.append((int(y_val[val_pos]), int(y_pred[val_pos])))
                        oof_probabilities_100[global_img_idx].append(probs[val_pos])

    # 4. Aggregate Fraction Results
    fractions_output: List[Dict[str, Any]] = []
    for fraction in fractions:
        scores = fraction_scores[fraction]
        train_sizes = fraction_train_sizes[fraction]

        if len(scores) == 0 or fraction_skipped[fraction]:
            fractions_output.append({
                "fraction": fraction,
                "train_images_mean": 0.0,
                "score_mean": 0.0,
                "score_std": 0.0,
                "skipped": True,
            })
        else:
            fractions_output.append({
                "fraction": fraction,
                "train_images_mean": round(float(np.mean(train_sizes)), 1),
                "score_mean": round(float(np.mean(scores)), 4),
                "score_std": round(float(np.std(scores)), 4),
                "skipped": False,
            })

    # 5. Verdict Resolution
    verdict, last_step_gain = resolve_verdict(fractions_output, num_classes, config)
    chance_level = round(1.0 / float(num_classes), 4)

    completed_fractions = [f for f in fractions_output if not f["skipped"]]
    final_score = completed_fractions[-1]["score_mean"] if completed_fractions else chance_level

    # 6. Per-Class Gain Comparison
    per_class_compare_fraction = config.get("per_class_compare_fraction", 0.25)
    class_benefit_gain_min = config.get("class_benefit_gain_min", 0.05)

    per_class_output: List[Dict[str, Any]] = []
    for c_idx, c_name in enumerate(unique_classes):
        recalls_base = fraction_class_recalls.get(per_class_compare_fraction, {}).get(c_idx, [])
        recalls_full = fraction_class_recalls.get(1.0, {}).get(c_idx, [])

        mean_base = float(np.mean(recalls_base)) if recalls_base else 0.0
        mean_full = float(np.mean(recalls_full)) if recalls_full else 0.0
        gain = round(mean_full - mean_base, 4)
        would_benefit = gain >= class_benefit_gain_min

        per_class_output.append({
            "class_name": c_name,
            "recall_baseline": round(mean_base, 4),
            "recall_full": round(mean_full, 4),
            "gain": gain,
            "would_benefit": would_benefit,
        })

    # Sort per_class descending by gain
    per_class_output.sort(key=lambda item: item["gain"], reverse=True)

    # 7. Confused Pairs (from 100% out-of-fold predictions)
    confused_pairs_max = config.get("confused_pairs_max", 5)
    confused_pairs: List[Dict[str, Any]] = []

    if oof_predictions_100:
        y_true_oof = np.array([p[0] for p in oof_predictions_100])
        y_pred_oof = np.array([p[1] for p in oof_predictions_100])
        cm = confusion_matrix(y_true_oof, y_pred_oof, labels=list(range(num_classes)))

        pairs_candidates = []
        for i in range(num_classes):
            total_true_i = np.sum(cm[i, :])
            if total_true_i == 0:
                continue
            for j in range(num_classes):
                if i != j:
                    rate = float(cm[i, j] / total_true_i)
                    if rate >= 0.05:  # Skip pairs under 5%
                        pairs_candidates.append({
                            "true_class": unique_classes[i],
                            "predicted_class": unique_classes[j],
                            "rate": round(rate, 4),
                        })

        pairs_candidates.sort(key=lambda p: p["rate"], reverse=True)
        confused_pairs = pairs_candidates[:confused_pairs_max]

    # 8. Mislabel Candidates (from averaged out-of-fold probabilities at 1.0)
    mislabel_min_confidence = config.get("mislabel_min_confidence", 0.80)
    mislabel_candidates_max = config.get("mislabel_candidates_max", 24)
    mislabel_candidates: List[Dict[str, Any]] = []

    for img_idx, prob_list in oof_probabilities_100.items():
        if not prob_list:
            continue
        avg_probs = np.mean(prob_list, axis=0)
        top_pred_idx = int(np.argmax(avg_probs))
        top_conf = float(avg_probs[top_pred_idx])
        true_cls_idx = y_used[img_idx]

        if top_pred_idx != true_cls_idx and top_conf >= mislabel_min_confidence:
            mislabel_candidates.append({
                "image_path": paths_used[img_idx],
                "labelled_class": unique_classes[true_cls_idx],
                "predicted_class": unique_classes[top_pred_idx],
                "confidence": round(top_conf, 4),
            })

    mislabel_candidates.sort(key=lambda c: c["confidence"], reverse=True)
    mislabel_candidates = mislabel_candidates[:mislabel_candidates_max]

    result_payload = {
        "status": "completed",
        "dataset_id": str(dataset_id),
        "dataset_name": dataset.dataset_name,
        "file_list_checksum": prof.file_list_checksum,
        "params_hash": compute_params_hash(config),
        "computed_at": datetime.utcnow().isoformat(),
        "images_used": images_used,
        "images_total": images_total,
        "num_classes": num_classes,
        "class_counts": class_counts,
        "grouping": grouping_mode,
        "fractions": fractions_output,
        "chance_level": chance_level,
        "final_score": final_score,
        "verdict": verdict,
        "last_step_gain": last_step_gain,
        "per_class": per_class_output,
        "confused_pairs": confused_pairs,
        "mislabel_candidates": mislabel_candidates,
        "caveats": caveats,
        "params": {
            "n_splits": n_splits,
            "n_repeats": n_repeats,
            "random_seed": random_seed,
        },
    }

    if progress_callback:
        progress_callback(stage="Complete", progress=1.0)

    return result_payload


def run_learning_curve_background_job(dataset_id: Any, checksum: str, params_hash: str):
    """
    Background worker function executed asynchronously.
    Updates the job row in tbl_dataset_learning_curve_results as it progresses.
    """
    with Session(engine) as session:
        job = session.exec(
            select(DatasetLearningCurveResult).where(
                DatasetLearningCurveResult.dataset_id == dataset_id,
                DatasetLearningCurveResult.file_list_checksum == checksum,
                DatasetLearningCurveResult.params_hash == params_hash,
            )
        ).first()

        if not job:
            job = DatasetLearningCurveResult(
                dataset_id=dataset_id,
                file_list_checksum=checksum,
                params_hash=params_hash,
                status="running",
                stage="Initializing...",
                progress=0.0,
            )
            session.add(job)
            session.commit()
            session.refresh(job)

        def update_progress(stage: str, progress: float):
            try:
                # Check for cancellation
                with Session(engine) as s:
                    current_job = s.exec(
                        select(DatasetLearningCurveResult).where(
                            DatasetLearningCurveResult.result_id == job.result_id
                        )
                    ).first()
                    if current_job and current_job.status == "cancelled":
                        raise RuntimeError("Job cancelled by user")
                    if current_job:
                        current_job.stage = stage
                        current_job.progress = progress
                        current_job.updated_at = datetime.utcnow()
                        s.add(current_job)
                        s.commit()
            except Exception as e:
                if str(e) == "Job cancelled by user":
                    raise

        try:
            config = load_learning_curve_config()
            payload = compute_learning_curve(
                dataset_id=dataset_id,
                session=session,
                config=config,
                progress_callback=update_progress,
            )

            # Mark completed
            with Session(engine) as s:
                completed_job = s.exec(
                    select(DatasetLearningCurveResult).where(
                        DatasetLearningCurveResult.result_id == job.result_id
                    )
                ).first()
                if completed_job and completed_job.status != "cancelled":
                    completed_job.status = "completed"
                    completed_job.stage = "Complete"
                    completed_job.progress = 1.0
                    completed_job.computed_at = datetime.utcnow()
                    completed_job.result = payload
                    completed_job.updated_at = datetime.utcnow()
                    s.add(completed_job)
                    s.commit()
        except RuntimeError as re:
            if str(re) == "Job cancelled by user":
                logger.info(f"Learning curve job {job.result_id} cancelled.")
        except Exception as exc:
            logger.exception(f"Learning curve job failed for dataset {dataset_id}: {exc}")
            with Session(engine) as s:
                failed_job = s.exec(
                    select(DatasetLearningCurveResult).where(
                        DatasetLearningCurveResult.result_id == job.result_id
                    )
                ).first()
                if failed_job and failed_job.status != "cancelled":
                    failed_job.status = "failed"
                    failed_job.stage = "Failed"
                    failed_job.result = {"error": str(exc)}
                    failed_job.updated_at = datetime.utcnow()
                    s.add(failed_job)
                    s.commit()
