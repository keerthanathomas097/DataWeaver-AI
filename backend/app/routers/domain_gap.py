import uuid
import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.domain_gap import DomainSampleSet, DatasetDomainGapResult
from app.services import dataset_service, workspace_service
from app.services.profiling_service import calculate_dataset_file_checksum
from app.services.domain_gap_service import compute_domain_gap, attach_presigned_urls
from app.schemas.domain_gap_compare import (
    DomainGapCompareRequest,
    WorkspaceDomainGapComparisonResponse,
    IneligibleDatasetInfo,
)
from app.services.domain_gap_compare_service import (
    load_domain_gap_compare_config,
    evaluate_workspace_datasets_eligibility,
    build_or_retrieve_comparison_matrix,
    derive_comparison_metrics,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["domain_gap"])


class DomainGapRequest(BaseModel):
    sample_set_id: uuid.UUID
    force_recompute: bool = False


@router.post("/datasets/{dataset_id}/domain-gap")
def trigger_or_get_domain_gap(
    dataset_id: uuid.UUID,
    request_data: DomainGapRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Computes or retrieves cached domain gap coverage assessment for a dataset
    against an uploaded target domain sample set.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    if not dataset.dataset_storage_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dataset storage path is missing or dataset is not downloaded yet.",
        )

    sample_set = session.get(DomainSampleSet, request_data.sample_set_id)
    if not sample_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain sample set not found",
        )

    try:
        result = compute_domain_gap(
            session=session,
            dataset_id=dataset_id,
            sample_set_id=request_data.sample_set_id,
            force_recompute=request_data.force_recompute,
        )
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Error computing domain gap: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compute domain gap assessment: {str(e)}",
        )


@router.get("/datasets/{dataset_id}/domain-gap")
def get_cached_domain_gap(
    dataset_id: uuid.UUID,
    sample_set_id: uuid.UUID = Query(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns existing cached domain gap analysis for the dataset and sample set,
    or 404 if not yet computed.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    checksum, _, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
    if not checksum:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No files found for dataset",
        )

    cached_record = session.exec(
        select(DatasetDomainGapResult).where(
            DatasetDomainGapResult.dataset_id == dataset_id,
            DatasetDomainGapResult.sample_set_id == sample_set_id,
            DatasetDomainGapResult.file_list_checksum == checksum,
        )
    ).first()

    if not cached_record or not cached_record.result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain gap analysis not found for this dataset and sample set.",
        )

    return attach_presigned_urls(cached_record.result)


@router.post("/workspaces/{workspace_id}/domain-gap/compare", response_model=WorkspaceDomainGapComparisonResponse)
def trigger_or_get_workspace_domain_gap_compare(
    workspace_id: uuid.UUID,
    request_data: DomainGapCompareRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Computes or retrieves cached workspace-level domain gap comparison across all
    eligible datasets for the given sample set.
    """
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.user_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or unauthorized",
        )

    sample_set = session.get(DomainSampleSet, request_data.sample_set_id)
    if not sample_set or sample_set.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain sample set not found in this workspace",
        )

    config = load_domain_gap_compare_config()
    eligible, ineligible = evaluate_workspace_datasets_eligibility(
        session=session,
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        config=config,
    )

    matrix, signature, computed_at = build_or_retrieve_comparison_matrix(
        session=session,
        workspace_id=workspace_id,
        sample_set=sample_set,
        eligible_datasets=eligible,
        force_recompute=request_data.force_recompute,
    )

    derived = derive_comparison_metrics(
        matrix=matrix,
        sample_set=sample_set,
        requested_reference=request_data.reference_similarity,
        config=config,
    )

    return WorkspaceDomainGapComparisonResponse(
        workspace_id=workspace_id,
        sample_set_id=sample_set.sample_set_id,
        sample_count=len(sample_set.image_paths or []),
        computed_at=computed_at,
        signature=signature,
        reference_similarity=derived["reference_similarity"],
        reference_min=derived["reference_min"],
        reference_max=derived["reference_max"],
        default_reference=derived["default_reference"],
        near_miss_margin=derived["near_miss_margin"],
        near_miss_threshold=derived["near_miss_threshold"],
        best_match_dataset_id=derived["best_match_dataset_id"],
        best_match_dataset_name=derived["best_match_dataset_name"],
        summary_sentence=derived["summary_sentence"],
        ranked_datasets=derived["ranked_datasets"],
        ineligible_datasets=[IneligibleDatasetInfo(**item) for item in ineligible],
        combined_coverage=derived["combined_coverage"],
        caveats=derived["caveats"],
        sample_photos=derived["sample_photos"],
    )


@router.get("/workspaces/{workspace_id}/domain-gap/compare", response_model=WorkspaceDomainGapComparisonResponse)
def get_workspace_domain_gap_compare(
    workspace_id: uuid.UUID,
    sample_set_id: uuid.UUID = Query(..., description="Active sample set UUID"),
    reference_similarity: Optional[float] = Query(None, description="Optional custom reference cutoff"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns workspace domain gap comparison for the specified sample set.
    """
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.user_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or unauthorized",
        )

    sample_set = session.get(DomainSampleSet, sample_set_id)
    if not sample_set or sample_set.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain sample set not found in this workspace",
        )

    config = load_domain_gap_compare_config()
    eligible, ineligible = evaluate_workspace_datasets_eligibility(
        session=session,
        workspace_id=workspace_id,
        user_id=current_user.user_id,
        config=config,
    )

    matrix, signature, computed_at = build_or_retrieve_comparison_matrix(
        session=session,
        workspace_id=workspace_id,
        sample_set=sample_set,
        eligible_datasets=eligible,
        force_recompute=False,
    )

    derived = derive_comparison_metrics(
        matrix=matrix,
        sample_set=sample_set,
        requested_reference=reference_similarity,
        config=config,
    )

    return WorkspaceDomainGapComparisonResponse(
        workspace_id=workspace_id,
        sample_set_id=sample_set.sample_set_id,
        sample_count=len(sample_set.image_paths or []),
        computed_at=computed_at,
        signature=signature,
        reference_similarity=derived["reference_similarity"],
        reference_min=derived["reference_min"],
        reference_max=derived["reference_max"],
        default_reference=derived["default_reference"],
        near_miss_margin=derived["near_miss_margin"],
        near_miss_threshold=derived["near_miss_threshold"],
        best_match_dataset_id=derived["best_match_dataset_id"],
        best_match_dataset_name=derived["best_match_dataset_name"],
        summary_sentence=derived["summary_sentence"],
        ranked_datasets=derived["ranked_datasets"],
        ineligible_datasets=[IneligibleDatasetInfo(**item) for item in ineligible],
        combined_coverage=derived["combined_coverage"],
        caveats=derived["caveats"],
        sample_photos=derived["sample_photos"],
    )
