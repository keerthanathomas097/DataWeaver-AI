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
