import uuid
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.profiling import DatasetProfilingResult
from app.schemas.purpose_fitting import PurposeFitRequest, PurposeFitResponse, PurposeDefinition
from app.services import dataset_service
from app.services.purpose_fitting_service import (
    evaluate_purpose_fit,
    load_purpose_fitting_rules,
)

router = APIRouter(prefix="/datasets", tags=["purpose-fitting"])


@router.get("/purpose-fit/purposes", response_model=List[PurposeDefinition])
def get_purpose_definitions():
    """
    Returns the 8 configured research purpose definitions with display names and descriptions.
    """
    rules_cfg = load_purpose_fitting_rules()
    purposes = rules_cfg.get("purposes", {})
    return [
        PurposeDefinition(
            key=key,
            display_name=meta.get("display_name", key),
            short_description=meta.get("short_description", ""),
        )
        for key, meta in purposes.items()
    ]


@router.post("/{dataset_id}/purpose-fit", response_model=PurposeFitResponse)
def run_purpose_fit_analysis(
    dataset_id: uuid.UUID,
    request_data: PurposeFitRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluates how the dataset's measured profiling characteristics relate to the selected
    research purpose using the deterministic configuration-driven rules engine.
    Does not run ML inference or recompute profiling.
    """
    # 1. Authenticate user & verify dataset access
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    # 2. Retrieve latest profiling record
    latest_profiling = session.exec(
        select(DatasetProfilingResult)
        .where(DatasetProfilingResult.dataset_id == dataset_id)
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if not latest_profiling:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profiling result exists for this dataset. Generate a dataset profile before running Purpose Fitting.",
        )

    if latest_profiling.status == "profiling":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dataset profiling is still in progress. Please wait for profiling to complete.",
        )

    if latest_profiling.status != "completed" or not latest_profiling.profile_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset profiling is not completed (current status: {latest_profiling.status}).",
        )

    # 3. Evaluate deterministic rules
    try:
        result = evaluate_purpose_fit(
            profile_payload=latest_profiling.profile_payload,
            purpose_key=request_data.purpose_key,
            dataset_id=dataset_id,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        print(f"Error evaluating purpose fit for dataset {dataset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate purpose fit analysis.",
        )
