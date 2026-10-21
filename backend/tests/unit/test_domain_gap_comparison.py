import uuid
import pytest
import numpy as np
from unittest.mock import MagicMock, patch

from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.models.domain_gap import DomainSampleSet, WorkspaceDomainGapComparison
from app.services.domain_gap_compare_service import (
    load_domain_gap_compare_config,
    compute_comparison_signature,
    evaluate_workspace_datasets_eligibility,
    derive_comparison_metrics,
    build_or_retrieve_comparison_matrix,
)


def test_compare_config_loading():
    cfg = load_domain_gap_compare_config()
    assert "require_duplicate_detection" in cfg
    assert "max_datasets" in cfg
    assert "near_miss_margin" in cfg
    assert "size_ratio_warning" in cfg
    assert cfg["near_miss_margin"] == 0.10
    assert cfg["max_datasets"] == 12


def test_signature_deterministic():
    d1 = uuid.uuid4()
    d2 = uuid.uuid4()
    sig1 = compute_comparison_signature([(d1, "chkA"), (d2, "chkB")])
    sig2 = compute_comparison_signature([(d2, "chkB"), (d1, "chkA")])
    assert sig1 == sig2

    sig3 = compute_comparison_signature([(d1, "chkA"), (d2, "chkC")])
    assert sig1 != sig3


def test_eligibility_reasons():
    ws_id = uuid.uuid4()
    mock_session = MagicMock()

    # Create 4 datasets:
    # 1: no images
    ds_no_img = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=ws_id,
        dataset_name="Empty DS",
        dataset_storage_path="",
        dataset_image_count=0,
    )
    # 2: not profiled
    ds_not_prof = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=ws_id,
        dataset_name="Unprofiled DS",
        dataset_storage_path="datasets/unprof",
        dataset_image_count=50,
    )
    # 3: duplicates not run
    ds_no_dup = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=ws_id,
        dataset_name="No Dup DS",
        dataset_storage_path="datasets/nodup",
        dataset_image_count=50,
        dataset_status="completed",
    )
    # 4: fully eligible
    ds_ok = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=ws_id,
        dataset_name="Eligible DS",
        dataset_storage_path="datasets/ok",
        dataset_image_count=100,
        dataset_status="duplicates_detected",
    )

    all_ds = [ds_no_img, ds_not_prof, ds_no_dup, ds_ok]

    mock_exec = MagicMock()
    mock_exec.all.return_value = all_ds

    # Setup profiling lookup
    prof_no_dup = DatasetProfilingResult(
        dataset_id=ds_no_dup.dataset_id,
        status="completed",
        profile_payload={"duplicates": {"status": "not_run"}},
    )
    prof_ok = DatasetProfilingResult(
        dataset_id=ds_ok.dataset_id,
        status="completed",
        profile_payload={"duplicates": {"status": "completed", "duplicate_groups_count": 2}},
    )

    def exec_side_effect(query):
        res = MagicMock()
        q_str = str(query)
        if "tbl_datasets" in q_str:
            res.all.return_value = all_ds
            return res
        if "tbl_dataset_domain_gap_results" in q_str:
            res.first.return_value = None
            return res
        try:
            params = query.compile().params
            for p_val in params.values():
                if p_val == ds_no_dup.dataset_id:
                    res.first.return_value = prof_no_dup
                    return res
                if p_val == ds_ok.dataset_id:
                    res.first.return_value = prof_ok
                    return res
        except Exception:
            pass
        res.first.return_value = None
        res.all.return_value = []
        return res

    mock_session.exec.side_effect = exec_side_effect

    with patch("app.services.domain_gap_compare_service.calculate_dataset_file_checksum") as mock_chk:
        mock_chk.return_value = ("chk_123", ["img1.jpg", "img2.jpg"], 1024)
        with patch("app.services.domain_gap_compare_service.get_profiling_collection") as mock_chroma:
            mock_coll = MagicMock()
            mock_coll.get.return_value = {"ids": ["1", "2"]}
            mock_chroma.return_value = mock_coll

            eligible, ineligible = evaluate_workspace_datasets_eligibility(
                session=mock_session,
                workspace_id=ws_id,
                config={"require_duplicate_detection": True, "max_datasets": 12},
            )

            assert len(eligible) == 1
            assert eligible[0]["dataset_name"] == "Eligible DS"

            reasons = {item["dataset_name"]: item["reason"] for item in ineligible}
            assert reasons["Empty DS"] == "no_images"
            assert reasons["Unprofiled DS"] == "not_profiled"
            assert reasons["No Dup DS"] == "duplicates_not_run"


