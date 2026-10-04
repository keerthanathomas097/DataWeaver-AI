import uuid
import pytest


@pytest.mark.api
def test_create_workspace_endpoint(client, auth_headers):
    payload = {
        "name": "Robotics Vision Hub",
        "research_domain": "Robotics",
        "description": "Autonomous navigation and obstacle avoidance",
    }
    response = client.post("/workspaces/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["research_domain"] == payload["research_domain"]
    assert data["description"] == payload["description"]
    assert "id" in data


@pytest.mark.api
def test_list_workspaces_endpoint(client, auth_headers, test_workspace):
    response = client.get("/workspaces/", headers=auth_headers)
    assert response.status_code == 200
    workspaces = response.json()
    assert len(workspaces) >= 1
    assert any(w["id"] == str(test_workspace.workspace_id) for w in workspaces)


@pytest.mark.api
def test_get_workspace_by_id_endpoint_success(client, auth_headers, test_workspace):
    response = client.get(f"/workspaces/{test_workspace.workspace_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_workspace.workspace_id)
    assert data["name"] == test_workspace.workspace_name


@pytest.mark.api
def test_get_workspace_by_id_endpoint_not_found(client, auth_headers):
    random_id = uuid.uuid4()
    response = client.get(f"/workspaces/{random_id}", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.api
def test_remove_dataset_from_workspace_endpoint(client, auth_headers, test_workspace, test_dataset):
    response = client.delete(
        f"/workspaces/{test_workspace.workspace_id}/datasets/{test_dataset.dataset_id}",
        headers=auth_headers
    )
    assert response.status_code == 200
    assert "successfully removed" in response.json()["message"]


@pytest.mark.api
def test_remove_dataset_unauthorized(client, auth_headers, test_workspace):
    random_dataset_id = uuid.uuid4()
    response = client.delete(
        f"/workspaces/{test_workspace.workspace_id}/datasets/{random_dataset_id}",
        headers=auth_headers
    )
    assert response.status_code == 403
