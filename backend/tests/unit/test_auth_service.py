import datetime
import pytest
from jose import jwt
from app.config import settings
from app.services import auth_service
from app.models.user import User
from app.models.password_reset_token import PasswordResetToken


@pytest.mark.unit
def test_password_hashing_and_verification():
    raw_password = "SecretPassword123!"
    hashed = auth_service.hash_password(raw_password)
    
    assert hashed != raw_password
    assert auth_service.verify_password(raw_password, hashed) is True
    assert auth_service.verify_password("WrongPassword!", hashed) is False


@pytest.mark.unit
def test_create_access_token():
    user_id = "123e4567-e89b-12d3-a456-426614174000"
    token = auth_service.create_access_token(user_id)
    
    decoded = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    assert decoded["sub"] == user_id
    assert "exp" in decoded


@pytest.mark.unit
def test_create_user(db_session):
    email = "newuser@dataweaver.ai"
    user = auth_service.create_user(db_session, email, "Password123!", "New User")
    
    assert user.user_id is not None
    assert user.user_email == email
    assert user.user_full_name == "New User"
    assert user.user_email_verified is False
    assert user.user_verification_token is not None
    assert user.user_token_expires_at > datetime.datetime.utcnow()


@pytest.mark.unit
def test_authenticate_user_success(db_session):
    email = "authuser@dataweaver.ai"
    auth_service.create_user(db_session, email, "CorrectPass123!", "Auth User")
    
    authenticated = auth_service.authenticate_user(db_session, email, "CorrectPass123!")
    assert authenticated is not None
    assert authenticated.user_email == email


@pytest.mark.unit
def test_authenticate_user_invalid_password(db_session):
    email = "authuser2@dataweaver.ai"
    auth_service.create_user(db_session, email, "CorrectPass123!", "Auth User 2")
    
    authenticated = auth_service.authenticate_user(db_session, email, "WrongPass123!")
    assert authenticated is None


@pytest.mark.unit
def test_authenticate_user_nonexistent_email(db_session):
    authenticated = auth_service.authenticate_user(db_session, "nobody@dataweaver.ai", "AnyPassword!")
    assert authenticated is None


@pytest.mark.unit
def test_authenticate_oauth_user_without_password(db_session):
    user = auth_service.get_or_create_google_user(
        db_session, "oauthonly@dataweaver.ai", "OAuth User", "google_id_999"
    )
    # User has user_password_hash = None
    authenticated = auth_service.authenticate_user(db_session, user.user_email, "SomePassword")
    assert authenticated is None


@pytest.mark.unit
def test_verify_email_token_valid(db_session):
    email = "verifyme@dataweaver.ai"
    user = auth_service.create_user(db_session, email, "Password123!", "Verify User")
    token = user.user_verification_token
    
    verified = auth_service.verify_email_token(db_session, token)
    assert verified is not None
    assert verified.user_email_verified is True
    assert verified.user_verification_token is None
    assert verified.user_token_expires_at is None


@pytest.mark.unit
def test_verify_email_token_expired(db_session):
    email = "expired@dataweaver.ai"
    user = auth_service.create_user(db_session, email, "Password123!", "Expired User")
    user.user_token_expires_at = datetime.datetime.utcnow() - datetime.timedelta(hours=1)
    db_session.add(user)
    db_session.commit()
    
    verified = auth_service.verify_email_token(db_session, user.user_verification_token)
    assert verified is None


@pytest.mark.unit
def test_verify_email_token_invalid_string(db_session):
    verified = auth_service.verify_email_token(db_session, "non_existent_token_xyz")
    assert verified is None


@pytest.mark.unit
def test_get_or_create_google_user_new(db_session):
    email = "google_new@dataweaver.ai"
    user = auth_service.get_or_create_google_user(
        db_session, email, "Google New", "gid_12345"
    )
    assert user.user_email == email
    assert user.user_google_id == "gid_12345"
    assert user.user_email_verified is True
    assert user.user_password_hash is None


@pytest.mark.unit
def test_get_or_create_google_user_link_existing(db_session):
    email = "existing_to_link@dataweaver.ai"
    user = auth_service.create_user(db_session, email, "Password123!", "Existing User")
    
    linked_user = auth_service.get_or_create_google_user(
        db_session, email, "Existing User", "gid_67890"
    )
    assert linked_user.user_id == user.user_id
    assert linked_user.user_google_id == "gid_67890"
    assert linked_user.user_email_verified is True


@pytest.mark.unit
def test_create_and_reset_password_flow(db_session):
    email = "resetpass@dataweaver.ai"
    user = auth_service.create_user(db_session, email, "OldPassword123!", "Reset User")
    
    # 1. Request reset token
    success = auth_service.create_password_reset_token(db_session, email)
    assert success is True
    
    # Non-existent user returns False
    assert auth_service.create_password_reset_token(db_session, "unknown@dataweaver.ai") is False
    
    # Find token
    token_entry = db_session.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.user_id).first()
    assert token_entry is not None
    assert token_entry.password_reset_used is False
    
    # 2. Reset password
    reset_ok = auth_service.reset_password(db_session, token_entry.password_reset_token, "NewPassword456!")
    assert reset_ok is True
    
    # Check old password fails, new password succeeds
    assert auth_service.authenticate_user(db_session, email, "OldPassword123!") is None
    assert auth_service.authenticate_user(db_session, email, "NewPassword456!") is not None
    
    # 3. Reusing the token must fail
    reused_ok = auth_service.reset_password(db_session, token_entry.password_reset_token, "AnotherPassword789!")
    assert reused_ok is False
