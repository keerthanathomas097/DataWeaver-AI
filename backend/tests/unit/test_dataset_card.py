import io
import uuid
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch

from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.workspace import Workspace
from app.models.profiling import DatasetProfilingResult
from app.models.domain_gap import DatasetDomainGapResult
from app.services.dataset_card_service import (
    build_dataset_card_data,
    generate_dataset_card_pdf,
    sanitize_filename,
)


def test_sanitize_filename():
    assert sanitize_filename("My Dataset Name! 123") == "My_Dataset_Name_123"
    assert sanitize_filename("dataset/with\\illegal?chars*") == "dataset_with_illegal_chars"
    assert sanitize_filename("a" * 100) == "a" * 50
    assert sanitize_filename("") == "dataset"


def test_build_dataset_card_data_unprofiled():
    ws_id = uuid.uuid4()
    user_id = uuid.uuid4()
    ds_id = uuid.uuid4()

    mock_dataset = Dataset(
        dataset_id=ds_id,
        workspace_id=ws_id,
        dataset_name="Raw Camera Photos",
        dataset_source_type="local_upload",
        dataset_license="CC-BY-4.0",
        dataset_image_count=42,
        dataset_storage_path="datasets/raw/",
        dataset_status="acquired",
    )
    mock_workspace = Workspace(
        workspace_id=ws_id,
        workspace_name="Research Lab A",
        user_id=user_id,
    )

    mock_session = MagicMock()
    mock_session.get.side_effect = lambda model, pk: (
        mock_dataset if model == Dataset and pk == ds_id
        else mock_workspace if model == Workspace and pk == ws_id
        else None
    )

    mock_exec = MagicMock()
    mock_exec.first.return_value = None
    mock_exec.all.return_value = []
    mock_session.exec.return_value = mock_exec

    with patch("app.services.dataset_service.get_dataset_by_id", return_value=mock_dataset):
        with patch("app.services.dataset_card_service.calculate_dataset_file_checksum", return_value=("chk_abc", ["1.jpg"], 1024)):
            card = build_dataset_card_data(mock_session, ds_id, user_id)

            assert card["identity"]["dataset_name"] == "Raw Camera Photos"
            assert card["identity"]["workspace_name"] == "Research Lab A"
            assert card["composition"]["status"] == "not_yet_profiled"
            assert card["duplicate_detection"]["status"] == "not_yet_computed"
            assert card["purpose_fitting"]["status"] == "not_yet_profiled"
            assert card["domain_check"]["status"] == "not_assessed"
            assert card["integrated_findings"]["completeness_score"] == 0
            assert card["integrated_findings"]["completeness_level"] == "Minimal"


