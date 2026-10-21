import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.profiling import DatasetProfilingResult
from app.services import dataset_service
from app.services.purpose_fitting_service import load_purpose_fitting_rules
from app.services.ai_assessment_service import generate_assessment

router = APIRouter(prefix="/datasets", tags=["ai-assessment"])


class AiAssessmentRequest(BaseModel):
    purpose_key: str
    force_regenerate: bool = False


class AiAssessmentResponse(BaseModel):
    dataset_id: uuid.UUID
    purpose_key: str
    input_hash: str
    assessment: Dict[str, Any]
    generated_by: str  # "llm" | "fallback"
    model_name: Optional[str] = None
    generated_at: datetime
    is_cached: bool = False


@router.post(
    "/{dataset_id}/purpose-fit/ai-assessment",
    response_model=AiAssessmentResponse,
)
def get_or_generate_ai_assessment(
    dataset_id: uuid.UUID,
    request_data: AiAssessmentRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Generates or retrieves a cached AI assessment for a dataset under a selected purpose.
    Returns executive headline, summary, strengths, concerns with evidence chips,
    actionable recommendations, and confidence note.
    """
    # 1. Authenticate user & verify dataset ownership
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    # 2. Verify profiling is completed
    latest_profiling = session.exec(
        select(DatasetProfilingResult)
        .where(DatasetProfilingResult.dataset_id == dataset_id)
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if not latest_profiling:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profiling result exists for this dataset. Generate a dataset profile before running AI assessment.",
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

    # 3. Validate purpose key
    rules_cfg = load_purpose_fitting_rules()
    if request_data.purpose_key not in rules_cfg.get("purposes", {}):
        valid = ", ".join(rules_cfg.get("purposes", {}).keys())
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid purpose_key '{request_data.purpose_key}'. Available: {valid}",
        )

    # 4. Generate or fetch cached assessment
    try:
        result = generate_assessment(
            dataset_id=dataset_id,
            purpose_key=request_data.purpose_key,
            force=request_data.force_regenerate,
            session=session,
        )
        return AiAssessmentResponse(**result)
    except Exception as e:
        print(f"Error generating AI assessment for dataset {dataset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate AI assessment.",
        )
