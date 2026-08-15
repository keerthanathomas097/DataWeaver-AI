from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.schemas.dataset import DatasetCreate, DatasetRead
from app.services import dataset_service
from app.routers.auth import get_current_user
from app.models.user import User
import uuid
from app.services import dataset_download_service

router = APIRouter(prefix="/datasets", tags=["datasets"])

@router.post("/", response_model=DatasetRead)
def add_dataset(
    data: DatasetCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.create_dataset(session, data, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=403, detail="Not authorized to add datasets to this workspace")
    return dataset

@router.get("/workspace/{workspace_id}", response_model=list[DatasetRead])
def list_workspace_datasets(
    workspace_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return dataset_service.get_datasets_for_workspace(session, workspace_id, current_user.user_id)

@router.get("/{dataset_id}", response_model=DatasetRead)
def get_dataset(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset

@router.post("/{dataset_id}/detect-duplicates")
def detect_duplicates(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not dataset.dataset_storage_path:
        if dataset.dataset_source_type.lower() != "kaggle":
            raise HTTPException(status_code=400, detail="Download not yet supported for this source type")

        dataset_ref = dataset.dataset_source_url.split("kaggle.com/datasets/")[-1].strip("/")

        try:
            result = dataset_download_service.download_and_store_dataset(
                str(dataset.dataset_id),
                dataset.dataset_source_type,
                dataset.dataset_source_url,
                dataset_ref,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

        dataset = dataset_service.update_dataset_after_download(
            session, dataset_id, result["storage_path"], result["image_count"]
        )

    return {
        "message": "Dataset ready. Duplicate detection not yet implemented.",
        "dataset_status": dataset.dataset_status,
        "storage_path": dataset.dataset_storage_path,
        "image_count": dataset.dataset_image_count,
    }