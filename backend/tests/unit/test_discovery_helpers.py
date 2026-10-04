import pytest
from unittest.mock import MagicMock, patch
import httpx
from app.services import discovery_service
from tests.fixtures.discovery_responses import (
    MOCK_ZENODO_RESPONSE,
    MOCK_FIGSHARE_RESPONSE,
    MOCK_OPENML_RESPONSE,
    MOCK_OPENVERSE_RESPONSE,
    MOCK_HUGGINGFACE_RESPONSE,
    MOCK_GITHUB_RESPONSE,
    MOCK_ROBOFLOW_RESPONSE,
)


@pytest.mark.unit
def test_search_zenodo_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_ZENODO_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_zenodo("mri", limit=5)
        assert len(results) == 1
        assert results[0].source == "zenodo"
        assert results[0].name == "Zenodo Brain MRI Dataset"
        assert results[0].license == "CC-BY-4.0"


@pytest.mark.unit
def test_search_figshare_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_FIGSHARE_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_figshare("retinal", limit=5)
        assert len(results) == 1
        assert results[0].source == "figshare"
        assert results[0].name == "Figshare Retinal OCT Images"


@pytest.mark.unit
def test_search_openml_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_OPENML_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_openml("chest", limit=5)
        assert len(results) == 1
        assert results[0].source == "openml"
        assert results[0].name == "chest_xray_openml"


@pytest.mark.unit
def test_search_openverse_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_OPENVERSE_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_openverse("cells", limit=5)
        assert len(results) == 1
        assert results[0].source == "openverse"
        assert results[0].license == "cc0"
        assert results[0].thumbnail_url == "https://openverse.org/thumbs/ov-5555.jpg"


@pytest.mark.unit
def test_search_huggingface_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_HUGGINGFACE_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_huggingface("skin", limit=5)
        assert len(results) == 1
        assert results[0].source == "huggingface"
        assert results[0].name == "medical-ai/skin-cancer-isic"


@pytest.mark.unit
def test_search_github_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_GITHUB_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_github("cardiac", limit=5)
        assert len(results) == 1
        assert results[0].source == "github"
        assert results[0].license == "MIT"


@pytest.mark.unit
def test_search_roboflow_parses_response():
    mock_resp = MagicMock()
    mock_resp.json.return_value = MOCK_ROBOFLOW_RESPONSE
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.get", return_value=mock_resp):
        results = discovery_service.search_roboflow("rust", limit=5)
        assert len(results) == 1
        assert results[0].source == "roboflow"
        assert results[0].image_count == 1500


@pytest.mark.unit
def test_extract_metadata_from_description_with_groq_mock():
    mock_choice = MagicMock()
    mock_choice.message.content = '```json\n{"image_count": 5000, "classes": ["benign", "malignant"]}\n```'
    mock_resp = MagicMock(choices=[mock_choice])

    with patch.object(discovery_service.groq_client.chat.completions, "create", return_value=mock_resp):
        metadata = discovery_service.extract_metadata_from_description("A collection of 5000 skin lesions categorized into benign and malignant.")
        assert metadata["image_count"] == 5000
        assert metadata["classes"] == ["benign", "malignant"]


@pytest.mark.unit
def test_extract_metadata_from_description_empty():
    metadata = discovery_service.extract_metadata_from_description("")
    assert metadata == {"image_count": None, "classes": None}


@pytest.mark.unit
def test_parse_search_query_with_groq_mock():
    mock_choice = MagicMock()
    mock_choice.message.content = '{"topic": "brain tumor MRI", "min_images": 1000}'
    mock_resp = MagicMock(choices=[mock_choice])

    with patch.object(discovery_service.groq_client.chat.completions, "create", return_value=mock_resp):
        parsed = discovery_service.parse_search_query("find brain tumor MRI with more than 1000 images")
        assert parsed["topic"] == "brain tumor MRI"
        assert parsed["min_images"] == 1000
