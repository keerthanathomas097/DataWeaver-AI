import sys
import os
import io
import time
import inspect
import traceback
import uuid
import datetime
from unittest.mock import MagicMock, patch
import numpy as np
from passlib.context import CryptContext

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

# 7. Fast Bcrypt rounds (rounds=4) for lightning-fast test execution
import app.services.auth_service as auth_svc
auth_svc.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)

# 8. Fast mock generate_embeddings
def mock_generate_embeddings(images, batch_size=16):
    n = len(images)
    if n == 0:
        return np.empty((0, 1280), dtype=np.float32)
    vecs = np.ones((n, 1280), dtype=np.float32)
    clip_part = vecs[:, :512] / np.sqrt(512)
    dino_part = vecs[:, 512:] / np.sqrt(768)
    return np.concatenate([clip_part, dino_part], axis=-1)

import app.services.embedding_service as emb_svc
emb_svc.generate_embeddings = mock_generate_embeddings

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
from app.services.auth_service import hash_password, create_access_token

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
app_db.engine = test_engine
SQLModel.metadata.create_all(test_engine)

# Import all test modules
import tests.unit.test_auth_service as t_auth_svc
import tests.unit.test_workspace_service as t_ws_svc
import tests.unit.test_dataset_service as t_ds_svc
import tests.unit.test_discovery_helpers as t_disc_hlp
import tests.unit.test_duplicate_dsu as t_dsu
import tests.unit.test_domain_heuristics as t_heur
import tests.unit.test_storage_service as t_storage
import tests.api.test_auth_router as t_auth_router
import tests.api.test_workspace_router as t_ws_router
import tests.api.test_dataset_router as t_ds_router
import tests.api.test_discovery_router as t_disc_router
import tests.ml.test_fusion_classifier as t_fusion
import tests.ml.test_embedding_service as t_emb
import tests.integration.test_duplicate_pipeline as t_pipe
import tests.integration.test_dataset_download as t_download
import tests.integration.test_chroma_integration as t_chroma

TEST_MODULES = [
    ("Unit: Auth Service", t_auth_svc),
    ("Unit: Workspace Service", t_ws_svc),
    ("Unit: Dataset Service", t_ds_svc),
    ("Unit: Discovery Helpers", t_disc_hlp),
    ("Unit: Duplicate DSU", t_dsu),
    ("Unit: Domain Heuristics", t_heur),
    ("Unit: Storage Service", t_storage),
    ("API: Auth Router", t_auth_router),
    ("API: Workspace Router", t_ws_router),
    ("API: Dataset Router", t_ds_router),
    ("API: Discovery Router", t_disc_router),
    ("ML: Fusion Classifier", t_fusion),
    ("ML: Embedding Service", t_emb),
    ("Integration: Duplicate Pipeline", t_pipe),
    ("Integration: Dataset Download", t_download),
    ("Integration: ChromaDB", t_chroma),
]

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


