from sqlmodel import SQLModel, Field
from datetime import datetime
import uuid

class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "tbl_password_reset_tokens"

    password_reset_token_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="tbl_users.user_id")
    password_reset_token: str = Field(unique=True)
    password_reset_expires_at: datetime
    password_reset_used: bool = False
    password_reset_created_at: datetime = Field(default_factory=datetime.utcnow)