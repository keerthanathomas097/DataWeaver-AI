from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    gmail_address: str
    gmail_app_password: str
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    frontend_url: str
    huggingface_api_key: str
    github_api_key: str
    roboflow_api_key: str
    kaggle_username: str
    kaggle_key: str
    groq_api_key: str
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str

    class Config:
        env_file = ".env"

settings = Settings()