from sqlmodel import Session, select
from app.models.workspace import Workspace
import uuid

def create_workspace(
    session: Session,
    user_id: uuid.UUID,
    name: str,
    research_domain: str,
    description: str | None,
) -> Workspace:

    workspace = Workspace(
        user_id=user_id,
        name=name,
        research_domain=research_domain,
        description=description,
    )

    session.add(workspace)
    session.commit()
    session.refresh(workspace)
    return workspace

def get_workspaces_for_user(session: Session, user_id: uuid.UUID) -> list[Workspace]:
    return session.exec(select(Workspace).where(Workspace.user_id == user_id)).all()

def get_workspace_by_id(session: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> Workspace | None:
    workspace = session.get(Workspace, workspace_id)
    if workspace and workspace.user_id == user_id:
        return workspace
    return None