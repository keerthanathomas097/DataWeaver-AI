from typing import List
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from tests.selenium.pages.base_page import BasePage
from tests.selenium.config import config


class DiscoveryPage(BasePage):
    """Page Object for Dataset Discovery (/discover tab) and Dataset Details Modal."""

    # Discovery Header & Search Bar Locators
    DISCOVER_HEADING = (By.XPATH, "//h1[contains(text(), 'Discover Datasets')] | //h2[contains(text(), 'Discover Datasets')]")
    SEARCH_INPUT = (By.XPATH, "//input[@placeholder='Describe the dataset you need...']")
    SEARCH_BTN = (By.XPATH, "//button[contains(., 'Search Datasets')]")
    CLEAR_SEARCH_BTN = (By.XPATH, "//input[@placeholder='Describe the dataset you need...']/following-sibling::button")
    FILTERS_BTN = (By.XPATH, "//button[contains(., 'Filters')]")

    # Results Locators
    RESULTS_CONTAINER = (By.XPATH, "//div[contains(@class, 'grid') and .//button[contains(., 'View Details')]]")
    DATASET_CARDS = (By.XPATH, "//div[contains(@class, 'group') and .//button[contains(., 'View Details')]]")
    DATASET_TITLES = (By.XPATH, "//div[contains(@class, 'group')]//h3 | //div[contains(@class, 'group')]//h4")
    VIEW_DETAILS_BTNS = (By.XPATH, "//button[contains(., 'View Details')]")
    ADD_TO_WORKSPACE_BTNS = (By.XPATH, "//button[contains(., 'Add to Workspace') or contains(., 'Added')]")

    # Dataset Details Modal Locators (matching DiscoverDatasets.jsx lines 1241-1400)
    DETAILS_MODAL = (By.XPATH, "//div[contains(@class, 'fixed') and contains(@class, 'z-50') and .//h2]")
    MODAL_DATASET_NAME = (By.XPATH, "//div[contains(@class, 'fixed') and contains(@class, 'z-50')]//h2[contains(@class, 'font-extrabold') or contains(@class, 'text-slate-900')]")
    MODAL_SOURCE_BADGE = (By.XPATH, "//div[contains(@class, 'fixed') and contains(@class, 'z-50')]//span[contains(@class, 'uppercase') or contains(@class, 'rounded')]")
    MODAL_MODALITY = (By.XPATH, "//span[contains(text(), 'Modality')]/following-sibling::span | //span[contains(text(), 'Modality')]/ancestor::div//span[contains(@class, 'font-bold')]")
    MODAL_CLOSE_BTN = (By.XPATH, "//div[contains(@class, 'fixed') and contains(@class, 'z-50')]//button[contains(@class, 'rounded-full') or .//*[local-name()='svg']]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def is_loaded(self) -> bool:
        """Verify the Discover Datasets search interface is loaded."""
        return self.is_visible(self.SEARCH_INPUT)

    def search_datasets(self, query: str) -> None:
        """Type query and trigger search."""
        self.type_text(self.SEARCH_INPUT, query)
        self.click(self.SEARCH_BTN)

    def get_dataset_cards(self, timeout: int = 15) -> List[WebElement]:
        """Wait for and return discovered dataset result cards."""
        return self.find_all(self.DATASET_CARDS, timeout=timeout)

    def get_result_count(self) -> int:
        """Return the number of dataset cards currently shown."""
        return len(self.get_dataset_cards(timeout=5))

    def open_dataset_details(self, index: int = 0) -> None:
        """Click 'View Details' on the dataset card at given 0-based index."""
        details_buttons = self.find_all(self.VIEW_DETAILS_BTNS, timeout=config.DEFAULT_TIMEOUT)
        if not details_buttons:
            raise RuntimeError("No 'View Details' buttons found on Discovery page.")
        if index >= len(details_buttons):
            raise IndexError(f"Requested index {index} out of range ({len(details_buttons)} cards available)")
        
        target_btn = details_buttons[index]
        self.scroll_into_view(target_btn)
        target_btn.click()
        self.find(self.DETAILS_MODAL)

    def is_details_modal_open(self) -> bool:
        """Check if the Dataset Details modal is currently visible."""
        return self.is_visible(self.DETAILS_MODAL)

    def get_modal_dataset_title(self) -> str:
        """Return dataset name displayed in the details modal."""
        return self.get_text(self.MODAL_DATASET_NAME)

    def close_details_modal(self) -> None:
        """Close the details modal."""
        self.click(self.MODAL_CLOSE_BTN)
        self.wait_for_invisibility(self.DETAILS_MODAL)
