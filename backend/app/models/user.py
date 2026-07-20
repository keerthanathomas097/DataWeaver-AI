from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: Optional[str] = None
    full_name: Optional[str] = None
    google_id: Optional[str] = Field(default=None, unique=True)
    email_verified: bool = False
    verification_token: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)