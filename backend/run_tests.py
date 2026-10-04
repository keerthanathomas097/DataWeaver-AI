import sys
import os
import time

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

print("1. Importing pytest...", flush=True)
import pytest
print("2. Pytest imported successfully!", flush=True)

test_target = sys.argv[1:] if len(sys.argv) > 1 else ["tests/", "-v"]
if "-s" not in test_target:
    test_target.append("-s")
if "--assert=plain" not in test_target:
    test_target.append("--assert=plain")

print(f"3. Running pytest with args: {test_target}...", flush=True)
exit_code = pytest.main(test_target)
print(f"4. Finished with code: {exit_code}", flush=True)
sys.exit(exit_code)
