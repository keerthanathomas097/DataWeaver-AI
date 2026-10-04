from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from tests.selenium.pages.base_page import BasePage


class DashboardPage(BasePage):
    """Page Object for the authenticated DataWeaver AI dashboard layout, Header, and Sidebar."""

    # Header Locators
    BRAND_HEADING = (By.XPATH, "//h1[contains(., 'DataWeaver')]")
    SEARCH_INPUT = (By.XPATH, "//header//input[@placeholder='Search datasets, workspaces...']")
    ACTIVE_WORKSPACE_BTN = (By.XPATH, "//header//button[contains(@class, 'bg-blue-50') and .//span]")
    WORKSPACE_DROPDOWN_MENU = (By.XPATH, "//div[contains(text(), 'Switch Workspace')]/ancestor::div[contains(@class, 'bg-white')]")
    PROFILE_BTN = (By.XPATH, "//header//button[contains(@class, 'hover:opacity-90') or .//div[contains(@class, 'rounded-full')]]")
    PROFILE_DROPDOWN = (By.XPATH, "//div[contains(@class, 'shadow-xl') and .//button[contains(., 'Sign out')]]")
    SIGN_OUT_BTN = (By.XPATH, "//button[contains(., 'Sign out')]")
    PROFILE_USER_NAME = (By.XPATH, "//header//p[contains(@class, 'font-bold') and contains(@class, 'text-slate-800')]")

    # Sidebar Navigation Locators
    NAV_DASHBOARD = (By.XPATH, "//aside//button[contains(., 'Dashboard')]")
    NAV_DISCOVER = (By.XPATH, "//aside//button[contains(., 'Discover Datasets')]")
    NAV_UPLOAD = (By.XPATH, "//aside//button[contains(., 'Upload Dataset')]")
    NAV_WORKSPACES = (By.XPATH, "//aside//button[contains(., 'Workspaces')]")
    NAV_DUPLICATES = (By.XPATH, "//aside//button[contains(., 'Duplicate Detection')]")

    # Dashboard Content Locators
    CREATE_WORKSPACE_CARD = (By.XPATH, "//p[contains(text(), 'Create New Workspace')]/ancestor::div[contains(@class, 'cursor-pointer')]")
    DASHBOARD_STATS_GRID = (By.XPATH, "//div[contains(@class, 'grid') and contains(@class, 'grid-cols-4') or contains(@class, 'grid-cols-2')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def is_loaded(self, timeout: int = 10) -> bool:
        """Verify the authenticated dashboard frame is visible."""
        return self.is_visible(self.BRAND_HEADING, timeout=timeout) and self.is_visible(self.NAV_DASHBOARD, timeout=timeout)

    def get_displayed_user_name(self) -> str:
        """Get the user's name displayed in the Header profile section."""
        return self.get_text(self.PROFILE_USER_NAME)

    def get_active_workspace_name(self) -> str:
        """Get active workspace name shown in header."""
        return self.get_text(self.ACTIVE_WORKSPACE_BTN)

    def open_workspaces_tab(self) -> None:
        self.click(self.NAV_WORKSPACES)

    def open_discover_tab(self) -> None:
        self.click(self.NAV_DISCOVER)

    def open_duplicates_tab(self) -> None:
        self.click(self.NAV_DUPLICATES)

    def open_dashboard_tab(self) -> None:
        self.click(self.NAV_DASHBOARD)

    def open_create_workspace_modal_from_dashboard(self) -> None:
        """Click the dotted 'Create New Workspace' card on Dashboard."""
        self.click(self.CREATE_WORKSPACE_CARD)

    def logout(self) -> None:
        """Open profile menu in Header and click Sign out."""
        self.click(self.PROFILE_BTN)
        self.find(self.PROFILE_DROPDOWN)
        self.click(self.SIGN_OUT_BTN)
