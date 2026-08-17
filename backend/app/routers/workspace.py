from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead
from app.services import workspace_service, dataset_service
from app.routers.auth import get_current_user
from app.models.user import User
import uuid

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

@router.post("/", response_model=WorkspaceRead)
def create_workspace(
    data: WorkspaceCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    ws = workspace_service.create_workspace(
        session=session,
        user_id=current_user.user_id,
        name=data.name,
        research_domain=data.research_domain,
        description=data.description
    )
    return WorkspaceRead(
        id=ws.workspace_id,
        name=ws.workspace_name,
        research_domain=ws.workspace_research_domain,
        description=ws.workspace_description,
        created_at=ws.workspace_created_at,
        updated_at=ws.workspace_updated_at
    )

@router.get("/", response_model=list[WorkspaceRead])
def list_workspaces(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    workspaces = workspace_service.get_workspaces_for_user(session, current_user.user_id)
    return [
        WorkspaceRead(
            id=ws.workspace_id,
            name=ws.workspace_name,
            research_domain=ws.workspace_research_domain,
            description=ws.workspace_description,
            created_at=ws.workspace_created_at,
            updated_at=ws.workspace_updated_at
        )
        for ws in workspaces
    ]

@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(
    workspace_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.user_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return WorkspaceRead(
        id=workspace.workspace_id,
        name=workspace.workspace_name,
        research_domain=workspace.workspace_research_domain,
        description=workspace.workspace_description,
        created_at=workspace.workspace_created_at,
        updated_at=workspace.workspace_updated_at
    )

@router.delete("/{workspace_id}/datasets/{dataset_id}")
def remove_dataset_from_workspace(
    workspace_id: uuid.UUID,
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    success = dataset_service.remove_dataset_from_workspace(
        session, workspace_id, dataset_id, current_user.user_id
    )
    if not success:
        raise HTTPException(
            status_code=403,
            detail="Unauthorized or invalid workspace/dataset combination"
        )
    return {"message": "Dataset successfully removed from workspace"}