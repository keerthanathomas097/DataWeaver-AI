from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from tests.selenium.pages.base_page import BasePage


class SignupPage(BasePage):
    """Page Object for the DataWeaver AI Sign Up page (/signup)."""

    # Locators matching SignupPage.jsx
    HEADING = (By.XPATH, "//h2[contains(text(), 'Create your account')] | //h1[contains(text(), 'Create your account')]")
    SUBTITLE = (By.XPATH, "//*[contains(text(), 'Start building intelligent datasets for your research')]")
    FULL_NAME_INPUT = (By.ID, "fullName")
    EMAIL_INPUT = (By.ID, "email")
    PASSWORD_INPUT = (By.ID, "password")
    CONFIRM_PASSWORD_INPUT = (By.ID, "confirmPassword")
    SUBMIT_BTN = (By.CSS_SELECTOR, "button[type='submit']")
    ERROR_BANNER = (By.CSS_SELECTOR, "div.bg-rose-50")
    EMAIL_FIELD_ERROR = (By.CSS_SELECTOR, "p.text-rose-600")
    SIGN_IN_LINK = (By.CSS_SELECTOR, "a[href='/login']")
    PASSWORD_STRENGTH_LABEL = (By.XPATH, "//label[@for='password']//span[contains(@class, 'font-bold')]")
    PASSWORD_MATCH_LABEL = (By.XPATH, "//label[@for='confirmPassword']//span[contains(@class, 'font-semibold')]")

    def __init__(self, driver: WebDriver):
        super().__init__(driver)

    def load(self) -> "SignupPage":
        """Navigate to /signup."""
        self.open("/signup")
        self.find(self.HEADING)
        return self

    def is_loaded(self) -> bool:
        """Check if signup form elements are rendered."""
        return self.is_visible(self.HEADING) and self.is_visible(self.FULL_NAME_INPUT)

    def enter_full_name(self, full_name: str) -> "SignupPage":
        self.type_text(self.FULL_NAME_INPUT, full_name)
        return self

    def enter_email(self, email: str) -> "SignupPage":
        self.type_text(self.EMAIL_INPUT, email)
        return self

    def enter_password(self, password: str) -> "SignupPage":
        self.type_text(self.PASSWORD_INPUT, password)
        return self

    def enter_confirm_password(self, confirm_password: str) -> "SignupPage":
        self.type_text(self.CONFIRM_PASSWORD_INPUT, confirm_password)
        # Send TAB key to trigger React's onBlur event and set confirmPasswordTouched
        self.find(self.CONFIRM_PASSWORD_INPUT).send_keys(Keys.TAB)
        return self

    def click_submit(self) -> None:
        self.click(self.SUBMIT_BTN)

    def fill_form(self, full_name: str, email: str, password: str, confirm_password: str) -> "SignupPage":
        """Fill all fields of the registration form."""
        self.enter_full_name(full_name)
        self.enter_email(email)
        self.enter_password(password)
        self.enter_confirm_password(confirm_password)
        return self

    def signup(self, full_name: str, email: str, password: str, confirm_password: str) -> None:
        """Complete the signup process."""
        self.fill_form(full_name, email, password, confirm_password)
        self.click_submit()

    def get_error_banner_text(self) -> str:
        """Retrieve backend or validation error message."""
        return self.get_text(self.ERROR_BANNER)

    def get_password_match_status(self) -> str:
        """Retrieve the password match status text (e.g. 'Passwords match' or 'Passwords do not match')."""
        return self.get_text(self.PASSWORD_MATCH_LABEL)

    def click_sign_in_link(self) -> None:
        self.click(self.SIGN_IN_LINK)
