from minio import Minio
from app.config import settings

minio_client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=False,
)

def ensure_bucket_exists():
    if not minio_client.bucket_exists(settings.minio_bucket_name):
        minio_client.make_bucket(settings.minio_bucket_name)

def get_dataset_storage_prefix(dataset_id: str) -> str:
    return f"datasets/{dataset_id}/"