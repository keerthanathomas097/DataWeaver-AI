import uuid
import pytest
from unittest.mock import MagicMock, patch
import torch
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.models.user import User
from app.models.workspace import Workspace
from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.models.clip_finding import DatasetClipFinding
from app.services import clip_concept_service
from app.services.purpose_fitting_service import evaluate_purpose_fit, load_purpose_fitting_rules
from tests.fixtures.synthetic_images import create_natural_photo_image


@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def create_mock_clip_components():
    mock_clip_proc = MagicMock()
    mock_clip_proc.return_value = {"pixel_values": torch.zeros((2, 3, 224, 224))}

    mock_clip_model = MagicMock()
    # Image features (2 images, 512-dim normalized)
    img_feat = torch.tensor([[1.0, 0.0] + [0.0] * 510, [0.0, 1.0] + [0.0] * 510], dtype=torch.float32)
    mock_clip_model.get_image_features.return_value = img_feat

    # Text features (2 queries, 512-dim normalized)
    # Query 0 matches img 0 (dot product 1.0), Query 1 matches img 1 (dot product 1.0)
    txt_feat = torch.tensor([[1.0, 0.0] + [0.0] * 510, [0.0, 1.0] + [0.0] * 510], dtype=torch.float32)
    mock_clip_model.get_text_features.return_value = txt_feat

    return "cpu", mock_clip_proc, mock_clip_model


def test_score_images_against_text_empty():
    assert clip_concept_service.score_images_against_text([], ["query"]) == {}
    assert clip_concept_service.score_images_against_text(["path/to/img.jpg"], []) == {}


def test_score_images_against_text_with_mock():
    mock_components = create_mock_clip_components()
    img1 = create_natural_photo_image(size=(64, 64), seed=1)
    img2 = create_natural_photo_image(size=(64, 64), seed=2)

    with patch("app.services.clip_concept_service.get_clip_components", return_value=mock_components):
        with patch("app.services.clip_concept_service.get_image_safely", side_effect=[img1, img2]):
            scores = clip_concept_service.score_images_against_text(
                ["datasets/1/cat/1.jpg", "datasets/1/dog/2.jpg"],
                ["a photo of a cat", "a photo of a dog"],
                batch_size=2,
            )

            assert len(scores) == 2
            assert "datasets/1/cat/1.jpg" in scores
            assert "datasets/1/dog/2.jpg" in scores
            # Img 0 should have dot product 1.0 with Query 0 and 0.0 with Query 1
            assert scores["datasets/1/cat/1.jpg"]["a photo of a cat"] == 1.0
            assert scores["datasets/1/cat/1.jpg"]["a photo of a dog"] == 0.0
            assert scores["datasets/1/dog/2.jpg"]["a photo of a dog"] == 1.0


def test_check_label_match_no_labels(test_db_session):
    dataset_id = uuid.uuid4()
    dataset = Dataset(
        dataset_id=dataset_id,
        workspace_id=uuid.uuid4(),
        dataset_name="Flat Dataset",
        dataset_source_type="custom",
        dataset_image_count=3,
        dataset_storage_path=f"datasets/{dataset_id}/",
        dataset_status="ready",
    )
    test_db_session.add(dataset)
    test_db_session.commit()

    # Return flat images (no subfolder categories)
    flat_paths = [
        f"datasets/{dataset_id}/img1.jpg",
        f"datasets/{dataset_id}/img2.jpg",
        f"datasets/{dataset_id}/img3.jpg",
    ]

    with patch("app.services.clip_concept_service.calculate_dataset_file_checksum", return_value=("chk123", flat_paths, 3000)):
        result = clip_concept_service.check_label_match(dataset_id, test_db_session)
        assert result["has_labels"] is False
        assert result["status"] == "unavailable"
        assert result["mismatch_ratio"] is None