def run_suite():
    total_passed = 0
    total_failed = 0
    start_total = time.time()

    print("\n" + "=" * 75, flush=True)
    print("  DataWeaver AI Automated Testing Suite", flush=True)
    print("=" * 75, flush=True)

    for module_name, mod in TEST_MODULES:
        print(f"\n📂 {module_name}", flush=True)
        functions = [f for name, f in inspect.getmembers(mod, inspect.isfunction) if name.startswith("test_")]
        
        for func in functions:
            fn_name = func.__name__
            sig = inspect.signature(func)
            
            # Setup fresh in-memory session per test
            SQLModel.metadata.create_all(test_engine)
            with Session(test_engine) as db_sess:
                # Lazy fixtures
                fixtures = {}
                
                def get_test_user():
                    if "test_user" not in fixtures:
                        uid = uuid.uuid4().hex[:8]
                        u = User(
                            user_email=f"user_{uid}@dataweaver.ai",
                            user_password_hash=hash_password("Password123!"),
                            user_full_name="Test User",
                            user_email_verified=True,
                            user_is_admin=False,
                        )
                        db_sess.add(u)
                        db_sess.commit()
                        db_sess.refresh(u)
                        fixtures["test_user"] = u
                    return fixtures["test_user"]

                def get_unverified_user():
                    if "unverified_user" not in fixtures:
                        uid = uuid.uuid4().hex[:8]
                        u = User(
                            user_email=f"unverified_{uid}@dataweaver.ai",
                            user_password_hash=hash_password("Password123!"),
                            user_full_name="Unverified User",
                            user_email_verified=False,
                            user_verification_token=f"token_{uid}",
                            user_token_expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=24),
                            user_is_admin=False,
                        )
                        db_sess.add(u)
                        db_sess.commit()
                        db_sess.refresh(u)
                        fixtures["unverified_user"] = u
                    return fixtures["unverified_user"]

                def get_admin_user():
                    if "test_admin_user" not in fixtures:
                        uid = uuid.uuid4().hex[:8]
                        u = User(
                            user_email=f"admin_{uid}@dataweaver.ai",
                            user_password_hash=hash_password("AdminPass123!"),
                            user_full_name="Admin User",
                            user_email_verified=True,
                            user_is_admin=True,
                        )
                        db_sess.add(u)
                        db_sess.commit()
                        db_sess.refresh(u)
                        fixtures["test_admin_user"] = u
                    return fixtures["test_admin_user"]

                def get_workspace():
                    if "test_workspace" not in fixtures:
                        u = get_test_user()
                        ws = Workspace(
                            user_id=u.user_id,
                            workspace_name="Medical Imaging Workspace",
                            workspace_research_domain="Medical Imaging",
                            workspace_description="Workspace for CT and MRI research",
                        )
                        db_sess.add(ws)
                        db_sess.commit()
                        db_sess.refresh(ws)
                        fixtures["test_workspace"] = ws
                    return fixtures["test_workspace"]

                def get_dataset():
                    if "test_dataset" not in fixtures:
                        ws = get_workspace()
                        ds = Dataset(
                            workspace_id=ws.workspace_id,
                            dataset_name="Chest X-Ray Pneumonia",
                            dataset_source_type="kaggle",
                            dataset_source_url="https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia",
                            dataset_license="CC BY 4.0",
                            dataset_image_count=100,
                            dataset_storage_path="datasets/paultimothymooney_chest-xray-pneumonia/",
                            dataset_status="downloaded",
                        )
                        db_sess.add(ds)
                        db_sess.commit()
                        db_sess.refresh(ds)
                        fixtures["test_dataset"] = ds
                    return fixtures["test_dataset"]

                mock_min = MockMinioClient()

                def _override_session():
                    yield db_sess

                app.dependency_overrides[get_session] = _override_session

                with patch("smtplib.SMTP"), \
                     patch("app.services.storage_service.minio_client", mock_min), \
                     patch("app.services.duplicate_detection_service.minio_client", mock_min), \
                     patch("app.services.dataset_download_service.minio_client", mock_min), \
                     patch("app.routers.dataset.minio_client", mock_min):

                    test_client = TestClient(app)

                    kwargs = {}
                    for param in sig.parameters:
                        if param == "db_session":
                            kwargs["db_session"] = db_sess
                        elif param == "test_user":
                            kwargs["test_user"] = get_test_user()
                        elif param == "unverified_user":
                            kwargs["unverified_user"] = get_unverified_user()
                        elif param == "test_admin_user":
                            kwargs["test_admin_user"] = get_admin_user()
                        elif param == "auth_headers":
                            u = get_test_user()
                            token = create_access_token(str(u.user_id))
                            kwargs["auth_headers"] = {"Authorization": f"Bearer {token}"}
                        elif param == "admin_auth_headers":
                            au = get_admin_user()
                            token = create_access_token(str(au.user_id))
                            kwargs["admin_auth_headers"] = {"Authorization": f"Bearer {token}"}
                        elif param == "test_workspace":
                            kwargs["test_workspace"] = get_workspace()
                        elif param == "test_dataset":
                            kwargs["test_dataset"] = get_dataset()
                        elif param == "mock_minio":
                            kwargs["mock_minio"] = mock_min
                        elif param == "client":
                            kwargs["client"] = test_client

                    t_start = time.time()
                    try:
                        func(**kwargs)
                        elapsed = (time.time() - t_start) * 1000
                        print(f"  ✅ {fn_name} ({elapsed:.1f}ms)", flush=True)
                        total_passed += 1
                    except Exception as e:
                        elapsed = (time.time() - t_start) * 1000
                        print(f"  ❌ {fn_name} FAILED ({elapsed:.1f}ms): {e}", flush=True)
                        traceback.print_exc()
                        total_failed += 1

                app.dependency_overrides.pop(get_session, None)

    total_time = time.time() - start_total
    print("\n" + "=" * 75, flush=True)
    print(f"  Results: {total_passed} PASSED | {total_failed} FAILED | Total Duration: {total_time:.2f}s", flush=True)
    print("=" * 75 + "\n", flush=True)

    if total_failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_suite()
