from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    name: str
    research_domain: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)