def test_check_label_match_with_labels(test_db_session):
    dataset_id = uuid.uuid4()
    dataset = Dataset(
        dataset_id=dataset_id,
        workspace_id=uuid.uuid4(),
        dataset_name="Labeled Dataset",
        dataset_source_type="custom",
        dataset_image_count=3,
        dataset_storage_path=f"datasets/{dataset_id}/",
        dataset_status="ready",
    )
    test_db_session.add(dataset)
    test_db_session.commit()

    labeled_paths = [
        f"datasets/{dataset_id}/cats/1.jpg",
        f"datasets/{dataset_id}/cats/2.jpg",
        f"datasets/{dataset_id}/dogs/3.jpg",
    ]

    mock_scores = {
        f"datasets/{dataset_id}/cats/1.jpg": {"a photo of a cats": 0.28, "a photo of a dogs": 0.12},
        f"datasets/{dataset_id}/cats/2.jpg": {"a photo of a cats": 0.14, "a photo of a dogs": 0.10},  # Mismatched (< 0.20)
        f"datasets/{dataset_id}/dogs/3.jpg": {"a photo of a cats": 0.08, "a photo of a dogs": 0.32},
    }

    with patch("app.services.clip_concept_service.calculate_dataset_file_checksum", return_value=("chk123", labeled_paths, 3000)):
        with patch("app.services.clip_concept_service.score_images_against_text", return_value=mock_scores):
            with patch("app.services.clip_concept_service.generate_presigned_url", return_value="http://minio/signed-url"):
                result = clip_concept_service.check_label_match(dataset_id, test_db_session, threshold=0.20)

                assert result["has_labels"] is True
                assert result["status"] == "available"
                assert result["total_evaluated"] == 3
                assert result["mismatched_count"] == 1
                assert result["mismatch_ratio"] == round(1 / 3.0, 4)
                assert len(result["worst_matches"]) == 3
                # Worst match is cats/2.jpg with score 0.14
                assert result["worst_matches"][0]["image_path"] == f"datasets/{dataset_id}/cats/2.jpg"
                assert result["worst_matches"][0]["score"] == 0.14
                assert result["worst_matches"][0]["image_url"] == "http://minio/signed-url"


def test_search_text_match(test_db_session):
    dataset_id = uuid.uuid4()
    dataset = Dataset(
        dataset_id=dataset_id,
        workspace_id=uuid.uuid4(),
        dataset_name="Search Dataset",
        dataset_source_type="custom",
        dataset_image_count=4,
        dataset_storage_path=f"datasets/{dataset_id}/",
        dataset_status="ready",
    )
    test_db_session.add(dataset)
    test_db_session.commit()

    paths = [
        f"datasets/{dataset_id}/1.jpg",
        f"datasets/{dataset_id}/2.jpg",
        f"datasets/{dataset_id}/3.jpg",
        f"datasets/{dataset_id}/4.jpg",
    ]

    mock_scores = {
        f"datasets/{dataset_id}/1.jpg": {"sunset at beach": 0.35},
        f"datasets/{dataset_id}/2.jpg": {"sunset at beach": 0.26},
        f"datasets/{dataset_id}/3.jpg": {"sunset at beach": 0.18},
        f"datasets/{dataset_id}/4.jpg": {"sunset at beach": 0.09},
    }

    with patch("app.services.clip_concept_service.calculate_dataset_file_checksum", return_value=("chk123", paths, 4000)):
        with patch("app.services.clip_concept_service.score_images_against_text", return_value=mock_scores):
            with patch("app.services.clip_concept_service.generate_presigned_url", return_value="http://minio/img"):
                res = clip_concept_service.search_text_match(dataset_id, "sunset at beach", test_db_session, top_k=2)

                assert res["total_images_scored"] == 4
                assert len(res["best_matches"]) == 2
                assert res["best_matches"][0]["image_path"] == f"datasets/{dataset_id}/1.jpg"
                assert res["best_matches"][0]["score"] == 0.35
                assert len(res["worst_matches"]) == 2
                assert res["worst_matches"][0]["image_path"] == f"datasets/{dataset_id}/4.jpg"
                assert res["worst_matches"][0]["score"] == 0.09

                dist = res["score_distribution"]
                assert sum(dist["counts"]) == 4
                assert dist["max_score"] == 0.35
                assert dist["min_score"] == 0.09


def test_rules_engine_evaluates_label_match_metric():
    """Confirms label_match_mismatch_ratio flows through the existing rules engine without code changes."""
    payload = {
        "profiling_version": "1.0",
        "dataset": {"dataset_id": str(uuid.uuid4()), "dataset_name": "Test", "dataset_domain": "natural_scenes"},
        "duplicates": {"status": "completed", "duplicate_ratio": 0.02},
        "basic_statistics": {
            "dimensions": {"resolution": {"std": 20.0}},
            "aspect_ratios": {"stats": {"std": 0.1}},
        },
        "quality": {
            "percentages": {"blurred_pct": 2.0},
            "brightness": {"std": 25.0},
        },
        "diversity": {"status": "completed", "cluster_count": 5, "silhouette_score": 0.35, "noise_ratio": 0.02},
        "labels": {"status": "available", "metrics": {"max_to_min_ratio": 1.2}},
        "clip_findings": {
            "label_match": {
                "has_labels": True,
                "mismatch_ratio": 0.25,  # Triggered threshold (> 0.15)
            }
        },
    }

    result = evaluate_purpose_fit(payload, "classification")
    rule_res = next((r for r in result["all_rules"] if r["metric_key"] == "label_match_mismatch_ratio"), None)

    assert rule_res is not None
    assert rule_res["applicable"] is True
    assert rule_res["triggered"] is True
    assert rule_res["verdict"] == "warning"
    assert "noticeable portion of images show low semantic similarity" in rule_res["message"]
