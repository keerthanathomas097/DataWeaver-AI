import uuid
import pytest
from unittest.mock import MagicMock, patch
from app.models.user import User
from app.models.password_reset_token import PasswordResetToken
from app.services.auth_service import hash_password


@pytest.mark.api
def test_signup_success(client):
    payload = {
        "email": "router_signup@dataweaver.ai",
        "password": "Password123!",
        "full_name": "Router User",
    }
    response = client.post("/auth/signup", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == payload["email"]
    assert data["full_name"] == payload["full_name"]
    assert data["is_admin"] is False
    assert "id" in data


@pytest.mark.api
def test_signup_duplicate_email(client, test_user):
    payload = {
        "email": test_user.user_email,
        "password": "Password123!",
        "full_name": "Duplicate User",
    }
    response = client.post("/auth/signup", json=payload)
    assert response.status_code == 400
    assert "Email already registered" in response.json()["detail"]


@pytest.mark.api
def test_signup_password_too_short(client):
    payload = {
        "email": "shortpass@dataweaver.ai",
        "password": "short",
        "full_name": "Short Pass",
    }
    response = client.post("/auth/signup", json=payload)
    assert response.status_code == 422


@pytest.mark.api
def test_verify_email_endpoint_success(client, unverified_user):
    token = unverified_user.user_verification_token
    response = client.get(f"/auth/verify-email?token={token}")
    assert response.status_code == 200
    assert "Email verified successfully" in response.json()["message"]


@pytest.mark.api
def test_verify_email_endpoint_invalid(client):
    response = client.get("/auth/verify-email?token=invalid_token_999")
    assert response.status_code == 400


@pytest.mark.api
def test_login_success(client, test_user):
    payload = {
        "email": test_user.user_email,
        "password": "Password123!",
    }
    response = client.post("/auth/login", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.api
def test_login_unverified_account(client, unverified_user):
    payload = {
        "email": unverified_user.user_email,
        "password": "Password123!",
    }
    response = client.post("/auth/login", json=payload)
    assert response.status_code == 403
    assert "verify your email" in response.json()["detail"]


@pytest.mark.api
def test_login_wrong_password(client, test_user):
    payload = {
        "email": test_user.user_email,
        "password": "WrongPassword123!",
    }
    response = client.post("/auth/login", json=payload)
    assert response.status_code == 401


@pytest.mark.api
def test_get_me_authenticated(client, test_user, auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_user.user_id)
    assert data["email"] == test_user.user_email


@pytest.mark.api
def test_get_me_unauthenticated(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


@pytest.mark.api
def test_forgot_and_reset_password_endpoints(client, test_user, db_session):
    # 1. Forgot password
    resp = client.post("/auth/forgot-password", json={"email": test_user.user_email})
    assert resp.status_code == 200
    
    # Extract generated token from DB
    token_entry = db_session.query(PasswordResetToken).filter(PasswordResetToken.user_id == test_user.user_id).first()
    assert token_entry is not None
    
    # 2. Reset password
    reset_resp = client.post("/auth/reset-password", json={
        "token": token_entry.password_reset_token,
        "new_password": "NewSecurePassword123!",
    })
    assert reset_resp.status_code == 200
    assert "Password reset successfully" in reset_resp.json()["message"]
    
    # 3. Login with new password
    login_resp = client.post("/auth/login", json={
        "email": test_user.user_email,
        "password": "NewSecurePassword123!",
    })
    assert login_resp.status_code == 200


@pytest.mark.api
def test_admin_list_users_as_admin(client, test_admin_user, admin_auth_headers, test_user):
    response = client.get("/auth/users", headers=admin_auth_headers)
    assert response.status_code == 200
    users = response.json()
    assert len(users) >= 2
    emails = [u["email"] for u in users]
    assert test_admin_user.user_email in emails
    assert test_user.user_email in emails


@pytest.mark.api
def test_admin_list_users_as_regular_user(client, auth_headers):
    response = client.get("/auth/users", headers=auth_headers)
    assert response.status_code == 403


@pytest.mark.api
def test_admin_toggle_user_status(client, test_admin_user, admin_auth_headers, test_user):
    assert test_user.user_is_admin is False
    
    # Toggle standard user to admin
    response = client.put(f"/auth/users/{test_user.user_id}/toggle-admin", headers=admin_auth_headers)
    assert response.status_code == 200
    assert response.json()["is_admin"] is True
    
    # Self-toggle must fail with 400
    self_resp = client.put(f"/auth/users/{test_admin_user.user_id}/toggle-admin", headers=admin_auth_headers)
    assert self_resp.status_code == 400
