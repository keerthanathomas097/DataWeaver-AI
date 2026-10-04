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


def get_image_as_pil(object_path: str):
    """
    Downloads an image from MinIO and returns a PIL Image object.
    Ensures HTTP response connections are properly released.
    Returns None if retrieval or decoding fails.
    """
    import io
    from PIL import Image
    try:
        response = minio_client.get_object(settings.minio_bucket_name, object_path)
        data = response.read()
        return Image.open(io.BytesIO(data))
    except Exception as e:
        print(f"Error reading image {object_path} from MinIO: {e}")
        return None
    finally:
        try:
            response.close()
            response.release_conn()
        except Exception:
            pass


def get_image_bytes(object_path: str):
    """
    Downloads raw image bytes from MinIO with connection release.
    Returns bytes or None on failure.
    """
    try:
        response = minio_client.get_object(settings.minio_bucket_name, object_path)
        return response.read()
    except Exception as e:
        print(f"Error reading image bytes for {object_path} from MinIO: {e}")
        return None
    finally:
        try:
            response.close()
            response.release_conn()
        except Exception:
            pass