import os
import tempfile
import uuid
from minio import Minio
from app.services.storage_service import minio_client, get_dataset_storage_prefix
from app.config import settings
from app.database import engine
from sqlmodel import Session
from app.models.dataset import Dataset

def download_kaggle_dataset(dataset_id: str, external_source_url: str, dataset_ref: str) -> int:
    import kaggle
    kaggle.api.authenticate()

    with tempfile.TemporaryDirectory() as tmp_dir:
        kaggle.api.dataset_download_files(dataset_ref, path=tmp_dir, unzip=True)

        uploaded_count = 0
        for root, dirs, files in os.walk(tmp_dir):
            for filename in files:
                # Check cancellation flag before uploading each file to MinIO
                with Session(engine) as session:
                    dataset = session.get(Dataset, uuid.UUID(dataset_id))
                    if dataset and dataset.dataset_status == "cancelled":
                        raise ValueError("Download cancelled by user")

                local_path = os.path.join(root, filename)
                relative_path = os.path.relpath(local_path, tmp_dir)
                object_name = f"datasets/{dataset_ref.replace('/', '_')}/{relative_path}".replace("\\", "/")

                minio_client.fput_object(
                    settings.minio_bucket_name,
                    object_name,
                    local_path,
                )
                uploaded_count += 1

        return uploaded_count


def download_and_store_dataset(dataset_id: str, source_type: str, source_url: str, dataset_ref: str) -> dict:
    if source_type.lower() == "kaggle":
        image_count = download_kaggle_dataset(dataset_id, source_url, dataset_ref)
    else:
        raise ValueError(f"Download not yet supported for source type: {source_type}")

    storage_path = f"datasets/{dataset_ref.replace('/', '_')}/"
    return {"storage_path": storage_path, "image_count": image_count}