import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, UniqueConstraint
from sqlalchemy import Column, JSON


class DomainSampleSet(SQLModel, table=True):
    __tablename__ = "tbl_domain_sample_sets"

    sample_set_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="tbl_workspaces.workspace_id", index=True)
    created_by: uuid.UUID = Field(foreign_key="tbl_users.user_id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    image_paths: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    embeddings: List[List[float]] = Field(default_factory=list, sa_column=Column(JSON))
    sample_count: int = Field(default=0)


class DatasetDomainGapResult(SQLModel, table=True):
    __tablename__ = "tbl_dataset_domain_gap_results"
    __table_args__ = (
        UniqueConstraint("dataset_id", "sample_set_id", "file_list_checksum", name="uq_dataset_sample_set_checksum"),
    )

    result_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dataset_id: uuid.UUID = Field(foreign_key="tbl_datasets.dataset_id", index=True)
    sample_set_id: uuid.UUID = Field(foreign_key="tbl_domain_sample_sets.sample_set_id", index=True)
    file_list_checksum: str = Field(index=True)
    computed_at: datetime = Field(default_factory=datetime.utcnow)
    result: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))


class WorkspaceDomainGapComparison(SQLModel, table=True):
    __tablename__ = "tbl_workspace_domain_gap_comparisons"
    __table_args__ = (
        UniqueConstraint("workspace_id", "sample_set_id", "signature", name="uq_workspace_sample_set_signature"),
    )

    comparison_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="tbl_workspaces.workspace_id", index=True)
    sample_set_id: uuid.UUID = Field(foreign_key="tbl_domain_sample_sets.sample_set_id", index=True)
    signature: str = Field(index=True)
    computed_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    matrix: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))

