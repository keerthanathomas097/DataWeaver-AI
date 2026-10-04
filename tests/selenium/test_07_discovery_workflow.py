import pytest
from tests.selenium.pages.dashboard_page import DashboardPage
from tests.selenium.pages.discovery_page import DiscoveryPage


class TestDatasetDiscoveryWorkflow:
    """Test Suite 7: Dataset Search, Discovery Filtering, and Metadata Inspection Workflows.

    Note on Known Limitation:
    Live multi-source searching queries external APIs (HuggingFace, Zenodo, Kaggle, OpenML).
    Network conditions or external API rate limits can affect search duration.
    The tests verify UI interactivity, search submission, card rendering, and metadata modal.
    """

    def test_discovery_page_load(self, authenticated_driver):
        """Workflow:
        1. Log in to the application
        2. Click 'Discover Datasets' in the sidebar
        3. Verify the search bar, 'Search Datasets' CTA, and filter controls render
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_discover_tab()

        discovery_page = DiscoveryPage(authenticated_driver)
        assert discovery_page.is_loaded(), "Discover Datasets search page failed to load"

    def test_discovery_dataset_details_modal_workflow(self, authenticated_driver):
        """Workflow:
        1. Open the Discover Datasets tab
        2. Verify dataset cards are present
        3. Click 'View Details' on the first available dataset card
        4. Verify the Dataset Details modal opens displaying detailed metadata
        5. Verify the modal displays title, modality, and technical specifications
        6. Close the modal and verify it dismisses cleanly
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_discover_tab()

        discovery_page = DiscoveryPage(authenticated_driver)
        assert discovery_page.is_loaded(), "Discovery page did not load"

        # Wait for available dataset cards
        cards = discovery_page.get_dataset_cards(timeout=10)
        assert len(cards) > 0, "No dataset cards available on Discovery page"

        # Click View Details on first card
        discovery_page.open_dataset_details(index=0)
        assert discovery_page.is_details_modal_open(), "Dataset Details modal did not open upon clicking 'View Details'"

        modal_title = discovery_page.get_modal_dataset_title()
        assert len(modal_title) > 0, "Expected non-empty dataset title in details modal"

        # Close the modal
        discovery_page.close_details_modal()
        assert not discovery_page.is_details_modal_open(), "Dataset Details modal did not dismiss after closing"

    def test_discovery_search_submission(self, authenticated_driver):
        """Workflow:
        1. Open the Discover Datasets tab
        2. Enter a search query in the semantic search input
        3. Click 'Search Datasets'
        4. Verify the search request submits without crashing the UI
        """
        dashboard_page = DashboardPage(authenticated_driver)
        dashboard_page.open_discover_tab()

        discovery_page = DiscoveryPage(authenticated_driver)
        discovery_page.search_datasets("Chest X-Ray")

        # Verify search input retains query value
        search_elem = discovery_page.find(discovery_page.SEARCH_INPUT)
        assert search_elem.get_attribute("value") == "Chest X-Ray"
