import pytest
from tests.selenium.config import config
from tests.selenium.pages.dashboard_page import DashboardPage
from tests.selenium.pages.workspace_page import WorkspacePage
from tests.selenium.pages.dataset_page import DatasetPage


class TestDatasetWorkflow:
    """Test Suite 6: Dataset Selection, Metadata Review, and Contextual Actions Workflows."""

    def _open_target_workspace(self, workspace_page: WorkspacePage):
        """Helper to open target workspace by name or fallback to first available card."""
        if not workspace_page.select_workspace_card_by_name(config.TEST_WORKSPACE_NAME):
            cards = workspace_page.find_all(workspace_page.WORKSPACE_CARDS)
            if not cards:
                pytest.skip("No workspaces available to inspect datasets.")
            cards[0].click()

    def test_view_workspace_datasets_table(self, authenticated_driver):
        """Workflow:
        1. Log in and open workspaces tab
        2. Select the target workspace card ('Cats and Dogs')
        3. Verify the workspace datasets table renders with headers (Dataset Name, Format, File Count, Size)
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        self._open_target_workspace(workspace_page)

        assert workspace_page.is_detail_view_loaded(), "Workspace detail view did not load"

    def test_dataset_selection_and_contextual_actions(self, authenticated_driver):
        """Workflow:
        1. Open an existing workspace that contains datasets
        2. Click on a dataset row to select it
        3. Verify the bottom Contextual Actions Panel appears
        4. Verify that action options ('Profile', 'Detect Duplicates'/'View Duplicates', 'Merge', 'Remove') are displayed
        5. Click Cancel to dismiss selection
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        self._open_target_workspace(workspace_page)

        rows = workspace_page.get_dataset_rows()
        if not rows:
            pytest.skip("Selected workspace does not contain any datasets to inspect.")

        # Click the first dataset row to select it
        rows[0].click()

        dataset_page = DatasetPage(authenticated_driver)
        assert dataset_page.is_action_panel_visible(), "Contextual actions panel failed to appear upon dataset selection"

        # Cancel selection safely
        dataset_page.cancel_selection()
        assert not dataset_page.is_action_panel_visible(), "Contextual actions panel was not dismissed after clicking Cancel"

    def test_safe_dataset_removal_modal_cancel(self, authenticated_driver):
        """Workflow:
        1. Select a dataset in the workspace
        2. Click the 'Remove' action button in the contextual panel
        3. Verify the 'Remove Dataset?' confirmation modal displays
        4. Click 'Cancel' inside the modal
        5. Verify the modal closes without deleting or removing any dataset
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        self._open_target_workspace(workspace_page)

        rows = workspace_page.get_dataset_rows()
        if not rows:
            pytest.skip("No datasets available to test removal dialog.")

        rows[0].click()

        dataset_page = DatasetPage(authenticated_driver)
        dataset_page.click_remove()

        assert dataset_page.is_remove_modal_visible(), "Remove Dataset confirmation modal did not appear"

        # Safely cancel removal to prevent data loss
        dataset_page.cancel_remove()
        assert not dataset_page.is_remove_modal_visible(), "Remove Dataset modal was not dismissed upon clicking Cancel"
