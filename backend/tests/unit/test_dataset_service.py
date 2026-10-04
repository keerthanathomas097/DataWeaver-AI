import uuid
import pytest
from app.services import dataset_service, auth_service, workspace_service
from app.schemas.dataset import DatasetCreate


@pytest.mark.unit
def test_create_dataset_success(db_session, test_user, test_workspace):
    data = DatasetCreate(
        workspace_id=test_workspace.workspace_id,
        dataset_name="Plant Pathology 2021",
        dataset_source_type="kaggle",
        dataset_source_url="https://www.kaggle.com/c/plant-pathology-2021-fgvc8",
        dataset_license="Apache 2.0",
        dataset_image_count=2500,
    )
    
    ds = dataset_service.create_dataset(db_session, data, test_user.user_id)
    assert ds is not None
    assert ds.dataset_id is not None
    assert ds.workspace_id == test_workspace.workspace_id
    assert ds.dataset_name == "Plant Pathology 2021"
    assert ds.dataset_status == "acquired"


@pytest.mark.unit
def test_create_dataset_unauthorized_workspace(db_session, test_workspace):
    other_user = auth_service.create_user(
        db_session, "intruder@dataweaver.ai", "Password123!", "Intruder"
    )
    data = DatasetCreate(
        workspace_id=test_workspace.workspace_id,
        dataset_name="Unauthorized Dataset",
        dataset_source_type="kaggle",
    )
    
    ds = dataset_service.create_dataset(db_session, data, other_user.user_id)
    assert ds is None


@pytest.mark.unit
def test_get_datasets_for_workspace(db_session, test_user, test_workspace, test_dataset):
    datasets = dataset_service.get_datasets_for_workspace(
        db_session, test_workspace.workspace_id, test_user.user_id
    )
    assert len(datasets) >= 1
    assert any(d.dataset_id == test_dataset.dataset_id for d in datasets)


@pytest.mark.unit
def test_get_dataset_by_id(db_session, test_user, test_dataset):
    ds = dataset_service.get_dataset_by_id(db_session, test_dataset.dataset_id, test_user.user_id)
    assert ds is not None
    assert ds.dataset_id == test_dataset.dataset_id


@pytest.mark.unit
def test_get_dataset_by_id_unauthorized(db_session, test_dataset):
    random_user_id = uuid.uuid4()
    ds = dataset_service.get_dataset_by_id(db_session, test_dataset.dataset_id, random_user_id)
    assert ds is None


@pytest.mark.unit
def test_update_dataset_after_download(db_session, test_dataset):
    updated = dataset_service.update_dataset_after_download(
        db_session, test_dataset.dataset_id, "datasets/new_storage_path/", 350
    )
    assert updated is not None
    assert updated.dataset_storage_path == "datasets/new_storage_path/"
    assert updated.dataset_image_count == 350
    assert updated.dataset_status == "downloaded"


@pytest.mark.unit
def test_remove_dataset_from_workspace(db_session, test_user, test_workspace, test_dataset):
    success = dataset_service.remove_dataset_from_workspace(
        db_session, test_workspace.workspace_id, test_dataset.dataset_id, test_user.user_id
    )
    assert success is True
    
    # Verify dataset is no longer associated with workspace
    datasets = dataset_service.get_datasets_for_workspace(
        db_session, test_workspace.workspace_id, test_user.user_id
    )
    assert not any(d.dataset_id == test_dataset.dataset_id for d in datasets)
