import io
import uuid
import pytest
import numpy as np
from PIL import Image
from unittest.mock import patch, MagicMock

from sqlmodel import select
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.profiling import DatasetProfilingResult
from app.services import profiling_service


def create_test_image_bytes(width=100, height=80, color="red", fmt="JPEG"):
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=color)
    img.save(buf, format=fmt)
    return buf.getvalue()


def test_calculate_dataset_file_checksum():
    mock_obj1 = MagicMock()
    mock_obj1.object_name = "datasets/test/b_image.png"
    mock_obj1.etag = "etag_b"
    mock_obj1.size = 2048

    mock_obj2 = MagicMock()
    mock_obj2.object_name = "datasets/test/a_image.jpg"
    mock_obj2.etag = "etag_a"
    mock_obj2.size = 1024

    mock_obj_text = MagicMock()
    mock_obj_text.object_name = "datasets/test/notes.txt"
    mock_obj_text.etag = "etag_txt"
    mock_obj_text.size = 50

    with patch.object(profiling_service.minio_client, "list_objects", return_value=[mock_obj1, mock_obj2, mock_obj_text]):
        checksum, image_paths, total_bytes = profiling_service.calculate_dataset_file_checksum("datasets/test/")

        # Should only include image files and be sorted alphabetically
        assert len(image_paths) == 2
        assert image_paths == ["datasets/test/a_image.jpg", "datasets/test/b_image.png"]
        assert total_bytes == 3072
        assert len(checksum) == 64  # SHA-256 hex string


def test_extract_basic_image_stats():
    img1_bytes = create_test_image_bytes(100, 80, fmt="JPEG")
    img2_bytes = create_test_image_bytes(200, 200, fmt="PNG")

    def mock_get_bytes(path):
        if path == "img1.jpg":
            return img1_bytes
        elif path == "img2.png":
            return img2_bytes
        return None  # corrupt

    with patch("app.services.profiling_service.get_image_bytes", side_effect=mock_get_bytes):
        stats = profiling_service.extract_basic_image_stats(["img1.jpg", "img2.png", "corrupt.jpg"])

        assert stats["total_images"] == 3
        assert stats["readable_images"] == 2
        assert stats["corrupt_images"] == 1

        assert stats["dimensions"]["width"]["min"] == 100
        assert stats["dimensions"]["width"]["max"] == 200
        assert stats["dimensions"]["height"]["min"] == 80
        assert stats["dimensions"]["height"]["max"] == 200

        assert "JPEG" in stats["formats"]
        assert "PNG" in stats["formats"]
        assert stats["aspect_ratios"]["categories"]["square"] >= 1


def test_calculate_quality_metrics():
    # Sharp noise image (high Laplacian variance)
    np_sharp = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    sharp_img = Image.fromarray(np_sharp)
    sharp_buf = io.BytesIO()
    sharp_img.save(sharp_buf, format="PNG")
    sharp_bytes = sharp_buf.getvalue()

    # Flat image (very low Laplacian variance -> blurry)
    flat_bytes = create_test_image_bytes(100, 100, color="gray", fmt="PNG")

    def mock_get_bytes(path):
        if path == "sharp.png":
            return sharp_bytes
        return flat_bytes

    with patch("app.services.profiling_service.get_image_bytes", side_effect=mock_get_bytes):
        metrics = profiling_service.calculate_quality_metrics(["sharp.png", "flat.png"], blur_threshold=100.0)

        assert metrics["evaluated_images"] == 2
        assert metrics["counts"]["blurred"] >= 1  # flat image is flagged
        assert "laplacian_variance" in metrics
        assert "brightness" in metrics
        assert "contrast" in metrics


def test_get_duplicate_statistics(db_session):
    dataset_id = uuid.uuid4()
    workspace_id = uuid.uuid4()

    # Case 1: Deduplication has not been run
    ds = Dataset(
        dataset_id=dataset_id,
        workspace_id=workspace_id,
        dataset_name="Test DS",
        dataset_source_type="kaggle",
        dataset_status="acquired",
        dataset_image_count=50,
    )
    db_session.add(ds)
    db_session.commit()

    stats_not_run = profiling_service.get_duplicate_statistics(db_session, dataset_id)
    assert stats_not_run["status"] == "not_yet_computed"

    # Case 2: Deduplication has run with duplicate groups
    ds.dataset_status = "duplicates_detected"
    group = DatasetDuplicateGroup(
        dataset_id=dataset_id,
        duplicate_group_detection_method="exact_hash",
        duplicate_group_confidence_score=1.0,
    )
    db_session.add(ds)
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)

    img1 = DatasetDuplicateGroupImage(
        duplicate_group_id=group.duplicate_group_id,
        image_storage_path="path/1.jpg",
        is_original_flag=True,
    )
    img2 = DatasetDuplicateGroupImage(
        duplicate_group_id=group.duplicate_group_id,
        image_storage_path="path/2.jpg",
        is_original_flag=False,
    )
    db_session.add(img1)
    db_session.add(img2)
    db_session.commit()

    stats_computed = profiling_service.get_duplicate_statistics(db_session, dataset_id)
    assert stats_computed["status"] == "completed"
    assert stats_computed["duplicate_groups_count"] == 1
    assert stats_computed["affected_images_count"] == 2
    assert stats_computed["exact_duplicate_groups"] == 1
    assert stats_computed["duplicate_ratio"] == 0.04  # 2 / 50


