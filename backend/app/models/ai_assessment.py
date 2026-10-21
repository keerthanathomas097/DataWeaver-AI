import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, UniqueConstraint
from sqlalchemy import Column, JSON


class DatasetAiAssessment(SQLModel, table=True):
    __tablename__ = "tbl_dataset_ai_assessments"
    __table_args__ = (
        UniqueConstraint("dataset_id", "purpose_key", "input_hash", name="uq_dataset_purpose_input_hash"),
    )

    assessment_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dataset_id: uuid.UUID = Field(foreign_key="tbl_datasets.dataset_id", index=True)
    purpose_key: str = Field(index=True)
    input_hash: str = Field(index=True)
    assessment: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    generated_by: str = Field(default="llm")  # "llm" | "fallback"
    model_name: Optional[str] = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
