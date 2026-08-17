from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from app.database import get_session
from app.schemas.dataset import DatasetCreate, DatasetRead
from app.services import dataset_service
from app.routers.auth import get_current_user
from app.models.user import User
import uuid
from app.services import dataset_download_service
from app.services.duplicate_detection_service import run_duplicate_detection_pipeline
from datetime import timedelta
from app.services.storage_service import minio_client
from app.config import settings
from app.models.dataset import DatasetDuplicateGroup, DatasetDuplicateGroupImage

router = APIRouter(prefix="/datasets", tags=["datasets"])

@router.post("/", response_model=DatasetRead)
def add_dataset(
    data: DatasetCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.create_dataset(session, data, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=403, detail="Not authorized to add datasets to this workspace")
    return dataset

@router.get("/workspace/{workspace_id}", response_model=list[DatasetRead])
def list_workspace_datasets(
    workspace_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return dataset_service.get_datasets_for_workspace(session, workspace_id, current_user.user_id)

@router.get("/{dataset_id}", response_model=DatasetRead)
def get_dataset(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset

@router.post("/{dataset_id}/detect-duplicates")
def detect_duplicates(
    dataset_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not dataset.dataset_storage_path:
        if dataset.dataset_source_type.lower() != "kaggle":
            raise HTTPException(status_code=400, detail="Download not yet supported for this source type")

        dataset_ref = dataset.dataset_source_url.split("kaggle.com/datasets/")[-1].strip("/")

        try:
            result = dataset_download_service.download_and_store_dataset(
                str(dataset.dataset_id),
                dataset.dataset_source_type,
                dataset.dataset_source_url,
                dataset_ref,
            )
        except Exception as e:
            session.refresh(dataset)
            if dataset.dataset_status == "cancelled":
                return {
                    "message": "Job was cancelled by the user during download.",
                    "dataset_status": "cancelled",
                    "storage_path": None,
                    "image_count": 0
                }
            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

        dataset = dataset_service.update_dataset_after_download(
            session, dataset_id, result["storage_path"], result["image_count"]
        )

    # Transition status to detecting_duplicates immediately when pipeline background job starts
    dataset.dataset_status = "detecting_duplicates"
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    # Queue the background pipeline task
    background_tasks.add_task(run_duplicate_detection_pipeline, dataset.dataset_id)

    return {
        "message": "Duplicate detection pipeline started in background.",
        "dataset_status": dataset.dataset_status,
        "storage_path": dataset.dataset_storage_path,
        "image_count": dataset.dataset_image_count,
    }

@router.get("/{dataset_id}/duplicate-status")
def get_duplicate_status(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"dataset_status": dataset.dataset_status}

@router.get("/{dataset_id}/duplicate-groups")
def get_duplicate_groups(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    # Get all duplicate groups for this dataset
    groups = session.exec(
        select(DatasetDuplicateGroup).where(DatasetDuplicateGroup.dataset_id == dataset_id)
    ).all()
    
    result = []
    for g in groups:
        # Get images in this group
        images = session.exec(
            select(DatasetDuplicateGroupImage).where(DatasetDuplicateGroupImage.duplicate_group_id == g.duplicate_group_id)
        ).all()
        
        images_read = []
        for img in images:
            # Generate pre-signed URL
            presigned_url = ""
            try:
                presigned_url = minio_client.presigned_get_object(
                    settings.minio_bucket_name,
                    img.image_storage_path,
                    expires=timedelta(hours=2)
                )
            except Exception as e:
                print(f"Error generating presigned URL for {img.image_storage_path}: {e}")
                
            images_read.append({
                "duplicate_group_image_id": str(img.duplicate_group_image_id),
                "duplicate_group_id": str(img.duplicate_group_id),
                "image_storage_path": img.image_storage_path,
                "is_original_flag": img.is_original_flag,
                "image_url": presigned_url
            })
            
        result.append({
            "duplicate_group_id": str(g.duplicate_group_id),
            "dataset_id": str(g.dataset_id),
            "duplicate_group_detection_method": g.duplicate_group_detection_method,
            "duplicate_group_confidence_score": g.duplicate_group_confidence_score,
            "duplicate_group_domain_route": g.duplicate_group_domain_route,
            "duplicate_group_created_at": g.duplicate_group_created_at.isoformat() if g.duplicate_group_created_at else None,
            "images": images_read
        })
        
    return result

@router.post("/{dataset_id}/cancel-job")
def cancel_job(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    # Transition dataset status to 'cancelled'
    dataset.dataset_status = "cancelled"
    session.add(dataset)
    session.commit()
    session.refresh(dataset)
    
    # Proactively clean up duplicate groups and ChromaDB embeddings
    try:
        from app.services.duplicate_detection_service import check_cancellation
        check_cancellation(dataset_id)
    except Exception as e:
        print(f"Cleanup during endpoint cancel-job: {e}")
        
    return {"message": "Job cancellation request sent.", "dataset_status": dataset.dataset_status}