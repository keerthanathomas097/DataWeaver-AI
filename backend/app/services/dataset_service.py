from sqlmodel import Session, select
from app.models.dataset import Dataset
from app.models.workspace import Workspace
import uuid

def create_dataset(session: Session, data, user_id: uuid.UUID) -> Dataset | None:
    workspace = session.get(Workspace, data.workspace_id)
    if not workspace or workspace.user_id != user_id:
        return None  # not their workspace, reject silently at service level

    dataset = Dataset(
        workspace_id=data.workspace_id,
        dataset_name=data.dataset_name,
        dataset_source_type=data.dataset_source_type,
        dataset_source_url=data.dataset_source_url,
        dataset_license=data.dataset_license,
        dataset_image_count=data.dataset_image_count or 0,
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    return dataset

def get_datasets_for_workspace(session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> list[Dataset]:
    workspace = session.get(Workspace, workspace_id)
    if not workspace or workspace.user_id != user_id:
        return []
    return session.exec(select(Dataset).where(Dataset.workspace_id == workspace_id)).all()

def get_dataset_by_id(session: Session, dataset_id: uuid.UUID, user_id: uuid.UUID) -> Dataset | None:
    dataset = session.get(Dataset, dataset_id)
    if not dataset:
        return None
    workspace = session.get(Workspace, dataset.workspace_id)
    if not workspace or workspace.user_id != user_id:
        return None
    return dataset