import os
import tempfile
import pytest
from unittest.mock import MagicMock, patch
from app.services import dataset_download_service


@pytest.mark.integration
def test_download_and_store_dataset_unsupported_source():
    with pytest.raises(ValueError, match="Download not yet supported"):
        dataset_download_service.download_and_store_dataset(
            dataset_id="test-id",
            source_type="unsupported_source",
            source_url="http://example.com",
            dataset_ref="test/ref",
        )


@pytest.mark.integration
def test_download_kaggle_dataset_with_mock(db_session, test_dataset, mock_minio):
    mock_kaggle = MagicMock()
    
    def mock_download_files(ref, path, unzip):
        # Create a dummy image file in temp path
        sample_img_path = os.path.join(path, "sample1.jpg")
        with open(sample_img_path, "wb") as f:
            f.write(b"dummy_image_content")

    mock_kaggle.dataset_download_files = mock_download_files

    with patch("kaggle.api", mock_kaggle):
        res = dataset_download_service.download_and_store_dataset(
            dataset_id=str(test_dataset.dataset_id),
            source_type="kaggle",
            source_url="https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia",
            dataset_ref="paultimothymooney/chest-xray-pneumonia",
        )
        assert res["image_count"] == 1
        assert "paultimothymooney_chest-xray-pneumonia" in res["storage_path"]
        assert len(mock_minio.storage) >= 1
