import secrets
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt
from sqlmodel import Session, select
from app.models.user import User
from app.config import settings
from app.services.email_service import send_verification_email
from app.models.password_reset_token import PasswordResetToken
from app.services.email_service import send_password_reset_email

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
    return session.exec(select(User).where(User.user_email == email)).first()

def create_user(session: Session, email: str, password: str, full_name: str) -> User:
    token = secrets.token_urlsafe(32)

    user = User(
        user_email=email,
        user_password_hash=hash_password(password),
        user_full_name=full_name,
        user_verification_token=token,
        user_token_expires_at=datetime.utcnow() + timedelta(hours=24),
    )

    session.add(user)
    session.commit()
    session.refresh(user)

    send_verification_email(user.user_email, token)

    return user

def authenticate_user(session: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(session, email)

    if not user or not user.user_password_hash:
        return None

    if not verify_password(password, user.user_password_hash):
        return None

    return user

def verify_email_token(session: Session, token: str) -> User | None:
    user = session.exec(
        select(User).where(User.user_verification_token == token)
    ).first()

    if not user:
        return None

    if (
        user.user_token_expires_at
        and user.user_token_expires_at < datetime.utcnow()
    ):
        return None

    user.user_email_verified = True
    user.user_verification_token = None
    user.user_token_expires_at = None

    session.add(user)
    session.commit()
    session.refresh(user)

    return user

def get_or_create_google_user(
    session: Session,
    email: str,
    full_name: str,
    google_id: str,
) -> User:

    user = get_user_by_email(session, email)

    if user:
        if not user.user_google_id:
            user.user_google_id = google_id
            user.user_email_verified = True

            session.add(user)
            session.commit()
            session.refresh(user)

        return user

    user = User(
        user_email=email,
        user_full_name=full_name,
        user_google_id=google_id,
        user_email_verified=True,
        user_password_hash=None,
    )

    session.add(user)
    session.commit()
    session.refresh(user)

    return user
def create_password_reset_token(session: Session, email: str) -> bool:
    user = get_user_by_email(session, email)
    if not user:
        return False  # deliberately don't reveal whether the email exists

    token = secrets.token_urlsafe(32)
    reset_entry = PasswordResetToken(
        user_id=user.user_id,
        password_reset_token=token,
        password_reset_expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    session.add(reset_entry)
    session.commit()

    send_password_reset_email(user.user_email, token)
    return True

def reset_password(session: Session, token: str, new_password: str) -> bool:
    reset_entry = session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.password_reset_token == token,
            PasswordResetToken.password_reset_used == False,
        )
    ).first()

    if not reset_entry:
        return False

    if reset_entry.password_reset_expires_at < datetime.utcnow():
        return False

    user = session.get(User, reset_entry.user_id)
    if not user:
        return False

    user.user_password_hash = hash_password(new_password)
    reset_entry.password_reset_used = True

    session.add(user)
    session.add(reset_entry)
    session.commit()
    return True