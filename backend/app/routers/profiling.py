import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.schemas.profiling import ProfilingRequest, ProfilingStatusResponse, ProfilingResultsResponse
from app.services import dataset_service
from app.services.profiling_service import (
    run_profiling_pipeline,
    calculate_dataset_file_checksum,
)

router = APIRouter(prefix="/datasets", tags=["profiling"])


@router.post("/{dataset_id}/profile")
def trigger_dataset_profiling(
    dataset_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    request_data: Optional[ProfilingRequest] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Triggers complete dataset profiling via FastAPI BackgroundTasks.
    If an existing completed profiling record matches the current dataset file checksum
    and force_recompute is not set, returns the cached result without recomputation.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized")

    if not dataset.dataset_storage_path:
        raise HTTPException(
            status_code=400,
            detail="Dataset has not been stored or downloaded to storage path yet."
        )

    req = request_data or ProfilingRequest()

    # Check for non-stale cached completed profile
    if not req.force_recompute:
        current_checksum, _, _ = calculate_dataset_file_checksum(dataset.dataset_storage_path)
        if current_checksum:
            cached = session.exec(
                select(DatasetProfilingResult)
                .where(
                    DatasetProfilingResult.dataset_id == dataset_id,
                    DatasetProfilingResult.file_list_checksum == current_checksum,
                    DatasetProfilingResult.status == "completed",
                )
                .order_by(DatasetProfilingResult.computed_at.desc())
            ).first()

            if cached:
                return {
                    "message": "Valid cached profiling result available.",
                    "status": "completed",
                    "is_cached": True,
                    "profiling_id": str(cached.profiling_id),
                    "file_list_checksum": cached.file_list_checksum,
                }

    # Queue background profiling task
    background_tasks.add_task(
        run_profiling_pipeline,
        dataset_id=dataset_id,
        user_description=req.user_description,
        eps=req.eps or 0.35,
        min_samples=req.min_samples or 2,
    )

    return {
        "message": "Dataset profiling pipeline started in background.",
        "status": "profiling",
        "is_cached": False,
        "dataset_id": str(dataset_id),
    }


@router.get("/{dataset_id}/profiling-status", response_model=ProfilingStatusResponse)
def get_profiling_status(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Returns the current execution state and stage of profiling for the dataset."""
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized")

    latest = session.exec(
        select(DatasetProfilingResult)
        .where(DatasetProfilingResult.dataset_id == dataset_id)
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if not latest:
        return ProfilingStatusResponse(
            dataset_id=dataset_id,
            status="not_profiled",
            stage=None,
            computed_at=None,
            file_list_checksum=None,
        )

    stage = None
    if isinstance(latest.profile_payload, dict):
        stage = latest.profile_payload.get("stage")

    return ProfilingStatusResponse(
        dataset_id=dataset_id,
        status=latest.status,
        stage=stage,
        computed_at=latest.computed_at,
        file_list_checksum=latest.file_list_checksum,
    )


@router.get("/{dataset_id}/profiling-results", response_model=ProfilingResultsResponse)
def get_profiling_results(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Fetches the latest completed profiling results payload for the specified dataset."""
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized")

    latest_completed = session.exec(
        select(DatasetProfilingResult)
        .where(
            DatasetProfilingResult.dataset_id == dataset_id,
            DatasetProfilingResult.status == "completed",
        )
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if not latest_completed:
        raise HTTPException(
            status_code=404,
            detail="No completed profiling results found for this dataset."
        )

    return ProfilingResultsResponse(
        profiling_id=latest_completed.profiling_id,
        dataset_id=latest_completed.dataset_id,
        status=latest_completed.status,
        computed_at=latest_completed.computed_at,
        file_list_checksum=latest_completed.file_list_checksum,
        profile_payload=latest_completed.profile_payload or {},
    )


@router.post("/{dataset_id}/cancel-profiling")
def cancel_dataset_profiling(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Cancels an in-progress profiling job."""
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found or unauthorized")

    active_job = session.exec(
        select(DatasetProfilingResult)
        .where(
            DatasetProfilingResult.dataset_id == dataset_id,
            DatasetProfilingResult.status == "profiling",
        )
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    if active_job:
        active_job.status = "cancelled"
        session.add(active_job)
        session.commit()
        return {"message": "Profiling job cancelled successfully.", "status": "cancelled"}

    return {"message": "No active profiling job found to cancel.", "status": "not_profiling"}
