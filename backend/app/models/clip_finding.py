from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON
from typing import Dict, Any, Optional
from datetime import datetime
import uuid


class DatasetClipFinding(SQLModel, table=True):
    __tablename__ = "tbl_dataset_clip_findings"

    finding_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dataset_id: uuid.UUID = Field(foreign_key="tbl_datasets.dataset_id", index=True, unique=True)
    computed_at: datetime = Field(default_factory=datetime.utcnow)
    file_list_checksum: str = Field(index=True)
    label_match_data: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
