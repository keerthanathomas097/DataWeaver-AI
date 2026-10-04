from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from tests.selenium.pages.base_page import BasePage


class LoginPage(BasePage):
    """Page Object for the DataWeaver AI Sign In page (/login)."""

    # Locators matching LoginPage.jsx
    HEADING = (By.XPATH, "//h2[contains(text(), 'Welcome back')] | //h1[contains(text(), 'Welcome back')]")
    SUBTITLE = (By.XPATH, "//*[contains(text(), 'Sign in to continue to your research workspace')]")
    EMAIL_INPUT = (By.ID, "email")
    PASSWORD_INPUT = (By.ID, "password")
    SHOW_PASSWORD_BTN = (By.XPATH, "//button[@aria-label='Show password' or @aria-label='Hide password']")
    FORGOT_PASSWORD_LINK = (By.XPATH, "//button[contains(text(), 'Forgot password?')]")
    SUBMIT_BTN = (By.CSS_SELECTOR, "button[type='submit']")
    ERROR_BANNER = (By.CSS_SELECTOR, "div.bg-rose-50")
    EMAIL_FIELD_ERROR = (By.CSS_SELECTOR, "p.text-rose-600")
    CREATE_ACCOUNT_LINK = (By.CSS_SELECTOR, "a[href='/signup']")
    GOOGLE_SIGN_IN_BTN = (By.XPATH, "//button[contains(., 'Continue with Google')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def load(self) -> "LoginPage":
        """Navigate to /login."""
        try:
            self.open("/login")
        except Exception:
            self.driver.get(f"{self.base_url}/login")
        self.find(self.HEADING)
        return self

    def is_loaded(self) -> bool:
        """Check if login page components are rendered."""
        return self.is_visible(self.HEADING) and self.is_visible(self.EMAIL_INPUT)

    def enter_email(self, email: str) -> "LoginPage":
        self.type_text(self.EMAIL_INPUT, email)
        return self

    def enter_password(self, password: str) -> "LoginPage":
        self.type_text(self.PASSWORD_INPUT, password)
        return self

    def click_submit(self) -> None:
        self.click(self.SUBMIT_BTN)

    def login(self, email: str, password: str) -> None:
        """Complete login interaction."""
        self.enter_email(email)
        self.enter_password(password)
        self.click_submit()

    def get_error_banner_text(self) -> str:
        """Retrieve backend/server error message displayed in rose alert box."""
        return self.get_text(self.ERROR_BANNER)

    def get_email_error_text(self) -> str:
        """Retrieve client-side email format validation error."""
        return self.get_text(self.EMAIL_FIELD_ERROR)

    def click_create_account(self) -> None:
        """Click link to go to registration page."""
        self.click(self.CREATE_ACCOUNT_LINK)
