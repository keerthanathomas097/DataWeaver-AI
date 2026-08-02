import uuid
from datetime import datetime
from pydantic import BaseModel

class DatasetCreate(BaseModel):
    workspace_id: uuid.UUID
    dataset_name: str
    dataset_source_type: str
    dataset_source_url: str | None = None
    dataset_license: str | None = None
    dataset_image_count: int | None = 0

class DatasetRead(BaseModel):
    dataset_id: uuid.UUID
    workspace_id: uuid.UUID
    dataset_name: str
    dataset_source_type: str
    dataset_source_url: str | None
    dataset_license: str | None
    dataset_image_count: int
    dataset_storage_path: str | None
    dataset_status: str
    dataset_created_at: datetime
    dataset_updated_at: datetime