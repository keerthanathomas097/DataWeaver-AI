import sys
from unittest.mock import MagicMock, patch
import numpy as np

import os

# Set offline environment variables
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test_jwt_secret_key_for_testing_only_123456"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "1440"
os.environ["GMAIL_ADDRESS"] = "test@example.com"
os.environ["GMAIL_APP_PASSWORD"] = "testapppwd"
os.environ["GOOGLE_CLIENT_ID"] = "test-google-client-id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://localhost:8000/auth/google/callback"
os.environ["FRONTEND_URL"] = "http://localhost:5173"
os.environ["HUGGINGFACE_API_KEY"] = "test_hf_key"
os.environ["GITHUB_API_KEY"] = "test_gh_key"
os.environ["ROBOFLOW_API_KEY"] = "test_rf_key"
os.environ["KAGGLE_USERNAME"] = "test_kaggle_user"
os.environ["KAGGLE_KEY"] = "test_kaggle_key"
os.environ["GROQ_API_KEY"] = "test_groq_key"
os.environ["MINIO_ENDPOINT"] = "localhost:9000"
os.environ["MINIO_ACCESS_KEY"] = "minioadmin"
os.environ["MINIO_SECRET_KEY"] = "minioadmin"
os.environ["MINIO_BUCKET_NAME"] = "test-dataweaver-bucket"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["ANONYMIZED_TELEMETRY"] = "False"
os.environ["CHROMA_TELEMETRY"] = "False"
os.environ["POSTHOG_DISABLED"] = "1"

# 1. Pre-mock sentence_transformers in sys.modules
class MockSentenceTransformer:
    def __init__(self, *args, **kwargs):
        pass

    def encode(self, texts, *args, **kwargs):
        if isinstance(texts, str):
            return np.ones(384, dtype=np.float32)
        return [np.ones(384, dtype=np.float32) for _ in texts]

mock_st_mod = MagicMock()
mock_st_mod.SentenceTransformer = MockSentenceTransformer
sys.modules["sentence_transformers"] = mock_st_mod

# 2. Pre-mock groq
mock_groq_mod = MagicMock()
sys.modules["groq"] = mock_groq_mod

# 3. Pre-mock kaggle
mock_kaggle_mod = MagicMock()
sys.modules["kaggle"] = mock_kaggle_mod

# 4. Pre-mock Authlib register
import authlib.integrations.starlette_client
authlib.integrations.starlette_client.OAuth.register = lambda *args, **kwargs: None

# 5. Pre-mock ChromaDB in sys.modules
class MockChromaCollection:
    def __init__(self, name="mock_collection"):
        self.name = name
        self.data = {}

    def add(self, ids, embeddings, metadatas=None):
        for i, emb in zip(ids, embeddings):
            meta = metadatas[ids.index(i)] if metadatas else {}
            self.data[i] = {"embedding": emb, "metadata": meta}

    def get(self, ids=None, where=None, include=None):
        res = {"ids": [], "embeddings": [], "metadatas": []}
        for k, v in self.data.items():
            if ids and k not in ids:
                continue
            if where:
                match = all(v["metadata"].get(wk) == wv for wk, wv in where.items())
                if not match:
                    continue
            res["ids"].append(k)
            res["embeddings"].append(v["embedding"])
            res["metadatas"].append(v["metadata"])
        return res

    def query(self, query_embeddings=None, n_results=10, where=None, include=None):
        items = list(self.data.values())
        if where:
            items = [item for item in items if all(item["metadata"].get(k) == v for k, v in where.items())]
        selected = items[:n_results]
        return {
            "embeddings": [[x["embedding"] for x in selected]],
            "metadatas": [[x["metadata"] for x in selected]],
        }

    def delete(self, ids=None, where=None):
        to_delete = []
        for k, v in self.data.items():
            if ids and k in ids:
                to_delete.append(k)
            elif where:
                if all(v["metadata"].get(wk) == wv for wk, wv in where.items()):
                    to_delete.append(k)
        for k in to_delete:
            del self.data[k]

class MockChromaClient:
    def __init__(self, *args, **kwargs):
        self.collections = {}

    def get_or_create_collection(self, name, *args, **kwargs):
        if name not in self.collections:
            self.collections[name] = MockChromaCollection(name)
        return self.collections[name]

import chromadb
chromadb.PersistentClient = MockChromaClient
chromadb.EphemeralClient = MockChromaClient

# 6. Pre-mock storage_service startup
import app.services.storage_service as storage_srv
storage_srv.ensure_bucket_exists = lambda: None

import io
import uuid
import datetime
import pytest
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_session
import app.database as app_db
from app.models.user import User
from app.models.workspace import Workspace
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.password_reset_token import PasswordResetToken
from app.models.profiling import DatasetProfilingResult
from app.services.auth_service import hash_password, create_access_token


# SQLite in-memory test engine with immediate table creation
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
app_db.engine = test_engine
import app.services.duplicate_detection_service as dds
dds.engine = test_engine
import app.services.profiling_service as ps
ps.engine = test_engine
import app.services.dataset_download_service as dds_dl
dds_dl.engine = test_engine
SQLModel.metadata.create_all(test_engine)




