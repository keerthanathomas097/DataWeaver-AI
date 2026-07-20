import uuid
from pydantic import BaseModel, EmailStr, field_validator

class UserSignup(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    @field_validator("password")
    @classmethod
    def password_min_length(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return value

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"