def test_build_dataset_card_data_fully_profiled():
    ws_id = uuid.uuid4()
    user_id = uuid.uuid4()
    ds_id = uuid.uuid4()

    mock_dataset = Dataset(
        dataset_id=ds_id,
        workspace_id=ws_id,
        dataset_name="Autonomous Vehicle Obstacles",
        dataset_source_type="kaggle",
        dataset_license="MIT",
        dataset_image_count=500,
        dataset_storage_path="datasets/av/",
        dataset_status="duplicates_detected",
    )
    mock_workspace = Workspace(
        workspace_id=ws_id,
        workspace_name="Perception Lab",
        user_id=user_id,
    )

    checksum = "chk_fresh_123"
    profile_payload = {
        "basic_statistics": {
            "total_images": 500,
            "corrupted_images": 0,
            "formats": {"jpeg": 450, "png": 50},
            "color_modes": {"RGB": 500},
            "channels": {"3": 500},
            "aspect_ratios": {"categories": {"landscape": 480, "square": 20}},
            "dimensions": {
                "width": {"min": 1920, "max": 1920, "mean": 1920.0, "std": 0.0},
                "height": {"min": 1080, "max": 1080, "mean": 1080.0, "std": 0.0},
            },
            "file_sizes_bytes": {"total_bytes": 104857600},
        },
        "quality": {
            "counts": {"blurred_images": 5, "normal_images": 490, "underexposed_images": 3, "overexposed_images": 2},
            "metrics": {"blur": {"mean": 250.0}, "brightness": {"mean": 115.0}},
        },
        "labels": {
            "status": "available",
            "num_classes": 5,
            "total_labeled_images": 500,
            "class_counts": {"car": 200, "pedestrian": 150, "cyclist": 80, "truck": 50, "bus": 20},
            "metrics": {"balance_indicator": "moderately_imbalanced", "max_to_min_ratio": 10.0},
        },
        "diversity": {
            "status": "completed",
            "cluster_count": 8,
            "noise_count": 25,
            "noise_ratio": 0.05,
            "silhouette_score": 0.32,
        },
        "metadata_insights": {
            "stated_purpose": "Obstacle detection for autonomous vehicle perception systems.",
            "known_limitations": "Captured during clear daylight; minimal nighttime coverage.",
        },
    }

    mock_profiling = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=ds_id,
        file_list_checksum=checksum,
        status="completed",
        profile_payload=profile_payload,
        computed_at=datetime.utcnow(),
    )

    mock_dup_group = DatasetDuplicateGroup(
        duplicate_group_id=uuid.uuid4(),
        dataset_id=ds_id,
        duplicate_group_detection_method="exact_hash",
        duplicate_group_confidence_score=1.0,
    )
    mock_dup_img1 = DatasetDuplicateGroupImage(
        duplicate_group_id=mock_dup_group.duplicate_group_id,
        image_storage_path="datasets/av/1.jpg",
        is_original_flag=True,
    )
    mock_dup_img2 = DatasetDuplicateGroupImage(
        duplicate_group_id=mock_dup_group.duplicate_group_id,
        image_storage_path="datasets/av/2.jpg",
        is_original_flag=False,
    )

    mock_dg = DatasetDomainGapResult(
        result_id=uuid.uuid4(),
        dataset_id=ds_id,
        sample_set_id=uuid.uuid4(),
        file_list_checksum=checksum,
        result={
            "coverage_pct": 85.0,
            "verdict": "Low gap",
            "counts": {"covered_samples": 17, "total_samples": 20},
            "baseline": {"threshold": 0.72, "median": 0.81},
            "centroid_similarity": 0.88,
            "distribution_distance": {"metric": "MMD", "value": 0.045},
            "caveats": ["Heuristic estimate"],
        },
    )

    mock_session = MagicMock()
    mock_session.get.side_effect = lambda model, pk: (
        mock_dataset if model == Dataset and pk == ds_id
        else mock_workspace if model == Workspace and pk == ws_id
        else None
    )

    def exec_side_effect(query):
        q_str = str(query)
        res = MagicMock()
        if "tbl_dataset_profiling_results" in q_str:
            res.first.return_value = mock_profiling
            return res
        if "tbl_dataset_duplicate_groups" in q_str:
            res.all.return_value = [mock_dup_group]
            return res
        if "tbl_dataset_duplicate_group_images" in q_str:
            res.all.return_value = [mock_dup_img1, mock_dup_img2]
            return res
        if "tbl_dataset_domain_gap_results" in q_str:
            res.first.return_value = mock_dg
            return res
        res.first.return_value = None
        res.all.return_value = []
        return res

    mock_session.exec.side_effect = exec_side_effect

    with patch("app.services.dataset_service.get_dataset_by_id", return_value=mock_dataset):
        with patch("app.services.dataset_card_service.calculate_dataset_file_checksum", return_value=(checksum, ["1.jpg"], 104857600)):
            card = build_dataset_card_data(mock_session, ds_id, user_id)

            assert card["identity"]["dataset_name"] == "Autonomous Vehicle Obstacles"
            assert card["identity"]["stated_purpose"] == "Obstacle detection for autonomous vehicle perception systems."
            assert card["composition"]["status"] == "completed"
            assert card["composition"]["total_images"] == 500
            assert card["composition"]["labels"]["num_classes"] == 5

            assert card["duplicate_detection"]["status"] == "completed"
            assert card["duplicate_detection"]["affected_images_count"] == 2
            assert card["duplicate_detection"]["exact_duplicate_groups"] == 1

            assert card["purpose_fitting"]["status"] == "completed"
            assert len(card["purpose_fitting"]["purposes_evaluated"]) == 8

            assert card["domain_check"]["status"] == "completed"
            assert card["domain_check"]["coverage_pct"] == 85.0
            assert card["domain_check"]["verdict"] == "Low gap"

            assert card["integrated_findings"]["completeness_score"] == 100
            assert card["integrated_findings"]["completeness_level"] == "Comprehensive"


def test_build_dataset_card_data_staleness_detection():
    ws_id = uuid.uuid4()
    user_id = uuid.uuid4()
    ds_id = uuid.uuid4()

    mock_dataset = Dataset(
        dataset_id=ds_id,
        workspace_id=ws_id,
        dataset_name="Stale Dataset",
        dataset_source_type="local",
        dataset_image_count=100,
        dataset_storage_path="datasets/stale/",
    )
    mock_workspace = Workspace(workspace_id=ws_id, user_id=user_id)

    mock_profiling = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=ds_id,
        file_list_checksum="old_hash_111",
        status="completed",
        profile_payload={"basic_statistics": {"total_images": 90}},
    )

    mock_session = MagicMock()
    mock_session.get.side_effect = lambda model, pk: mock_dataset if model == Dataset else mock_workspace
    
    def exec_side_effect(query):
        q_str = str(query)
        res = MagicMock()
        if "tbl_dataset_profiling_results" in q_str:
            res.first.return_value = mock_profiling
            return res
        res.first.return_value = None
        res.all.return_value = []
        return res

    mock_session.exec.side_effect = exec_side_effect

    with patch("app.services.dataset_service.get_dataset_by_id", return_value=mock_dataset):
        with patch("app.services.dataset_card_service.calculate_dataset_file_checksum", return_value=("new_hash_222", ["img.jpg"], 500)):
            card = build_dataset_card_data(mock_session, ds_id, user_id)
            assert card["composition"]["status"] == "stale"
            assert "modified since profiling" in card["composition"]["status_message"]


