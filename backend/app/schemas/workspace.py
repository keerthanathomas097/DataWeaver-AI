import uuid
from datetime import datetime
from pydantic import BaseModel

class WorkspaceCreate(BaseModel):
    name: str
    research_domain: str
    description: str | None = None

class WorkspaceRead(BaseModel):
    id: uuid.UUID
    name: str
    research_domain: str
    description: str | None
    created_at: datetime
    updated_at: datetime