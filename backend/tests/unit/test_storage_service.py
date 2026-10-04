import pytest
from unittest.mock import MagicMock, patch
from app.services import storage_service
from app.config import settings


@pytest.mark.unit
def test_get_dataset_storage_prefix():
    prefix = storage_service.get_dataset_storage_prefix("test-dataset-uuid-123")
    assert prefix == "datasets/test-dataset-uuid-123/"


@pytest.mark.unit
def test_ensure_bucket_exists_when_bucket_already_exists():
    mock_minio = MagicMock()
    mock_minio.bucket_exists.return_value = True
    
    with patch("app.services.storage_service.minio_client", mock_minio):
        storage_service.ensure_bucket_exists()
        mock_minio.bucket_exists.assert_called_once_with(settings.minio_bucket_name)
        mock_minio.make_bucket.assert_not_called()


@pytest.mark.unit
def test_ensure_bucket_exists_when_bucket_missing():
    mock_minio = MagicMock()
    mock_minio.bucket_exists.return_value = False
    
    with patch("app.services.storage_service.minio_client", mock_minio):
        storage_service.ensure_bucket_exists()
        mock_minio.bucket_exists.assert_called_once_with(settings.minio_bucket_name)
        mock_minio.make_bucket.assert_called_once_with(settings.minio_bucket_name)
