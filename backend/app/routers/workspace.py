from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.database import get_session
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead
from app.services import workspace_service
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
    return workspace_service.create_workspace(
        session=session,
        user_id=current_user.id,
        name=data.name,
        research_domain=data.research_domain,
        description=data.description
    )

@router.get("/", response_model=list[WorkspaceRead])
def list_workspaces(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return workspace_service.get_workspaces_for_user(session, current_user.id)

@router.get("/{workspace_id}", response_model=WorkspaceRead)
def get_workspace(
    workspace_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace