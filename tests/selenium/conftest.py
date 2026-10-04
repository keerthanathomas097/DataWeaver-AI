import uuid
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions

from tests.selenium.config import config
from tests.selenium.pages.login_page import LoginPage
from tests.selenium.pages.dashboard_page import DashboardPage


@pytest.fixture(scope="session")
def test_config():
    """Provides test suite configuration settings."""
    return config


@pytest.fixture(scope="function")
def driver():
    """Initializes and tears down Chrome WebDriver using Selenium Manager.
    Configured via tests.selenium.config.SeleniumConfig.
    """
    options = ChromeOptions()
    
    if config.HEADLESS:
        # Chrome modern headless mode
        options.add_argument("--headless=new")

    # Standard stability options for automated CI/local browser runs
    options.add_argument(f"--window-size={config.WINDOW_WIDTH},{config.WINDOW_HEIGHT}")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-infobars")
    options.add_argument("--ignore-certificate-errors")
    
    # Silence automated Chrome banner
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    # Initialize Chrome driver via Selenium Manager (built-in to Selenium 4.6+)
    web_driver = webdriver.Chrome(options=options)
    web_driver.set_page_load_timeout(config.LONG_TIMEOUT)

    yield web_driver

    # Clean shutdown
    try:
        web_driver.quit()
    except Exception:
        pass


@pytest.fixture(scope="function")
def authenticated_driver(driver):
    """Logs into the DataWeaver application using configured test credentials
    and yields the driver already positioned on the authenticated Dashboard.
    """
    login_page = LoginPage(driver)
    login_page.load()
    login_page.login(config.TEST_USER_EMAIL, config.TEST_USER_PASSWORD)

    dashboard_page = DashboardPage(driver)
    if not dashboard_page.is_loaded(timeout=config.DEFAULT_TIMEOUT):
        banner = login_page.get_error_banner_text() if login_page.is_visible(login_page.ERROR_BANNER, timeout=2) else "No error banner displayed"
        assert False, (
            f"Failed to authenticate user '{config.TEST_USER_EMAIL}'. "
            f"Login page error: '{banner}'. Current URL: '{driver.current_url}'."
        )
    
    return driver


@pytest.fixture(scope="function")
def unique_workspace_name():
    """Generates an isolated test workspace name to avoid polluting user data."""
    unique_id = uuid.uuid4().hex[:8]
    return f"E2E_Test_WS_{unique_id}"
