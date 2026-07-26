from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Workspace(SQLModel, table=True):
    __tablename__ = "tbl_workspaces"

    workspace_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="tbl_users.user_id")
    workspace_name: str
    workspace_research_domain: str
    workspace_description: Optional[str] = None
    workspace_created_at: datetime = Field(default_factory=datetime.utcnow)
    workspace_updated_at: datetime = Field(default_factory=datetime.utcnow)