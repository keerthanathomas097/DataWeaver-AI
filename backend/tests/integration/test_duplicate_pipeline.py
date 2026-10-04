import uuid
import numpy as np
import pytest
from unittest.mock import patch
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.services.duplicate_detection_service import run_duplicate_detection_pipeline, check_cancellation
from tests.fixtures.synthetic_images import (
    create_natural_photo_image,
    create_grayscale_image,
    image_to_bytes,
)


def mock_generate_embeddings(images, batch_size=16):
    n = len(images)
    if n == 0:
        return np.empty((0, 1280), dtype=np.float32)
    # Return normalized mock vectors
    vecs = np.ones((n, 1280), dtype=np.float32)
    clip_part = vecs[:, :512] / np.sqrt(512)
    dino_part = vecs[:, 512:] / np.sqrt(768)
    return np.concatenate([clip_part, dino_part], axis=-1)


@pytest.mark.integration
def test_pipeline_exact_duplicate_detection(db_session, test_dataset, mock_minio):
    # Create 3 images: img1 and img2 identical bytes (exact duplicates), img3 different
    img_photo1 = create_natural_photo_image(size=(64, 64), seed=10)
    img_photo2 = create_natural_photo_image(size=(64, 64), seed=20)
    
    photo1_bytes = image_to_bytes(img_photo1)
    photo2_bytes = image_to_bytes(img_photo2)
    
    prefix = test_dataset.dataset_storage_path
    mock_minio.storage[f"{prefix}image_a.jpg"] = photo1_bytes
    mock_minio.storage[f"{prefix}image_b.jpg"] = photo1_bytes  # exact duplicate of a
    mock_minio.storage[f"{prefix}image_c.jpg"] = photo2_bytes
    
    with patch("app.services.duplicate_detection_service.generate_embeddings", side_effect=mock_generate_embeddings):
        # Run the pipeline
        run_duplicate_detection_pipeline(test_dataset.dataset_id)
    
    db_session.refresh(test_dataset)
    assert test_dataset.dataset_status == "duplicates_detected"
    assert test_dataset.dataset_domain == "photographic"
    
    # Verify duplicate group was created
    groups = db_session.query(DatasetDuplicateGroup).filter(
        DatasetDuplicateGroup.dataset_id == test_dataset.dataset_id
    ).all()
    
    assert len(groups) >= 1
    exact_group = [g for g in groups if g.duplicate_group_detection_method == "exact_hash"][0]
    assert exact_group.duplicate_group_confidence_score == 1.0
    
    # Verify group images
    images = db_session.query(DatasetDuplicateGroupImage).filter(
        DatasetDuplicateGroupImage.duplicate_group_id == exact_group.duplicate_group_id
    ).all()
    assert len(images) == 2
    originals = [img for img in images if img.is_original_flag is True]
    duplicates = [img for img in images if img.is_original_flag is False]
    assert len(originals) == 1
    assert len(duplicates) == 1


@pytest.mark.integration
def test_pipeline_non_photographic_domain_routing(db_session, test_dataset, mock_minio):
    # Upload grayscale images to trigger non-photographic domain
    img_gray1 = create_grayscale_image(size=(64, 64))
    img_gray2 = create_grayscale_image(size=(64, 64))
    
    prefix = test_dataset.dataset_storage_path
    mock_minio.storage[f"{prefix}scan1.png"] = image_to_bytes(img_gray1, format="PNG")
    mock_minio.storage[f"{prefix}scan2.png"] = image_to_bytes(img_gray2, format="PNG")
    
    run_duplicate_detection_pipeline(test_dataset.dataset_id)
    
    db_session.refresh(test_dataset)
    assert test_dataset.dataset_status == "duplicates_detected"
    assert test_dataset.dataset_domain == "non_photographic"


@pytest.mark.integration
def test_pipeline_cancellation_cleanup(db_session, test_dataset, mock_minio):
    # Set status to cancelled
    test_dataset.dataset_status = "cancelled"
    db_session.add(test_dataset)
    db_session.commit()
    
    # Seed a duplicate group
    group = DatasetDuplicateGroup(
        dataset_id=test_dataset.dataset_id,
        duplicate_group_detection_method="exact_hash",
        duplicate_group_confidence_score=1.0,
    )
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    
    is_cancelled = check_cancellation(test_dataset.dataset_id)
    assert is_cancelled is True
    
    # Ensure duplicate groups were cleaned up
    remaining_groups = db_session.query(DatasetDuplicateGroup).filter(
        DatasetDuplicateGroup.dataset_id == test_dataset.dataset_id
    ).all()
    assert len(remaining_groups) == 0
