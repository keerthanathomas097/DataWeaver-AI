from typing import List, Optional
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from tests.selenium.config import config


class BasePage:
    """Base class for all Page Objects providing explicit wait abstractions and helpers."""

    def __init__(self, driver: WebDriver):
        self.driver = driver
        self.base_url = config.FRONTEND_URL

    def open(self, path: str = "") -> "BasePage":
        """Navigate to a relative URL path."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        self.driver.get(url)
        return self

    def find(self, locator: tuple, timeout: Optional[int] = None) -> WebElement:
        """Find a visible element with explicit wait."""
        wait_time = timeout or config.DEFAULT_TIMEOUT
        return WebDriverWait(self.driver, wait_time, poll_frequency=config.POLL_FREQUENCY).until(
            EC.visibility_of_element_located(locator),
            message=f"Element located by {locator} was not visible after {wait_time}s"
        )

    def find_present(self, locator: tuple, timeout: Optional[int] = None) -> WebElement:
        """Find an element present in the DOM (not necessarily visible)."""
        wait_time = timeout or config.DEFAULT_TIMEOUT
        return WebDriverWait(self.driver, wait_time, poll_frequency=config.POLL_FREQUENCY).until(
            EC.presence_of_element_located(locator),
            message=f"Element located by {locator} was not present in DOM after {wait_time}s"
        )

    def find_all(self, locator: tuple, timeout: Optional[int] = None) -> List[WebElement]:
        """Find all elements present in the DOM matching locator."""
        wait_time = timeout or config.DEFAULT_TIMEOUT
        try:
            WebDriverWait(self.driver, wait_time, poll_frequency=config.POLL_FREQUENCY).until(
                EC.presence_of_element_located(locator)
            )
            return self.driver.find_elements(*locator)
        except TimeoutException:
            return []

    def click(self, locator: tuple, timeout: Optional[int] = None) -> None:
        """Wait for element to be clickable and click it."""
        wait_time = timeout or config.DEFAULT_TIMEOUT
        element = WebDriverWait(self.driver, wait_time, poll_frequency=config.POLL_FREQUENCY).until(
            EC.element_to_be_clickable(locator),
            message=f"Element located by {locator} was not clickable after {wait_time}s"
        )
        self.scroll_into_view(element)
        element.click()

    def type_text(self, locator: tuple, text: str, clear_first: bool = True, timeout: Optional[int] = None) -> None:
        """Type text into an input element."""
        element = self.find(locator, timeout=timeout)
        if clear_first:
            element.clear()
        element.send_keys(text)

    def get_text(self, locator: tuple, timeout: Optional[int] = None) -> str:
        """Get visible text of an element."""
        element = self.find(locator, timeout=timeout)
        return element.text.strip()

    def is_visible(self, locator: tuple, timeout: int = 3) -> bool:
        """Check if an element is visible within a short timeout without throwing."""
        try:
            WebDriverWait(self.driver, timeout, poll_frequency=config.POLL_FREQUENCY).until(
                EC.visibility_of_element_located(locator)
            )
            return True
        except TimeoutException:
            return False

    def wait_for_invisibility(self, locator: tuple, timeout: Optional[int] = None) -> bool:
        """Wait for an element to disappear from view."""
        wait_time = timeout or config.DEFAULT_TIMEOUT
        return WebDriverWait(self.driver, wait_time, poll_frequency=config.POLL_FREQUENCY).until(
            EC.invisibility_of_element_located(locator),
            message=f"Element located by {locator} was still visible after {wait_time}s"
        )

    def wait_for_url_contains(self, fragment: str, timeout: Optional[int] = None) -> bool:
        """Wait until current browser URL contains given substring."""
        wait_time = timeout or config.DEFAULT_TIMEOUT
        return WebDriverWait(self.driver, wait_time, poll_frequency=config.POLL_FREQUENCY).until(
            EC.url_contains(fragment),
            message=f"Current URL '{self.driver.current_url}' did not contain '{fragment}' within {wait_time}s"
        )

    def get_current_url(self) -> str:
        """Return current browser URL."""
        return self.driver.current_url

    def scroll_into_view(self, element: WebElement) -> None:
        """Scroll an element into view using javascript."""
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", element)
