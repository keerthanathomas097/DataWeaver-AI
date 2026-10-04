import uuid
import pytest
from unittest.mock import MagicMock, patch
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage


@pytest.mark.api
def test_add_dataset_endpoint(client, auth_headers, test_workspace):
    payload = {
        "workspace_id": str(test_workspace.workspace_id),
        "dataset_name": "ISIC Melanoma Classification",
        "dataset_source_type": "kaggle",
        "dataset_source_url": "https://www.kaggle.com/c/siim-isic-melanoma-classification",
        "dataset_license": "CC-BY-NC 4.0",
        "dataset_image_count": 33000,
    }
    response = client.post("/datasets/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_name"] == payload["dataset_name"]
    assert data["workspace_id"] == str(test_workspace.workspace_id)
    assert data["dataset_status"] == "acquired"


@pytest.mark.api
def test_list_workspace_datasets_endpoint(client, auth_headers, test_workspace, test_dataset):
    response = client.get(f"/datasets/workspace/{test_workspace.workspace_id}", headers=auth_headers)
    assert response.status_code == 200
    datasets = response.json()
    assert len(datasets) >= 1
    assert any(d["dataset_id"] == str(test_dataset.dataset_id) for d in datasets)


@pytest.mark.api
def test_get_dataset_by_id_endpoint(client, auth_headers, test_dataset):
    response = client.get(f"/datasets/{test_dataset.dataset_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_id"] == str(test_dataset.dataset_id)
    assert data["dataset_name"] == test_dataset.dataset_name


@pytest.mark.api
def test_get_duplicate_status_endpoint(client, auth_headers, test_dataset):
    response = client.get(f"/datasets/{test_dataset.dataset_id}/duplicate-status", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["dataset_status"] == test_dataset.dataset_status


@pytest.mark.api
def test_cancel_job_endpoint(client, auth_headers, test_dataset):
    response = client.post(f"/datasets/{test_dataset.dataset_id}/cancel-job", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_status"] == "cancelled"
    assert "Job cancellation request sent" in data["message"]


@pytest.mark.api
def test_detect_duplicates_endpoint_triggers_background(client, auth_headers, test_dataset, mock_minio):
    with patch("app.routers.dataset.run_duplicate_detection_pipeline") as mock_pipeline:
        response = client.post(f"/datasets/{test_dataset.dataset_id}/detect-duplicates", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["dataset_status"] == "detecting_duplicates"


@pytest.mark.api
def test_get_duplicate_groups_endpoint(client, auth_headers, test_dataset, db_session, mock_minio):
    # Seed duplicate group and image
    group = DatasetDuplicateGroup(
        dataset_id=test_dataset.dataset_id,
        duplicate_group_detection_method="exact_hash",
        duplicate_group_confidence_score=1.0,
        duplicate_group_domain_route="photographic",
    )
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    
    img = DatasetDuplicateGroupImage(
        duplicate_group_id=group.duplicate_group_id,
        image_storage_path="datasets/test/img_dup1.jpg",
        is_original_flag=True,
    )
    db_session.add(img)
    db_session.commit()
    
    response = client.get(f"/datasets/{test_dataset.dataset_id}/duplicate-groups", headers=auth_headers)
    assert response.status_code == 200
    groups = response.json()
    assert len(groups) == 1
    assert groups[0]["duplicate_group_id"] == str(group.duplicate_group_id)
    assert len(groups[0]["images"]) == 1
    assert groups[0]["images"][0]["is_original_flag"] is True
    assert "token=mock-presigned" in groups[0]["images"][0]["image_url"]
