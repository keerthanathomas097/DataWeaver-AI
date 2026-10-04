import uuid
import pytest
from app.services import workspace_service, auth_service


@pytest.mark.unit
def test_create_workspace(db_session, test_user):
    ws = workspace_service.create_workspace(
        session=db_session,
        user_id=test_user.user_id,
        name="Computer Vision Project",
        research_domain="Object Detection",
        description="Dataset storage and duplicate filtering",
    )
    
    assert ws.workspace_id is not None
    assert ws.user_id == test_user.user_id
    assert ws.workspace_name == "Computer Vision Project"
    assert ws.workspace_research_domain == "Object Detection"
    assert ws.workspace_description == "Dataset storage and duplicate filtering"
    assert ws.workspace_created_at is not None


@pytest.mark.unit
def test_get_workspaces_for_user(db_session, test_user):
    # Create two workspaces for test_user
    ws1 = workspace_service.create_workspace(
        db_session, test_user.user_id, "WS 1", "Domain A", None
    )
    ws2 = workspace_service.create_workspace(
        db_session, test_user.user_id, "WS 2", "Domain B", None
    )
    
    # Create another user and workspace
    other_user = auth_service.create_user(
        db_session, "otheruser@dataweaver.ai", "Password123!", "Other"
    )
    other_ws = workspace_service.create_workspace(
        db_session, other_user.user_id, "Other WS", "Domain C", None
    )
    
    user_workspaces = workspace_service.get_workspaces_for_user(db_session, test_user.user_id)
    ws_ids = [w.workspace_id for w in user_workspaces]
    
    assert ws1.workspace_id in ws_ids
    assert ws2.workspace_id in ws_ids
    assert other_ws.workspace_id not in ws_ids


@pytest.mark.unit
def test_get_workspace_by_id_owner(db_session, test_user, test_workspace):
    fetched = workspace_service.get_workspace_by_id(
        db_session, test_workspace.workspace_id, test_user.user_id
    )
    assert fetched is not None
    assert fetched.workspace_id == test_workspace.workspace_id


@pytest.mark.unit
def test_get_workspace_by_id_unauthorized(db_session, test_workspace):
    random_user_id = uuid.uuid4()
    fetched = workspace_service.get_workspace_by_id(
        db_session, test_workspace.workspace_id, random_user_id
    )
    assert fetched is None


@pytest.mark.unit
def test_get_workspace_by_id_nonexistent(db_session, test_user):
    fetched = workspace_service.get_workspace_by_id(
        db_session, uuid.uuid4(), test_user.user_id
    )
    assert fetched is None