@pytest.fixture
def db_session():
    """Provides a fresh database session per test with clean isolation."""
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        yield session


@pytest.fixture(autouse=True)
def mock_smtp():
    """Globally mock smtplib.SMTP to prevent any real email sending."""
    with patch("smtplib.SMTP") as mock_smtp_cls:
        instance = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = instance
        yield instance


@pytest.fixture
def override_db(db_session):
    """Overrides FastAPI dependency for get_session."""
    def _get_test_session():
        yield db_session

    app.dependency_overrides[get_session] = _get_test_session
    yield db_session
    app.dependency_overrides.pop(get_session, None)


@pytest.fixture
def client(override_db):
    """FastAPI TestClient with overridden database session."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def test_user(db_session) -> User:
    """Creates a verified standard user in the test database."""
    user = User(
        user_email=f"user_{uuid.uuid4().hex[:8]}@dataweaver.ai",
        user_password_hash=hash_password("Password123!"),
        user_full_name="Test User",
        user_email_verified=True,
        user_is_admin=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def unverified_user(db_session) -> User:
    """Creates an unverified standard user."""
    user = User(
        user_email=f"unverified_{uuid.uuid4().hex[:8]}@dataweaver.ai",
        user_password_hash=hash_password("Password123!"),
        user_full_name="Unverified User",
        user_email_verified=False,
        user_verification_token=f"token_{uuid.uuid4().hex}",
        user_token_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24),
        user_is_admin=False,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_admin_user(db_session) -> User:
    """Creates an admin user."""
    user = User(
        user_email=f"admin_{uuid.uuid4().hex[:8]}@dataweaver.ai",
        user_password_hash=hash_password("AdminPass123!"),
        user_full_name="Admin User",
        user_email_verified=True,
        user_is_admin=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user) -> dict:
    """Returns Bearer authorization headers for standard test user."""
    token = create_access_token(str(test_user.user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_auth_headers(test_admin_user) -> dict:
    """Returns Bearer authorization headers for admin test user."""
    token = create_access_token(str(test_admin_user.user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_workspace(db_session, test_user) -> Workspace:
    """Creates a sample workspace belonging to test_user."""
    ws = Workspace(
        user_id=test_user.user_id,
        workspace_name="Medical Imaging Workspace",
        workspace_research_domain="Medical Imaging",
        workspace_description="Workspace for CT and MRI research",
    )
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    return ws


@pytest.fixture
def test_dataset(db_session, test_workspace) -> Dataset:
    """Creates a sample dataset linked to test_workspace."""
    ds = Dataset(
        workspace_id=test_workspace.workspace_id,
        dataset_name="Chest X-Ray Pneumonia",
        dataset_source_type="kaggle",
        dataset_source_url="https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia",
        dataset_license="CC BY 4.0",
        dataset_image_count=100,
        dataset_storage_path="datasets/paultimothymooney_chest-xray-pneumonia/",
        dataset_status="downloaded",
    )
    db_session.add(ds)
    db_session.commit()
    db_session.refresh(ds)
    return ds


class MockMinioResponse:
    def __init__(self, data: bytes):
        self.data = data
        self.stream = io.BytesIO(data)

    def read(self, *args, **kwargs):
        return self.data

    def close(self):
        pass

    def release_conn(self):
        pass


class MockMinioClient:
    """In-memory MinIO mock for storage and pipeline tests."""
    def __init__(self):
        self.storage = {}
        self.buckets = {"test-dataweaver-bucket"}

    def bucket_exists(self, bucket_name: str) -> bool:
        return bucket_name in self.buckets

    def make_bucket(self, bucket_name: str):
        self.buckets.add(bucket_name)

    def fput_object(self, bucket_name: str, object_name: str, file_path: str):
        with open(file_path, "rb") as f:
            self.storage[object_name] = f.read()

    def put_object(self, bucket_name: str, object_name: str, data_stream, length: int):
        self.storage[object_name] = data_stream.read()

    def get_object(self, bucket_name: str, object_name: str):
        if object_name not in self.storage:
            raise KeyError(f"Object {object_name} not found in mock MinIO")
        return MockMinioResponse(self.storage[object_name])

    def list_objects(self, bucket_name: str, prefix: str = "", recursive: bool = True):
        class MinioObj:
            def __init__(self, name):
                self.object_name = name

        return [MinioObj(name) for name in self.storage if name.startswith(prefix)]

    def presigned_get_object(self, bucket_name: str, object_name: str, expires=None) -> str:
        return f"http://localhost:9000/{bucket_name}/{object_name}?token=mock-presigned"


@pytest.fixture
def mock_minio():
    """Provides a fresh MockMinioClient instance patched into storage_service."""
    mock_client = MockMinioClient()
    with patch("app.services.storage_service.minio_client", mock_client), \
         patch("app.services.duplicate_detection_service.minio_client", mock_client), \
         patch("app.services.dataset_download_service.minio_client", mock_client), \
         patch("app.routers.dataset.minio_client", mock_client):
        yield mock_client