def test_calculate_label_distribution():
    # Case 1: Inferred subfolder classes
    image_paths = [
        "datasets/my_ds/cats/c1.jpg",
        "datasets/my_ds/cats/c2.jpg",
        "datasets/my_ds/dogs/d1.jpg",
        "datasets/my_ds/dogs/d2.jpg",
        "datasets/my_ds/dogs/d3.jpg",
    ]
    labels_res = profiling_service.calculate_label_distribution(image_paths, "datasets/my_ds/")
    assert labels_res["status"] == "available"
    assert labels_res["num_classes"] == 2
    assert labels_res["class_counts"]["cats"] == 2
    assert labels_res["class_counts"]["dogs"] == 3
    assert "balance_indicator" in labels_res["metrics"]

    # Case 2: Flat files with no subfolders
    flat_paths = ["datasets/my_ds/img1.jpg", "datasets/my_ds/img2.jpg"]
    flat_res = profiling_service.calculate_label_distribution(flat_paths, "datasets/my_ds/")
    assert flat_res["status"] == "unavailable"


def test_calculate_clustering_statistics():
    # Synthetic distinct 768-dim clusters
    cluster1 = [np.array([1.0] * 384 + [0.0] * 384, dtype=np.float32) for _ in range(5)]
    cluster2 = [np.array([0.0] * 384 + [1.0] * 384, dtype=np.float32) for _ in range(5)]
    outlier = [np.random.randn(768).astype(np.float32)]

    # Normalize vectors
    def norm(v):
        return (v / np.linalg.norm(v)).tolist()

    embs_map = {f"img_{i}.jpg": norm(v) for i, v in enumerate(cluster1 + cluster2 + outlier)}

    stats = profiling_service.calculate_clustering_statistics(embs_map, eps=0.2, min_samples=2)
    assert stats["status"] == "completed"
    assert stats["cluster_count"] >= 1
    assert "noise_count" in stats
    assert "noise_ratio" in stats
    assert "cluster_size_distribution" in stats


def test_calculate_clustering_insufficient_samples():
    embs_map = {"img_1.jpg": [0.1] * 768}
    stats = profiling_service.calculate_clustering_statistics(embs_map)
    assert stats["status"] == "insufficient_data"
    assert stats["silhouette_score"] is None


def test_extract_llm_metadata():
    mock_resp = MagicMock()
    mock_resp.choices = [
        MagicMock(
            message=MagicMock(
                content='{"stated_purpose": "Brain Tumor MRI detection", "collection_method": "Clinical scanners", "known_limitations": "Imbalanced grades"}'
            )
        )
    ]

    with patch.object(profiling_service.groq_client.chat.completions, "create", return_value=mock_resp):
        res = profiling_service.extract_llm_metadata(
            dataset_storage_path="datasets/dummy/",
            user_description="Dataset of 2000 brain tumor MRI slices."
        )
        assert res["status"] == "completed"
        assert res["stated_purpose"] == "Brain Tumor MRI detection"
        assert res["collection_method"] == "Clinical scanners"
        assert res["known_limitations"] == "Imbalanced grades"


def test_extract_llm_metadata_unavailable():
    res = profiling_service.extract_llm_metadata("datasets/empty/", user_description="")
    assert res["status"] == "unavailable"
    assert res["stated_purpose"] is None


def test_build_profile_payload_dict_support():
    ds_dict = {
        "dataset_id": str(uuid.uuid4()),
        "workspace_id": str(uuid.uuid4()),
        "dataset_name": "Dict Dataset",
        "dataset_source_type": "kaggle",
        "dataset_source_url": None,
        "dataset_license": "MIT",
        "dataset_image_count": 10,
        "dataset_storage_path": "datasets/test/",
        "dataset_domain": "photographic",
    }
    payload = profiling_service.build_profile_payload(
        dataset=ds_dict,
        checksum="test_chk",
        basic_stats={},
        quality={},
        duplicates={},
        labels={},
        diversity={},
        metadata_insights={},
    )
    assert payload["dataset"]["dataset_name"] == "Dict Dataset"
    assert payload["dataset"]["file_list_checksum"] == "test_chk"


def test_run_profiling_pipeline_session_lifecycle(db_session):
    """Verifies that run_profiling_pipeline does not raise DetachedInstanceError."""
    dataset_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    ds = Dataset(
        dataset_id=dataset_id,
        workspace_id=workspace_id,
        dataset_name="Pipeline Test DS",
        dataset_source_type="kaggle",
        dataset_status="acquired",
        dataset_image_count=2,
        dataset_storage_path="datasets/test_pipe/",
    )
    db_session.add(ds)
    db_session.commit()

    with patch("app.services.profiling_service.calculate_dataset_file_checksum", return_value=("chk123", ["img1.jpg", "img2.jpg"], 200)), \
         patch("app.services.profiling_service.extract_basic_image_stats", return_value={"total_images": 2}), \
         patch("app.services.profiling_service.calculate_quality_metrics", return_value={"evaluated_images": 2}), \
         patch("app.services.profiling_service.calculate_label_distribution", return_value={"status": "unavailable"}), \
         patch("app.services.profiling_service.get_or_create_profiling_embeddings", return_value={"img1.jpg": [0.1]*768, "img2.jpg": [0.2]*768}), \
         patch("app.services.profiling_service.calculate_clustering_statistics", return_value={"status": "completed"}), \
         patch("app.services.profiling_service.extract_llm_metadata", return_value={"status": "unavailable"}):

        profiling_service.run_profiling_pipeline(dataset_id=dataset_id)

    # Verify profiling result in database was completed cleanly without DetachedInstanceError
    result = db_session.exec(
        select(DatasetProfilingResult).where(DatasetProfilingResult.dataset_id == dataset_id)
    ).first()
    assert result is not None
    assert result.status == "completed"
    assert result.profile_payload["dataset"]["dataset_name"] == "Pipeline Test DS"

