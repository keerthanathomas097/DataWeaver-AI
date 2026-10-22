import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, UniqueConstraint
from sqlalchemy import Column, JSON


class DatasetLearningCurveResult(SQLModel, table=True):
    __tablename__ = "tbl_dataset_learning_curve_results"
    __table_args__ = (
        UniqueConstraint(
            "dataset_id",
            "file_list_checksum",
            "params_hash",
            name="uq_dataset_learning_curve_checksum_params"
        ),
    )

    result_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dataset_id: uuid.UUID = Field(foreign_key="tbl_datasets.dataset_id", index=True)
    file_list_checksum: str = Field(index=True)
    params_hash: str = Field(index=True)
    status: str = Field(default="running", index=True)  # "running" | "completed" | "failed" | "cancelled"
    stage: Optional[str] = Field(default=None)
    progress: float = Field(default=0.0)
    computed_at: Optional[datetime] = Field(default=None)
    result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
