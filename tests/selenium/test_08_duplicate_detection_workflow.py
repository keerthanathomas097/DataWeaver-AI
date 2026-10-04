import pytest
from selenium.webdriver.common.by import By
from tests.selenium.config import config
from tests.selenium.pages.dashboard_page import DashboardPage
from tests.selenium.pages.workspace_page import WorkspacePage
from tests.selenium.pages.dataset_page import DatasetPage
from tests.selenium.pages.duplicate_detection_page import DuplicateDetectionPage


class TestDuplicateDetectionWorkflow:
    """Test Suite 8: Duplicate Detection Action and Review Dashboard Workflows.

    Note on Known Limitation:
    Executing live duplicate detection on large remote datasets involves asynchronous MinIO
    downloads, image decoding, and perceptual/neural embedding extraction.
    This test verifies the user-facing UI controls, detection trigger button, and
    the Duplicate Review Dashboard presentation (metrics, badges, and back navigation).
    """

    def _open_target_workspace(self, workspace_page: WorkspacePage):
        """Helper to open target workspace ('Cats and Dogs') by name or fallback to first available card."""
        if not workspace_page.select_workspace_card_by_name(config.TEST_WORKSPACE_NAME):
            cards = workspace_page.find_all(workspace_page.WORKSPACE_CARDS)
            if not cards:
                pytest.skip("No workspaces available to inspect duplicate detection.")
            cards[0].click()

    def test_sidebar_duplicate_detection_navigation(self, authenticated_driver):
        """Workflow:
        1. Log in to the application
        2. Click 'Duplicate Detection' in the sidebar analysis tools
        3. Verify the duplicate detection sub-module view is rendered with return CTA
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_duplicates_tab()

        # The view should display the duplicates module container
        submodule_heading = dashboard_page.find((
            By.XPATH,
            "//h2[contains(translate(., 'D', 'd'), 'duplicate') or contains(., 'Module')]"
        ))
        assert submodule_heading is not None

    def test_dataset_contextual_duplicate_detection_options(self, authenticated_driver):
        """Workflow:
        1. Open a workspace containing datasets
        2. Select a dataset row
        3. Verify the contextual actions panel displays either 'Detect Duplicates' or 'View Duplicates'
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        self._open_target_workspace(workspace_page)

        rows = workspace_page.get_dataset_rows()
        if not rows:
            pytest.skip("No datasets available in workspace.")

        rows[0].click()

        dataset_page = DatasetPage(authenticated_driver)
        assert dataset_page.is_action_panel_visible(), "Actions panel did not appear"

        # Check for Detect Duplicates or View Duplicates button
        has_detect_btn = dataset_page.is_visible(dataset_page.DETECT_DUPLICATES_BTN, timeout=3)
        has_view_btn = dataset_page.is_visible(dataset_page.VIEW_DUPLICATES_BTN, timeout=3)
        assert has_detect_btn or has_view_btn, (
            "Neither 'Detect Duplicates' nor 'View Duplicates' button was visible in the contextual actions panel"
        )

    def test_duplicate_review_dashboard_ui_components(self, authenticated_driver):
        """Workflow:
        1. Open a workspace and select a dataset that already has duplicates detected
        2. Click 'View Duplicates'
        3. Verify the Duplicate Review Dashboard appears
        4. Verify the 4 summary metric cards (Duplicate Groups, Visually Similar Groups,
           Total Redundant Images, Dataset Domain Route) are present
        5. Click the back button and verify return to the workspace datasets view
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        self._open_target_workspace(workspace_page)

        rows = workspace_page.get_dataset_rows()
        if not rows:
            pytest.skip("No datasets available.")

        # Find a row that has View Duplicates or select first matching row
        dataset_page = DatasetPage(authenticated_driver)
        found_completed = False
        for row in rows:
            row.click()
            if dataset_page.is_visible(dataset_page.VIEW_DUPLICATES_BTN, timeout=2):
                found_completed = True
                break
            dataset_page.cancel_selection()

        if not found_completed:
            pytest.skip(
                "None of the datasets in workspace currently have 'duplicates_detected' status. "
                "Run duplicate detection first to test the full results dashboard."
            )

        dataset_page.click_view_duplicates()

        dup_page = DuplicateDetectionPage(authenticated_driver)
        assert dup_page.is_loaded(), "Duplicate Review Dashboard did not open upon clicking 'View Duplicates'"

        # Verify summary metric cards
        assert dup_page.is_visible(dup_page.DUPLICATE_GROUPS_STAT), "Duplicate Groups stat card missing"
        assert dup_page.is_visible(dup_page.VISUALLY_SIMILAR_STAT), "Visually Similar Groups stat card missing"
        assert dup_page.is_visible(dup_page.TOTAL_REDUNDANT_STAT), "Total Redundant Images stat card missing"
        assert dup_page.is_visible(dup_page.DOMAIN_ROUTE_STAT), "Dataset Domain Route stat card missing"

        # Verify Back button navigation
        dup_page.click_back_to_datasets()
        assert not dup_page.is_visible(dup_page.DASHBOARD_TITLE, timeout=3), "Failed to return from Duplicate Dashboard"
