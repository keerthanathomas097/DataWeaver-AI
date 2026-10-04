import pytest
from tests.selenium.config import config
from tests.selenium.pages.login_page import LoginPage
from tests.selenium.pages.dashboard_page import DashboardPage


class TestLoginWorkflow:
    """Test Suite 3: User Authentication & Login Error Handling Workflows."""

    def test_login_invalid_email_format(self, driver):
        """Workflow:
        1. Open Login page
        2. Enter invalid email string without @ / domain
        3. Trigger submission
        4. Verify client-side validation error message appears
        """
        login_page = LoginPage(driver)
        login_page.load()

        login_page.enter_email("invalid-email-format")
        login_page.enter_password("SomePassword123!")
        login_page.click_submit()

        error_text = login_page.get_email_error_text()
        assert "valid email" in error_text.lower(), (
            f"Expected email format validation error, got: '{error_text}'"
        )

    def test_login_with_invalid_credentials(self, driver):
        """Workflow:
        1. Open Login page
        2. Enter an existing/valid email format with an incorrect password
        3. Click 'Sign in'
        4. Verify error alert banner appears on the page
        5. Verify user remains on the /login page
        """
        login_page = LoginPage(driver)
        login_page.load()

        login_page.login(config.TEST_USER_EMAIL, "DefinitelyWrongPassword999!")

        error_message = login_page.get_error_banner_text()
        assert len(error_message) > 0, "Expected error banner text on invalid credentials"
        assert "/login" in driver.current_url

    def test_login_successful_flow(self, driver):
        """Workflow:
        1. Open Login page
        2. Enter valid test credentials (from external test configuration)
        3. Submit form
        4. Verify redirection to the authenticated app (root /)
        5. Verify the dashboard, sidebar navigation, and Header profile appear
        """
        login_page = LoginPage(driver)
        login_page.load()

        login_page.login(config.TEST_USER_EMAIL, config.TEST_USER_PASSWORD)

        dashboard_page = DashboardPage(driver)
        assert dashboard_page.is_loaded(), "Dashboard did not load after submitting valid credentials"
        assert "/login" not in driver.current_url
