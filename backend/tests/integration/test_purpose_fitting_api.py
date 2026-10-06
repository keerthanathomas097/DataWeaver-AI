import uuid
import datetime
import pytest
from app.models.profiling import DatasetProfilingResult
from tests.unit.test_purpose_fitting import sample_profile_payload


def test_get_purposes_list(client):
    res = client.get("/datasets/purpose-fit/purposes")
    assert res.status_code == 200
    purposes = res.json()
    assert len(purposes) == 8
    keys = [p["key"] for p in purposes]
    assert "classification" in keys
    assert "benchmarking" in keys


def test_purpose_fit_unauthenticated(client, test_dataset):
    res = client.post(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit",
        json={"purpose_key": "classification"},
    )
    assert res.status_code == 401


def test_purpose_fit_non_existent_dataset(client, auth_headers):
    fake_id = uuid.uuid4()
    res = client.post(
        f"/datasets/{fake_id}/purpose-fit",
        headers=auth_headers,
        json={"purpose_key": "classification"},
    )
    assert res.status_code == 404


def test_purpose_fit_unprofiled_dataset(client, auth_headers, test_dataset):
    res = client.post(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit",
        headers=auth_headers,
        json={"purpose_key": "classification"},
    )
    assert res.status_code == 404
    assert "Generate a dataset profile" in res.json()["detail"]


def test_purpose_fit_in_progress_profiling(client, auth_headers, db_session, test_dataset):
    profiling_rec = DatasetProfilingResult(
        dataset_id=test_dataset.dataset_id,
        file_list_checksum="chk_progress",
        status="profiling",
        profile_payload={"stage": "clustering"},
    )
    db_session.add(profiling_rec)
    db_session.commit()

    res = client.post(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit",
        headers=auth_headers,
        json={"purpose_key": "classification"},
    )
    assert res.status_code == 409
    assert "still in progress" in res.json()["detail"]


def test_purpose_fit_completed_successful(client, auth_headers, db_session, test_dataset):
    payload = sample_profile_payload(
        duplicate_ratio=0.75,
        blurred_pct=25.0,
        stated_purpose="This dataset was created for image retrieval and similarity search.",
    )
    profiling_rec = DatasetProfilingResult(
        dataset_id=test_dataset.dataset_id,
        file_list_checksum="chk_complete",
        status="completed",
        profile_payload=payload,
    )
    db_session.add(profiling_rec)
    db_session.commit()

    res = client.post(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit",
        headers=auth_headers,
        json={"purpose_key": "classification"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["purpose_key"] == "classification"
    assert data["purpose_display_name"] == "Image Classification"
    assert "summary" in data
    assert "radar_data" in data
    assert "flagged_findings" in data
    assert "dataset_characteristics" in data
    assert "unavailable_metrics" in data
    assert data["config_version"] == "1.0"
    assert data["provenance"]["type"] == "heuristic"

    # Mismatch notice check
    assert data["purpose_mismatch"] is not None
    assert data["purpose_mismatch"]["mismatch"] is True


def test_purpose_fit_invalid_purpose_key(client, auth_headers, db_session, test_dataset):
    payload = sample_profile_payload()
    profiling_rec = DatasetProfilingResult(
        dataset_id=test_dataset.dataset_id,
        file_list_checksum="chk_complete_2",
        status="completed",
        profile_payload=payload,
    )
    db_session.add(profiling_rec)
    db_session.commit()

    res = client.post(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit",
        headers=auth_headers,
        json={"purpose_key": "invalid_purpose_xyz"},
    )
    assert res.status_code == 422
    assert "Invalid purpose_key" in res.json()["detail"]


def test_get_clip_analysis_status_not_computed(client, auth_headers, test_dataset):
    res = client.get(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit/clip-analysis",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "not_computed"
    assert data["has_labels"] is False


def test_trigger_clip_analysis_endpoint(client, auth_headers, test_dataset):
    from unittest.mock import patch
    mock_result = {
        "has_labels": True,
        "status": "available",
        "mismatch_ratio": 0.085,
        "threshold": 0.20,
        "total_evaluated": 20,
        "mismatched_count": 2,
        "class_breakdown": {"cat": {"count": 10, "label_query": "a photo of a cat"}},
        "worst_matches": [
            {"image_path": "datasets/1/cat/x.jpg", "label": "cat", "score": 0.12, "image_url": "http://img/x"}
        ],
    }

    with patch("app.routers.purpose_fitting.check_label_match", return_value=mock_result):
        res = client.post(
            f"/datasets/{test_dataset.dataset_id}/purpose-fit/clip-analysis",
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["has_labels"] is True
        assert data["mismatch_ratio"] == 0.085
        assert len(data["worst_matches"]) == 1


def test_run_text_match_endpoint(client, auth_headers, test_dataset):
    from unittest.mock import patch
    mock_search = {
        "query_text": "nighttime outdoor photos",
        "total_images_scored": 15,
        "score_distribution": {
            "bins": ["< 0.15", "0.15 - 0.20", "0.20 - 0.25", "0.25 - 0.30", "> 0.30"],
            "counts": [2, 5, 4, 3, 1],
            "mean_score": 0.215,
            "min_score": 0.11,
            "max_score": 0.32,
        },
        "best_matches": [{"image_path": "p1.jpg", "score": 0.32, "image_url": "http://p1"}],
        "worst_matches": [{"image_path": "p2.jpg", "score": 0.11, "image_url": "http://p2"}],
    }

    with patch("app.routers.purpose_fitting.search_text_match", return_value=mock_search):
        res = client.post(
            f"/datasets/{test_dataset.dataset_id}/purpose-fit/text-match",
            headers=auth_headers,
            json={"query_text": "nighttime outdoor photos"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["query_text"] == "nighttime outdoor photos"
        assert data["total_images_scored"] == 15
        assert len(data["best_matches"]) == 1


def test_run_text_match_empty_query(client, auth_headers, test_dataset):
    res = client.post(
        f"/datasets/{test_dataset.dataset_id}/purpose-fit/text-match",
        headers=auth_headers,
        json={"query_text": ""},
    )
    assert res.status_code == 422

