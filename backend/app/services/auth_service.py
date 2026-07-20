import secrets
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt
from sqlmodel import Session, select
from app.models.user import User
from app.config import settings
from app.services.email_service import send_verification_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def get_user_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).first()

def create_user(session: Session, email: str, password: str, full_name: str) -> User:
    token = secrets.token_urlsafe(32)
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        verification_token=token,
        token_expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    send_verification_email(user.email, token)
    return user

def authenticate_user(session: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(session, email)
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user

def verify_email_token(session: Session, token: str) -> User | None:
    user = session.exec(select(User).where(User.verification_token == token)).first()
    if not user:
        return None
    if user.token_expires_at and user.token_expires_at < datetime.utcnow():
        return None
    user.email_verified = True
    user.verification_token = None
    user.token_expires_at = None
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
def get_or_create_google_user(session: Session, email: str, full_name: str, google_id: str) -> User:
    user = get_user_by_email(session, email)
    if user:
        if not user.google_id:
            user.google_id = google_id
            user.email_verified = True  # Google already verified this email
            session.add(user)
            session.commit()
            session.refresh(user)
        return user

    user = User(
        email=email,
        full_name=full_name,
        google_id=google_id,
        email_verified=True,  # trust Google's verification
        password_hash=None,   # no password for OAuth-only users
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user