def test_generate_dataset_card_pdf():
    # Build complete dummy card data
    card_data = {
        "identity": {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Solar Panel Defect Dataset",
            "workspace_id": str(uuid.uuid4()),
            "workspace_name": "Energy AI Lab",
            "dataset_source_type": "industrial_camera",
            "dataset_source_url": "https://doi.org/10.1000/182",
            "dataset_license": "CC-BY-NC-4.0",
            "dataset_image_count": 1250,
            "dataset_storage_path": "datasets/solar_panels/",
            "dataset_domain": "photovoltaic_infrared",
            "dataset_status": "duplicates_detected",
            "dataset_created_at": "2026-03-15T10:00:00",
            "file_list_checksum": "a1b2c3d4e5f67890",
            "total_size_bytes": 524288000,
            "stated_purpose": "Classification and localization of micro-cracks on photovoltaic surfaces.",
            "documented_limitations": "Captured at 45 degree angle; outdoor lighting only.",
            "card_generated_at": datetime.utcnow().isoformat(),
        },
        "composition": {
            "status": "completed",
            "computed_at": datetime.utcnow().isoformat(),
            "total_images": 1250,
            "corrupted_images": 0,
            "formats": {"jpeg": 1000, "png": 250},
            "aspect_ratios": {"categories": {"landscape": 1200, "square": 50}},
            "dimensions": {
                "width": {"min": 1024, "max": 1024, "mean": 1024.0},
                "height": {"min": 768, "max": 768, "mean": 768.0},
            },
            "quality": {
                "counts": {"normal_images": 1200, "blurred_images": 30, "underexposed_images": 20},
            },
            "labels": {
                "status": "available",
                "num_classes": 4,
                "total_labeled_images": 1250,
                "class_counts": {"clean": 700, "crack": 300, "hotspot": 150, "delamination": 100},
                "metrics": {"balance_indicator": "moderately_imbalanced"},
            },
        },
        "duplicate_detection": {
            "status": "completed",
            "total_examined": 1250,
            "duplicate_groups_count": 12,
            "affected_images_count": 28,
            "duplicate_ratio": 0.0224,
            "exact_duplicates_count": 8,
            "near_duplicates_count": 20,
            "exact_duplicate_groups": 4,
            "near_duplicate_groups": 8,
        },
        "purpose_fitting": {
            "status": "completed",
            "purposes_evaluated": [
                {
                    "purpose_key": "classification",
                    "purpose_display_name": "Image Classification",
                    "overall_status": "Good Fit",
                    "tier": 1,
                    "favorable_count": 5,
                    "neutral_count": 2,
                    "warning_count": 0,
                    "critical_count": 0,
                    "top_findings": [],
                },
                {
                    "purpose_key": "object_detection",
                    "purpose_display_name": "Object Detection",
                    "overall_status": "Review Recommended",
                    "tier": 2,
                    "favorable_count": 3,
                    "neutral_count": 2,
                    "warning_count": 1,
                    "critical_count": 0,
                    "top_findings": [{"message": "High aspect ratio uniformity may limit bounding box scale diversity."}],
                },
            ],
        },
        "domain_check": {
            "status": "completed",
            "coverage_pct": 78.5,
            "verdict": "Moderate gap",
            "counts": {"covered_samples": 22, "total_samples": 28},
            "baseline_threshold": 0.68,
            "centroid_similarity": 0.82,
            "distribution_distance": {"value": 0.061},
        },
        "integrated_findings": {
            "strengths": ["100% valid images", "Well documented purpose", "Low duplicate ratio (2.2%)"],
            "risks_and_concerns": ["Moderate domain gap against deployment photos", "4 classes with moderate imbalance"],
            "suitability_summary": "Suitable for classification baseline evaluation with low redundancy.",
            "completeness_score": 90,
            "completeness_level": "Comprehensive",
        },
        "provenance": {
            "source_provenance": {"checksum": "a1b2c3d4e5f67890"},
        },
    }

    pdf_bytes = generate_dataset_card_pdf(card_data)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000
    assert pdf_bytes.startswith(b"%PDF-")
