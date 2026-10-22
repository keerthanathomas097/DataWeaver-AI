import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlmodel import Session, select

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.models.learning_curve import DatasetLearningCurveResult
from app.services import dataset_service
from app.schemas.learning_curve import (
    LearningCurveRequest,
    LearningCurveStatusResponse,
)
from app.services.learning_curve_service import (
    load_learning_curve_config,
    compute_params_hash,
    check_eligibility,
    run_learning_curve_background_job,
    sign_url,
    calculate_dataset_file_checksum,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["learning_curve"])


@router.post("/datasets/{dataset_id}/learning-curve")
def start_or_get_learning_curve(
    dataset_id: uuid.UUID,
    request_data: LearningCurveRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Starts learning curve calculation in the background or returns the cached completed result.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    config = load_learning_curve_config()

    # 1. Check eligibility
    is_eligible, reason, msg, details = check_eligibility(dataset_id, session, config)
    if not is_eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "reason": reason,
                "message": msg,
                "details": details,
            },
        )

    # 2. Derive checksum and params hash
    prof = session.exec(
        select(DatasetProfilingResult)
        .where(
            DatasetProfilingResult.dataset_id == dataset_id,
            DatasetProfilingResult.status == "completed",
        )
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    checksum = prof.file_list_checksum if prof else ""
    if not checksum and dataset.dataset_storage_path:
        checksum, _, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)

    params_hash = compute_params_hash(config)

    # 3. Check for existing result
    existing = session.exec(
        select(DatasetLearningCurveResult).where(
            DatasetLearningCurveResult.dataset_id == dataset_id,
            DatasetLearningCurveResult.file_list_checksum == checksum,
            DatasetLearningCurveResult.params_hash == params_hash,
        )
    ).first()

    if existing:
        if not request_data.force_recompute and existing.status == "completed":
            res = dict(existing.result or {})
            # Attach presigned URLs at read time
            if "mislabel_candidates" in res:
                for c in res["mislabel_candidates"]:
                    c["image_url"] = sign_url(c.get("image_path", ""))
            return res

        if existing.status == "running":
            return {
                "status": "running",
                "stage": existing.stage,
                "progress": existing.progress,
            }

    # 4. Initialize job in DB and trigger background execution
    if existing:
        existing.status = "running"
        existing.stage = "Initializing..."
        existing.progress = 0.0
        existing.result = None
        session.add(existing)
        session.commit()
    else:
        new_job = DatasetLearningCurveResult(
            dataset_id=dataset_id,
            file_list_checksum=checksum,
            params_hash=params_hash,
            status="running",
            stage="Initializing...",
            progress=0.0,
        )
        session.add(new_job)
        session.commit()

    background_tasks.add_task(
        run_learning_curve_background_job,
        dataset_id=dataset_id,
        checksum=checksum,
        params_hash=params_hash,
    )

    return {
        "status": "running",
        "stage": "Initializing...",
        "progress": 0.0,
    }


@router.get("/datasets/{dataset_id}/learning-curve/status")
def get_learning_curve_status(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the execution status, current stage, and progress of the learning curve job.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    config = load_learning_curve_config()
    params_hash = compute_params_hash(config)

    # Check eligibility first
    is_eligible, reason, msg, details = check_eligibility(dataset_id, session, config)
    if not is_eligible:
        return {
            "status": "ineligible",
            "reason": reason,
            "message": msg,
            "details": details,
            "stage": msg,
            "progress": 0.0,
        }

    # Query active/latest job
    latest = session.exec(
        select(DatasetLearningCurveResult)
        .where(
            DatasetLearningCurveResult.dataset_id == dataset_id,
            DatasetLearningCurveResult.params_hash == params_hash,
        )
        .order_by(DatasetLearningCurveResult.created_at.desc())
    ).first()

    if not latest:
        return {
            "status": "not_run",
            "stage": None,
            "progress": 0.0,
        }

    # If dataset has changed since completion, check checksum
    is_stale = False
    if latest.status == "completed" and dataset.dataset_storage_path:
        current_checksum, _, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
        if current_checksum != latest.file_list_checksum:
            is_stale = True

    return {
        "status": latest.status,
        "stage": latest.stage,
        "progress": latest.progress,
        "computed_at": latest.computed_at.isoformat() if latest.computed_at else None,
        "is_stale": is_stale,
    }


@router.get("/datasets/{dataset_id}/learning-curve")
def get_latest_learning_curve_result(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves the latest completed learning curve result, generating fresh presigned URLs
    at read time for mislabel candidates.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    config = load_learning_curve_config()
    params_hash = compute_params_hash(config)

    latest = session.exec(
        select(DatasetLearningCurveResult)
        .where(
            DatasetLearningCurveResult.dataset_id == dataset_id,
            DatasetLearningCurveResult.params_hash == params_hash,
            DatasetLearningCurveResult.status == "completed",
        )
        .order_by(DatasetLearningCurveResult.computed_at.desc())
    ).first()

    if not latest or not latest.result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No completed learning curve result found for this dataset.",
        )

    res = dict(latest.result)

    # Attach presigned URLs at read time
    if "mislabel_candidates" in res:
        for c in res["mislabel_candidates"]:
            c["image_url"] = sign_url(c.get("image_path", ""))

    # Check if dataset was modified since this was computed
    if dataset.dataset_storage_path:
        current_checksum, _, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
        res["is_stale"] = (current_checksum != latest.file_list_checksum)
    else:
        res["is_stale"] = False

    return res


@router.post("/datasets/{dataset_id}/learning-curve/cancel")
def cancel_learning_curve_job(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Cancels an actively running learning curve job.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    active_job = session.exec(
        select(DatasetLearningCurveResult).where(
            DatasetLearningCurveResult.dataset_id == dataset_id,
            DatasetLearningCurveResult.status == "running",
        )
    ).first()

    if active_job:
        active_job.status = "cancelled"
        active_job.stage = "Cancelled by user"
        session.add(active_job)
        session.commit()
        return {"message": "Learning curve job cancelled successfully.", "status": "cancelled"}

    return {"message": "No active learning curve job found to cancel.", "status": "not_running"}
