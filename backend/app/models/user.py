from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

class User(SQLModel, table=True):
    __tablename__ = "tbl_users"

    user_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_email: str = Field(unique=True, index=True)
    user_password_hash: Optional[str] = None
    user_full_name: Optional[str] = None
    user_google_id: Optional[str] = Field(default=None, unique=True)
    user_email_verified: bool = False
    user_verification_token: Optional[str] = None
    user_token_expires_at: Optional[datetime] = None
    user_created_at: datetime = Field(default_factory=datetime.utcnow)
    user_is_admin: bool = False