def test_derive_comparison_metrics_and_ranking():
    sample_set = DomainSampleSet(
        sample_set_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        image_paths=[f"samples/{i}.jpg" for i in range(10)],
        sample_count=10,
    )

    matrix = [
        {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Dataset A",
            "dataset_image_count": 100,
            "cutoff": 0.80,
            "baseline_median": 0.85,
            "per_photo": [
                {"sample_index": i, "similarity": 0.85 if i < 8 else 0.60, "nearest_image_path": "a.jpg"}
                for i in range(10)
            ],
        },
        {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Dataset B",
            "dataset_image_count": 600,  # 6x Dataset A -> triggers size warning
            "cutoff": 0.70,
            "baseline_median": 0.75,
            "per_photo": [
                {"sample_index": i, "similarity": 0.72 if i < 6 else 0.50, "nearest_image_path": "b.jpg"}
                for i in range(10)
            ],
        },
    ]

    with patch("app.services.domain_gap_compare_service.sign_url", return_value="https://presigned/img.jpg"):
        derived = derive_comparison_metrics(
            matrix=matrix,
            sample_set=sample_set,
            requested_reference=0.75,
            config={"near_miss_margin": 0.10, "size_ratio_warning": 5},
        )

        assert derived["reference_similarity"] == 0.75
        assert derived["near_miss_threshold"] == 0.65
        ranked = derived["ranked_datasets"]
        assert len(ranked) == 2

        # Dataset A has median 0.85, Dataset B has median ~0.72 -> Dataset A should rank #1
        assert ranked[0]["dataset_name"] == "Dataset A"
        assert ranked[0]["rank"] == 1
        assert ranked[0]["covered_count"] == 8
        assert ranked[0]["coverage_pct"] == 80.0
        assert ranked[0]["near_miss_count"] == 0
        assert ranked[0]["far_count"] == 2

        assert ranked[1]["dataset_name"] == "Dataset B"
        assert ranked[1]["rank"] == 2
        # Dataset B size warning should be present
        assert ranked[1]["size_warning"] is not None

        # Best match
        assert derived["best_match_dataset_name"] == "Dataset A"
        assert "Dataset A provides the strongest coverage" in derived["summary_sentence"]

        # Combined coverage
        assert len(derived["combined_coverage"]) >= 1
        assert derived["combined_coverage"][0]["dataset_name"] == "Dataset A"


def test_greedy_combined_coverage_complementary():
    sample_set = DomainSampleSet(
        sample_set_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        image_paths=[f"samples/{i}.jpg" for i in range(4)],
        sample_count=4,
    )

    # Dataset A covers photos 0 and 1
    # Dataset B covers photos 2 and 3
    matrix = [
        {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Dataset Day",
            "dataset_image_count": 100,
            "cutoff": 0.70,
            "per_photo": [
                {"sample_index": 0, "similarity": 0.85},
                {"sample_index": 1, "similarity": 0.82},
                {"sample_index": 2, "similarity": 0.40},
                {"sample_index": 3, "similarity": 0.45},
            ],
        },
        {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Dataset Night",
            "dataset_image_count": 100,
            "cutoff": 0.70,
            "per_photo": [
                {"sample_index": 0, "similarity": 0.50},
                {"sample_index": 1, "similarity": 0.48},
                {"sample_index": 2, "similarity": 0.88},
                {"sample_index": 3, "similarity": 0.90},
            ],
        },
    ]

    with patch("app.services.domain_gap_compare_service.sign_url", return_value="https://presigned/img.jpg"):
        derived = derive_comparison_metrics(
            matrix=matrix,
            sample_set=sample_set,
            requested_reference=0.70,
            config={"near_miss_margin": 0.10, "size_ratio_warning": 5},
        )

        steps = derived["combined_coverage"]
        assert len(steps) == 2
        assert steps[0]["newly_covered_count"] == 2
        assert steps[0]["cumulative_covered_count"] == 2
        assert steps[0]["cumulative_coverage_pct"] == 50.0

        assert steps[1]["newly_covered_count"] == 2
        assert steps[1]["cumulative_covered_count"] == 4
        assert steps[1]["cumulative_coverage_pct"] == 100.0
