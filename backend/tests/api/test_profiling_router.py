import uuid
import datetime
import pytest
from unittest.mock import patch
from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult


@pytest.mark.api
def test_trigger_profiling_unauthorized(client):
    fake_id = uuid.uuid4()
    response = client.post(f"/datasets/{fake_id}/profile")
    assert response.status_code == 401


@pytest.mark.api
def test_trigger_profiling_not_found(client, auth_headers):
    fake_id = uuid.uuid4()
    response = client.post(f"/datasets/{fake_id}/profile", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.api
def test_trigger_profiling_missing_storage_path(client, auth_headers, test_workspace, db_session):
    ds = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=test_workspace.workspace_id,
        dataset_name="No Storage DS",
        dataset_source_type="kaggle",
        dataset_storage_path=None,
    )
    db_session.add(ds)
    db_session.commit()

    response = client.post(f"/datasets/{ds.dataset_id}/profile", headers=auth_headers)
    assert response.status_code == 400
    assert "storage path" in response.json()["detail"]


@pytest.mark.api
def test_trigger_profiling_background_start(client, auth_headers, test_workspace, db_session):
    ds = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=test_workspace.workspace_id,
        dataset_name="Ready DS",
        dataset_source_type="kaggle",
        dataset_storage_path="datasets/ready_ds/",
    )
    db_session.add(ds)
    db_session.commit()

    with patch("app.routers.profiling.calculate_dataset_file_checksum", return_value=("checksum123", ["img1.jpg"], 100)), \
         patch("app.routers.profiling.run_profiling_pipeline") as mock_pipeline:
        
        response = client.post(
            f"/datasets/{ds.dataset_id}/profile",
            json={"force_recompute": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "profiling"
        assert data["is_cached"] is False


@pytest.mark.api
def test_trigger_profiling_cached_checksum_hit(client, auth_headers, test_workspace, db_session):
    ds = Dataset(
        dataset_id=uuid.uuid4(),
        workspace_id=test_workspace.workspace_id,
        dataset_name="Cached DS",
        dataset_source_type="kaggle",
        dataset_storage_path="datasets/cached_ds/",
    )
    db_session.add(ds)

    existing_result = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=ds.dataset_id,
        computed_at=datetime.datetime.utcnow(),
        file_list_checksum="matched_checksum_999",
        status="completed",
        profile_payload={"sample": "data"},
    )
    db_session.add(existing_result)
    db_session.commit()

    with patch("app.routers.profiling.calculate_dataset_file_checksum", return_value=("matched_checksum_999", ["img1.jpg"], 100)):
        response = client.post(
            f"/datasets/{ds.dataset_id}/profile",
            json={"force_recompute": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["is_cached"] is True
        assert data["profiling_id"] == str(existing_result.profiling_id)


@pytest.mark.api
def test_get_profiling_status_unprofiled(client, auth_headers, test_dataset):
    response = client.get(f"/datasets/{test_dataset.dataset_id}/profiling-status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "not_profiled"


@pytest.mark.api
def test_get_profiling_status_active(client, auth_headers, test_dataset, db_session):
    rec = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=test_dataset.dataset_id,
        status="profiling",
        file_list_checksum="in_progress",
        profile_payload={"stage": "calculating_quality"},
    )
    db_session.add(rec)
    db_session.commit()

    response = client.get(f"/datasets/{test_dataset.dataset_id}/profiling-status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "profiling"
    assert data["stage"] == "calculating_quality"


@pytest.mark.api
def test_get_profiling_results_success(client, auth_headers, test_dataset, db_session):
    rec = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=test_dataset.dataset_id,
        status="completed",
        file_list_checksum="checksum_abc",
        profile_payload={"basic_statistics": {"total_images": 120}},
    )
    db_session.add(rec)
    db_session.commit()

    response = client.get(f"/datasets/{test_dataset.dataset_id}/profiling-results", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["file_list_checksum"] == "checksum_abc"
    assert data["profile_payload"]["basic_statistics"]["total_images"] == 120


@pytest.mark.api
def test_get_profiling_results_not_found(client, auth_headers, test_dataset):
    response = client.get(f"/datasets/{test_dataset.dataset_id}/profiling-results", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.api
def test_cancel_profiling(client, auth_headers, test_dataset, db_session):
    rec = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=test_dataset.dataset_id,
        status="profiling",
        file_list_checksum="in_progress",
        profile_payload={"stage": "generating_embeddings"},
    )
    db_session.add(rec)
    db_session.commit()

    response = client.post(f"/datasets/{test_dataset.dataset_id}/cancel-profiling", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    db_session.refresh(rec)
    assert rec.status == "cancelled"
