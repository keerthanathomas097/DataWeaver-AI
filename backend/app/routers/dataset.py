from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.schemas.dataset import DatasetCreate, DatasetRead
from app.services import dataset_service
from app.routers.auth import get_current_user
from app.models.user import User
import uuid

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