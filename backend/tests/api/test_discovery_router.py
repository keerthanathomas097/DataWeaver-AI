import pytest
from unittest.mock import MagicMock, patch
from app.schemas.discovery import NormalizedDataset


@pytest.mark.api
def test_search_datasets_endpoint(client, auth_headers):
    mock_datasets = [
        NormalizedDataset(
            source="zenodo",
            external_id="123",
            name="Brain MRI Test",
            url="https://zenodo.org/record/123",
        )
    ]
    
    with patch("app.services.discovery_service.search_all_sources", return_value=(mock_datasets, ["zenodo"])):
        response = client.get("/discovery/search?query=brain+mri&limit=5", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "brain mri"
        assert len(data["results"]) == 1
        assert data["results"][0]["name"] == "Brain MRI Test"
        assert data["sources_searched"] == ["zenodo"]


@pytest.mark.api
def test_extract_metadata_endpoint(client, auth_headers):
    mock_extracted = {"image_count": 2500, "classes": ["glioma", "meningioma"]}
    with patch("app.routers.discovery.extract_metadata_from_description", return_value=mock_extracted):
        response = client.post("/discovery/extract-metadata?description=Sample+brain+tumor+MRI", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["image_count"] == 2500
        assert data["classes"] == ["glioma", "meningioma"]


@pytest.mark.api
def test_kaggle_details_endpoint(client, auth_headers):
    with patch("app.services.discovery_service.get_kaggle_dataset_details", return_value="Raw markdown description"), \
         patch("app.services.discovery_service.extract_metadata_from_description", return_value={"image_count": 1000, "classes": None}):
        response = client.get("/discovery/kaggle-details/paultimothymooney/chest-xray-pneumonia", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["full_description"] == "Raw markdown description"
        assert data["image_count"] == 1000
