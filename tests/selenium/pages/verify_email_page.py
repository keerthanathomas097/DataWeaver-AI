from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from tests.selenium.pages.base_page import BasePage


class VerifyEmailPage(BasePage):
    """Page Object for the Email Verification landing view (/verify-email)."""

    HEADING = (By.XPATH, "//h2[contains(text(), 'Verify your email') or contains(text(), 'Account Verification')]")
    SUBTITLE = (By.XPATH, "//*[contains(text(), 'One more step before you can fully access your workspace') or contains(text(), 'Status of your DataWeaver AI registration link')]")
    RETURN_TO_SIGNIN_LINK = (By.XPATH, "//a[contains(., 'Return to sign in') or contains(@href, '/login')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def is_loaded(self) -> bool:
        """Verify the user landed on the verify-email onboarding screen."""
        return self.is_visible(self.HEADING)

    def get_heading_text(self) -> str:
        return self.get_text(self.HEADING)

    def click_return_to_signin(self) -> None:
        self.click(self.RETURN_TO_SIGNIN_LINK)
