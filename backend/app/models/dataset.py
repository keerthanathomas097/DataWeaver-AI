from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Dataset(SQLModel, table=True):
    __tablename__ = "tbl_datasets"

    dataset_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="tbl_workspaces.workspace_id")
    dataset_name: str
    dataset_source_type: str
    dataset_source_url: Optional[str] = None
    dataset_license: Optional[str] = None
    dataset_image_count: int = 0
    dataset_storage_path: Optional[str] = None
    dataset_chroma_vector_id: Optional[str] = None
    dataset_status: str = "acquired"
    dataset_created_at: datetime = Field(default_factory=datetime.utcnow)
    dataset_updated_at: datetime = Field(default_factory=datetime.utcnow)