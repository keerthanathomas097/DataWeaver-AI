from fastapi import APIRouter, Depends, Query
from app.services import discovery_service
from app.schemas.discovery import DiscoverySearchResponse
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.discovery_service import extract_metadata_from_description

router = APIRouter(prefix="/discovery", tags=["discovery"])

@router.get("/search", response_model=DiscoverySearchResponse)
async def search_datasets(
    query: str = Query(..., min_length=1),
    sources: list[str] | None = Query(default=None),
    limit: int = Query(default=10, le=50),
    current_user: User = Depends(get_current_user),
):
    results, succeeded = await discovery_service.search_all_sources(query, sources, limit)
    return DiscoverySearchResponse(
        query=query,
        results=results,
        sources_searched=succeeded,
    )


@router.post("/extract-metadata")
def extract_metadata(
    description: str,
    current_user: User = Depends(get_current_user),
):
    return extract_metadata_from_description(description)