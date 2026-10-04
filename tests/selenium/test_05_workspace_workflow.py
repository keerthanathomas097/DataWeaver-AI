import pytest
from tests.selenium.pages.dashboard_page import DashboardPage
from tests.selenium.pages.workspace_page import WorkspacePage


class TestWorkspaceWorkflow:
    """Test Suite 5: Workspace Creation, Navigation, and Inspection Workflows."""

    def test_navigate_to_workspaces_list(self, authenticated_driver):
        """Workflow:
        1. Log in to the application
        2. Click 'Workspaces' in the sidebar
        3. Verify the Project Workspaces view and Create Workspace CTA load
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        assert workspace_page.is_list_view_loaded(), "Project Workspaces list view did not load"

    def test_create_new_workspace_workflow(self, authenticated_driver, unique_workspace_name):
        """Workflow:
        1. Navigate to the Workspaces tab
        2. Click 'Create Workspace' to open modal
        3. Fill out the form with a dedicated test workspace name, domain, and description
        4. Submit the form
        5. Verify the modal dismisses
        6. Verify the newly created workspace is selectable and its detail view opens
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_workspaces_tab()

        workspace_page = WorkspacePage(authenticated_driver)
        workspace_page.create_workspace(
            name=unique_workspace_name,
            domain="Medical Imaging",
            description="Automated Selenium test workspace for dataset verification."
        )

        # Open the newly created workspace
        workspace_page.select_workspace_card_by_name(unique_workspace_name)

        # Verify workspace detail view
        assert workspace_page.is_detail_view_loaded(), "Workspace detail view failed to load after creation"
        assert unique_workspace_name in workspace_page.get_current_workspace_name(), (
            f"Expected workspace detail title to contain '{unique_workspace_name}'"
        )
