from typing import List
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import Select

from tests.selenium.config import config
from tests.selenium.pages.base_page import BasePage


class WorkspacePage(BasePage):
    """Page Object for Workspaces list, creation modal, and single workspace view."""

    # Workspaces List View Locators
    WORKSPACES_HEADING = (By.XPATH, "//h2[contains(text(), 'Project Workspaces')]")
    CREATE_WORKSPACE_BTN = (By.XPATH, "//button[contains(., 'Create Workspace') and not(@type='submit')]")
    WORKSPACE_CARDS = (By.XPATH, "//div[contains(@class, 'grid')]//div[contains(@class, 'cursor-pointer') and (.//h3 or .//h4)]")

    # Create Workspace Modal Locators (matching CreateWorkspaceModal.jsx)
    MODAL_CONTAINER = (By.XPATH, "//div[contains(@class, 'fixed') and .//h2[contains(text(), 'Create New Workspace')]]")
    MODAL_NAME_INPUT = (By.XPATH, "//input[@name='name']")
    MODAL_DOMAIN_SELECT = (By.XPATH, "//select[@name='domain']")
    MODAL_DESCRIPTION_INPUT = (By.XPATH, "//textarea[@name='description']")
    MODAL_SUBMIT_BTN = (By.XPATH, "//form//button[@type='submit' and contains(., 'Create Workspace')]")
    MODAL_CANCEL_BTN = (By.XPATH, "//form//button[contains(text(), 'Cancel')]")
    MODAL_ERROR_BANNER = (By.XPATH, "//div[contains(@class, 'bg-red-50')]")

    # Workspace Detail View Locators
    DETAIL_WORKSPACE_NAME = (By.XPATH, "//div[contains(@class, 'bg-white')]//h2[contains(@class, 'text-[22px]')]")
    DETAIL_DOMAIN_BADGE = (By.XPATH, "//span[contains(@class, 'bg-blue-50') and contains(@class, 'text-blue-600')]")
    BACK_TO_DASHBOARD_BTN = (By.XPATH, "//button[contains(., 'Back to Dashboard')]")
    DATASET_COUNT_STAT = (By.XPATH, "//p[contains(text(), 'Datasets Count')]/following-sibling::p")
    EMPTY_WORKSPACE_BANNER = (By.XPATH, "//h3[contains(text(), \"doesn't contain any datasets yet\")]")
    DATASETS_TABLE = (By.XPATH, "//table")
    DATASET_ROWS = (By.XPATH, "//table/tbody/tr")
    ADD_DATASET_MENU_BTN = (By.XPATH, "//button[contains(., 'Add Dataset')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def is_list_view_loaded(self) -> bool:
        """Verify the user is on the Project Workspaces grid view."""
        return self.is_visible(self.WORKSPACES_HEADING)

    def is_detail_view_loaded(self) -> bool:
        """Verify the user is on a single workspace detail view."""
        return self.is_visible(self.DETAIL_WORKSPACE_NAME, timeout=config.DEFAULT_TIMEOUT)

    def open_create_modal(self) -> None:
        """Click 'Create Workspace' button to open modal."""
        self.click(self.CREATE_WORKSPACE_BTN)
        self.find(self.MODAL_CONTAINER)

    def fill_create_workspace_form(self, name: str, domain: str = "Medical Imaging", description: str = "") -> None:
        """Populate the Create Workspace modal fields."""
        self.type_text(self.MODAL_NAME_INPUT, name)
        
        domain_elem = self.find(self.MODAL_DOMAIN_SELECT)
        select = Select(domain_elem)
        select.select_by_visible_text(domain)

        if description:
            self.type_text(self.MODAL_DESCRIPTION_INPUT, description)

    def submit_create_workspace(self) -> None:
        """Submit the workspace creation form."""
        self.click(self.MODAL_SUBMIT_BTN)
        self.wait_for_invisibility(self.MODAL_CONTAINER)

    def create_workspace(self, name: str, domain: str = "Medical Imaging", description: str = "") -> None:
        """Open modal, fill details, and submit."""
        self.open_create_modal()
        self.fill_create_workspace_form(name, domain, description)
        self.submit_create_workspace()

    def select_workspace_card_by_name(self, name: str) -> bool:
        """Click on a workspace card in the grid by its title."""
        locator = (By.XPATH, f"//div[contains(@class, 'cursor-pointer') and (.//h3[contains(text(), '{name}')] or .//h4[contains(text(), '{name}')])]")
        try:
            elem = self.find(locator, timeout=config.DEFAULT_TIMEOUT)
            self.scroll_into_view(elem)
            elem.click()
            return True
        except Exception:
            return False

    def get_current_workspace_name(self) -> str:
        """Return the header title of the currently opened workspace."""
        return self.get_text(self.DETAIL_WORKSPACE_NAME)

    def get_dataset_rows(self) -> List[WebElement]:
        """Return all dataset rows in the table."""
        return self.find_all(self.DATASET_ROWS, timeout=config.DEFAULT_TIMEOUT)

    def click_dataset_row(self, dataset_name: str) -> None:
        """Click on a specific dataset row by name to trigger contextual selection."""
        locator = (By.XPATH, f"//tr[.//td[contains(text(), '{dataset_name}')]]")
        self.click(locator)
