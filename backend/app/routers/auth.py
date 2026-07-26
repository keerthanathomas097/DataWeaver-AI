from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlmodel import Session, select
from app.database import get_session
from app.schemas.user import UserSignup, UserLogin, UserRead, Token
from app.services import auth_service
from app.config import settings
from app.models.user import User
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.services.oauth_service import oauth
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Could not validate credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    
    try:
        u_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid user ID format")
        
    user = session.get(User, u_uuid)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@router.post("/signup", response_model=UserRead)
def signup(data: UserSignup, session: Session = Depends(get_session)):
    existing = auth_service.get_user_by_email(session, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = auth_service.create_user(session, data.email, data.password, data.full_name)
    return UserRead(
    id=user.user_id,
    email=user.user_email,
    full_name=user.user_full_name,
    is_admin=user.user_is_admin
)

@router.get("/verify-email")
def verify_email(token: str, session: Session = Depends(get_session)):
    user = auth_service.verify_email_token(session, token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    return {"message": "Email verified successfully"}

@router.post("/login", response_model=Token)
def login(data: UserLogin, session: Session = Depends(get_session)):
    user = auth_service.authenticate_user(session, data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.user_email_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in")
    token = auth_service.create_access_token(str(user.user_id))
    return Token(access_token=token)
@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/google/callback")
async def google_callback(request: Request, session: Session = Depends(get_session)):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get("userinfo")

    if not user_info:
        raise HTTPException(status_code=400, detail="Failed to get user info from Google")

    user = auth_service.get_or_create_google_user(
        session,
        email=user_info["email"],
        full_name=user_info.get("name", ""),
        google_id=user_info["sub"],
    )

    access_token = auth_service.create_access_token(str(user.user_id))
    return RedirectResponse(url=f"{settings.frontend_url}/oauth-success?token={access_token}")

@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
   return UserRead(
    id=current_user.user_id,
    email=current_user.user_email,
    full_name=current_user.user_full_name,
    is_admin=current_user.user_is_admin
)

@router.get("/users", response_model=list[UserRead])
def list_users(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    if not current_user.user_is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to view user directory")
    users = session.exec(select(User)).all()
    return [
        UserRead(
            id=u.user_id,
            email=u.user_email,
            full_name=u.user_full_name,
            is_admin=u.user_is_admin
        )
        for u in users
    ]

@router.put("/users/{user_id}/toggle-admin")
def toggle_user_admin(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    if not current_user.user_is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to perform administrative actions")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot toggle your own administrative privileges")
    user.user_is_admin = not user.user_is_admin
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"message": "User admin status updated", "is_admin": user.user_is_admin}