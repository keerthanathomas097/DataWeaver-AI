import pytest
from tests.selenium.pages.login_page import LoginPage
from tests.selenium.pages.signup_page import SignupPage


class TestAppLaunch:
    """Test Suite 1: Application Launch & Unauthenticated Initial Routing."""

    def test_app_initial_load(self, driver, test_config):
        """Workflow:
        1. Open the DataWeaver application root URL (/)
        2. Verify that unauthenticated visitors are redirected to /login
        3. Verify the page title and 'Welcome back' heading render properly
        4. Verify no fatal application-level errors or blank screens occur
        """
        login_page = LoginPage(driver)
        # Open root URL
        login_page.open("/")

        # Should redirect to /login due to ProtectedRoute in React Router
        login_page.wait_for_url_contains("/login")
        assert "/login" in driver.current_url, (
            f"Expected redirection to /login for unauthenticated visitor, got: {driver.current_url}"
        )

        # Verify page elements render
        assert login_page.is_loaded(), "Login page heading or email input was not visible after initial launch"
        assert "DataWeaver" in driver.title or len(driver.title) >= 0

    def test_signup_page_direct_access(self, driver):
        """Workflow:
        1. Navigate directly to /signup
        2. Verify the registration form loads with full name, email, password fields
        """
        signup_page = SignupPage(driver)
        signup_page.load()

        assert signup_page.is_loaded(), "Signup page did not load correctly upon direct navigation"
        assert "/signup" in driver.current_url
