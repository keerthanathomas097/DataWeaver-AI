import os
from pathlib import Path
from dotenv import load_dotenv

# Load optional .env file for local overrides
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)


class SeleniumConfig:
    """Configuration management for DataWeaver AI Selenium E2E test suite.
    All settings can be overridden via environment variables.
    """

    # URLs
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")

    # Browser & Driver Settings
    HEADLESS: bool = os.getenv("SELENIUM_HEADLESS", "true").lower() in ("true", "1", "yes")
    BROWSER: str = os.getenv("SELENIUM_BROWSER", "chrome").lower()
    WINDOW_WIDTH: int = int(os.getenv("SELENIUM_WINDOW_WIDTH", "1920"))
    WINDOW_HEIGHT: int = int(os.getenv("SELENIUM_WINDOW_HEIGHT", "1080"))

    # Timeouts (in seconds)
    DEFAULT_TIMEOUT: int = int(os.getenv("SELENIUM_DEFAULT_TIMEOUT", "10"))
    LONG_TIMEOUT: int = int(os.getenv("SELENIUM_LONG_TIMEOUT", "25"))
    POLL_FREQUENCY: float = float(os.getenv("SELENIUM_POLL_FREQUENCY", "0.5"))

    # Test Credentials (configured from verified development user)
    TEST_USER_EMAIL: str = os.getenv("TEST_USER_EMAIL", "keerthanathomas097@gmail.com")
    TEST_USER_PASSWORD: str = os.getenv("TEST_USER_PASSWORD", "Kat944750*Roman")
    TEST_USER_FULL_NAME: str = os.getenv("TEST_USER_FULL_NAME", "Keerthana Thomas")

    # Target Test Workspace with Scanned Datasets
    TEST_WORKSPACE_NAME: str = os.getenv("TEST_WORKSPACE_NAME", "Cats and Dogs")
    TEST_WORKSPACE_DOMAIN: str = os.getenv("TEST_WORKSPACE_DOMAIN", "General Image Dataset")


config = SeleniumConfig()
