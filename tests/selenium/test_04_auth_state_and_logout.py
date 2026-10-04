import pytest
from tests.selenium.pages.dashboard_page import DashboardPage
from tests.selenium.pages.login_page import LoginPage


class TestAuthStateAndLogout:
    """Test Suite 4: Session Handling, Sign Out, and Protected Route Enforcement."""

    def test_sign_out_flow(self, authenticated_driver):
        """Workflow:
        1. Start from an authenticated session on the dashboard
        2. Open the user profile dropdown from the Header
        3. Click 'Sign out'
        4. Verify redirection to the /login page
        """
        dashboard_page = DashboardPage(authenticated_driver)
        assert dashboard_page.is_loaded(), "Initial authenticated dashboard was not loaded"

        # Execute sign out
        dashboard_page.logout()

        login_page = LoginPage(authenticated_driver)
        login_page.wait_for_url_contains("/login")
        assert "/login" in authenticated_driver.current_url, (
            f"Expected redirection to /login after sign out, got: {authenticated_driver.current_url}"
        )
        assert login_page.is_loaded(), "Login page failed to render after sign out"

    def test_protected_route_access_after_logout(self, authenticated_driver):
        """Workflow:
        1. Sign out from the current authenticated session
        2. Attempt to navigate directly to the root protected URL (/)
        3. Verify the ProtectedRoute guard intercepts the request and redirects to /login
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.logout()

        # Attempt to access protected dashboard directly
        dashboard_page.open("/")

        login_page = LoginPage(authenticated_driver)
        login_page.wait_for_url_contains("/login")
        assert "/login" in authenticated_driver.current_url, (
            f"Protected route should redirect unauthenticated access to /login, got: {authenticated_driver.current_url}"
        )
