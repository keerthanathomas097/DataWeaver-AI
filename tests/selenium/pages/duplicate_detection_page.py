from typing import List
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from tests.selenium.pages.base_page import BasePage


class DuplicateDetectionPage(BasePage):
    """Page Object for the Duplicates Review Dashboard (DuplicatesDashboard.jsx)."""

    # Dashboard Header & Back Locators
    DASHBOARD_TITLE = (By.XPATH, "//h2[contains(text(), 'Duplicate Review Dashboard')]")
    DATASET_SUBTITLE = (By.XPATH, "//p[contains(text(), 'Dataset:')]//span")
    BACK_BTN = (By.XPATH, "//button[@title='Back to Datasets' or .//*[local-name()='svg' and contains(@class, 'lucide-arrow-left')]]")

    # Summary Metrics Locators
    DUPLICATE_GROUPS_STAT = (By.XPATH, "//p[contains(text(), 'Duplicate Groups')]/following-sibling::p")
    VISUALLY_SIMILAR_STAT = (By.XPATH, "//p[contains(text(), 'Visually Similar Groups')]/following-sibling::p")
    TOTAL_REDUNDANT_STAT = (By.XPATH, "//p[contains(text(), 'Total Redundant Images')]/following-sibling::p")
    DOMAIN_ROUTE_STAT = (By.XPATH, "//p[contains(text(), 'Dataset Domain Route')]/following-sibling::p")

    # Group Items Locators
    IDENTIFIED_GROUPS_CONTAINER = (By.XPATH, "//p[contains(text(), 'Identified Groups')]/following-sibling::div")
    GROUP_CARDS = (By.XPATH, "//div[contains(@class, 'rounded-2xl') and .//span[contains(text(), 'Group #')]]")
    GROUP_LABELS = (By.XPATH, "//span[contains(text(), 'Group #')]")
    NO_GROUPS_BANNER = (By.XPATH, "//h3[contains(text(), 'No groups found!')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def is_loaded(self) -> bool:
        """Check if Duplicates Review Dashboard is loaded."""
        return self.is_visible(self.DASHBOARD_TITLE)

    def get_dashboard_dataset_name(self) -> str:
        """Get the dataset name associated with the duplicate report."""
        return self.get_text(self.DATASET_SUBTITLE)

    def get_duplicate_groups_count(self) -> str:
        """Return the number shown in the Duplicate Groups metric card."""
        return self.get_text(self.DUPLICATE_GROUPS_STAT)

    def get_visually_similar_count(self) -> str:
        """Return the number shown in the Visually Similar Groups metric card."""
        return self.get_text(self.VISUALLY_SIMILAR_STAT)

    def get_total_redundant_count(self) -> str:
        """Return the number shown in the Total Redundant Images metric card."""
        return self.get_text(self.TOTAL_REDUNDANT_STAT)

    def get_domain_route(self) -> str:
        """Return the domain route string shown in the summary (e.g. 'Photographic')."""
        return self.get_text(self.DOMAIN_ROUTE_STAT)

    def get_identified_groups(self) -> List[WebElement]:
        """Return all group card elements."""
        return self.find_all(self.GROUP_CARDS, timeout=4)

    def has_clean_dataset_message(self) -> bool:
        """Check if 'No groups found!' is displayed for clean datasets."""
        return self.is_visible(self.NO_GROUPS_BANNER, timeout=3)

    def click_back_to_datasets(self) -> None:
        """Click the back button to return to the workspace datasets view."""
        self.click(self.BACK_BTN)
        self.wait_for_invisibility(self.DASHBOARD_TITLE)
