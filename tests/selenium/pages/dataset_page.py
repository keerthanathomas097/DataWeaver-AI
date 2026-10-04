from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from tests.selenium.pages.base_page import BasePage


class DatasetPage(BasePage):
    """Page Object for the contextual Dataset Actions Panel within a workspace."""

    # Contextual Actions Panel Locators (matching App.jsx lines 1734-1859)
    ACTIONS_PANEL = (By.XPATH, "//p[contains(text(), 'Selected Dataset')]/ancestor::div[contains(@class, 'rounded-2xl')]")
    SELECTED_DATASET_NAME = (By.XPATH, "//p[contains(text(), 'Selected Dataset')]/following-sibling::h4")
    DETECT_DUPLICATES_BTN = (By.XPATH, "//button[contains(., 'Detect Duplicates') or contains(., 'Detecting...')]")
    VIEW_DUPLICATES_BTN = (By.XPATH, "//button[contains(., 'View Duplicates')]")
    PROFILE_BTN = (By.XPATH, "//button[contains(., 'Profile')]")
    MANAGE_LABELS_BTN = (By.XPATH, "//button[contains(., 'Manage Labels')]")
    MERGE_BTN = (By.XPATH, "//button[contains(., 'Merge')]")
    REMOVE_BTN = (By.XPATH, "//button[contains(., 'Remove') and not(contains(., 'Dataset'))]")
    CANCEL_SELECTION_BTN = (By.XPATH, "//div[contains(@class, 'flex-wrap')]//button[text()='Cancel']")

    # Remove Dataset Modal Locators (matching App.jsx lines 1932-1980)
    REMOVE_MODAL = (By.XPATH, "//h3[contains(., 'Remove Dataset?')]")
    CONFIRM_REMOVE_BTN = (By.XPATH, "//button[contains(., 'Remove Dataset') or contains(., 'Removing...')]")
    CANCEL_REMOVE_BTN = (By.XPATH, "//div[contains(@class, 'z-50')]//button[contains(text(), 'Cancel')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def is_action_panel_visible(self) -> bool:
        """Check if the bottom floating actions panel is visible."""
        return self.is_visible(self.ACTIONS_PANEL)

    def get_selected_dataset_name(self) -> str:
        """Get the dataset name displayed in the actions panel."""
        return self.get_text(self.SELECTED_DATASET_NAME)

    def click_detect_duplicates(self) -> None:
        """Trigger duplicate detection on the selected dataset."""
        self.click(self.DETECT_DUPLICATES_BTN)

    def click_view_duplicates(self) -> None:
        """Open the Duplicates Dashboard for a dataset that has completed duplicate detection."""
        self.click(self.VIEW_DUPLICATES_BTN)

    def click_remove(self) -> None:
        """Click the Remove action button to open the confirmation modal."""
        self.click(self.REMOVE_BTN)
        self.find(self.REMOVE_MODAL)

    def is_remove_modal_visible(self) -> bool:
        """Check if Remove Dataset confirmation modal is displayed."""
        return self.is_visible(self.REMOVE_MODAL)

    def cancel_remove(self) -> None:
        """Click Cancel in the remove dataset confirmation dialog."""
        self.click(self.CANCEL_REMOVE_BTN)
        self.wait_for_invisibility(self.REMOVE_MODAL)

    def confirm_remove(self) -> None:
        """Confirm dataset removal from the workspace."""
        self.click(self.CONFIRM_REMOVE_BTN)
        self.wait_for_invisibility(self.REMOVE_MODAL)

    def cancel_selection(self) -> None:
        """Deselect the current dataset."""
        self.click(self.CANCEL_SELECTION_BTN)
        self.wait_for_invisibility(self.ACTIONS_PANEL)
