import io
import uuid
import hashlib
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlmodel import Session, select, delete
from PIL import Image

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.domain_gap import DomainSampleSet, DatasetDomainGapResult
from app.services import workspace_service
from app.services.storage_service import minio_client
from app.services.embedding_service import generate_dinov2_embeddings
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["domain_samples"])


def get_domain_gap_config() -> Dict[str, Any]:
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "domain_gap_config.json"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "max_samples": 30,
        "min_samples_recommended": 10,
        "max_file_mb": 10,
        "allowed_types": ["image/jpeg", "image/png", "image/webp"],
        "baseline_max_images": 500,
        "baseline_exclude_similarity_above": 0.97,
        "covered_percentile": 10,
        "verdict_bands": {"low_gap_min_pct": 80, "moderate_min_pct": 50},
        "plot_max_points": 1500,
        "umap": {"n_neighbors": 15, "min_dist": 0.1, "metric": "cosine", "random_state": 42},
        "pca_fallback_below_images": 30,
    }


@router.post("/workspaces/{workspace_id}/domain-samples")
async def upload_domain_samples(
    workspace_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Uploads 10 to 30 real-world setting photos for domain gap assessment.
    Validates images, downscales large dimensions, deduplicates within batch,
    computes DINOv2 embeddings, stores files in MinIO under domain-samples/ prefix,
    and returns presigned thumbnail URLs.
    """
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.user_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or unauthorized",
        )

    config = get_domain_gap_config()
    max_samples = config.get("max_samples", 30)
    max_bytes = config.get("max_file_mb", 10) * 1024 * 1024

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one image file must be provided.",
        )

    if len(files) > max_samples:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot upload more than {max_samples} domain sample images in a single set (provided {len(files)}).",
        )

    sample_set_id = uuid.uuid4()
    accepted_images: List[Image.Image] = []
    accepted_bytes: List[bytes] = []
    accepted_filenames: List[str] = []
    accepted_content_types: List[str] = []
    rejected: List[Dict[str, str]] = []
    seen_hashes = set()

    for file_obj in files:
        filename = file_obj.filename or "sample.jpg"
        try:
            content = await file_obj.read()
        except Exception as e:
            rejected.append({"filename": filename, "reason": f"Failed to read file: {e}"})
            continue

        if len(content) == 0:
            rejected.append({"filename": filename, "reason": "Empty file."})
            continue

        if len(content) > max_bytes:
            rejected.append({"filename": filename, "reason": f"File exceeds maximum size limit of {config.get('max_file_mb', 10)}MB."})
            continue

        # Hash check to reject duplicate images within batch
        content_hash = hashlib.sha256(content).hexdigest()
        if content_hash in seen_hashes:
            rejected.append({"filename": filename, "reason": "Duplicate image detected in upload batch."})
            continue
        seen_hashes.add(content_hash)

        # Verify image using Pillow
        try:
            pil_img = Image.open(io.BytesIO(content))
            pil_img.verify()
            # Re-open after verify
            pil_img = Image.open(io.BytesIO(content))
        except Exception:
            rejected.append({"filename": filename, "reason": "Corrupt or unreadable image format."})
            continue

        img_format = (pil_img.format or "").upper()
        if img_format not in ("JPEG", "JPG", "PNG", "WEBP"):
            rejected.append({"filename": filename, "reason": f"Unsupported image format: {img_format}."})
            continue

        # Downscale very large images before embedding and storing
        max_dimension = 1024
        if max(pil_img.width, pil_img.height) > max_dimension:
            pil_img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            save_format = "JPEG" if img_format in ("JPEG", "JPG") else img_format
            if pil_img.mode in ("RGBA", "P") and save_format == "JPEG":
                pil_img = pil_img.convert("RGB")
            pil_img.save(buf, format=save_format, quality=90)
            content = buf.getvalue()

        # Content type for MinIO storage
        content_type = "image/jpeg"
        if img_format == "PNG":
            content_type = "image/png"
        elif img_format == "WEBP":
            content_type = "image/webp"

        accepted_images.append(pil_img)
        accepted_bytes.append(content)
        accepted_filenames.append(filename)
        accepted_content_types.append(content_type)

    if not accepted_images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No valid images were accepted. Issues: {rejected}",
        )

    # Generate 768-dim DINOv2 embeddings using shared helper
    try:
        embeddings_np = generate_dinov2_embeddings(accepted_images, batch_size=16)
        embeddings_list = embeddings_np.tolist()
    except Exception as e:
        logger.error(f"Error computing DINOv2 embeddings for domain samples: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate embeddings: {str(e)}",
        )

    # Store files in MinIO under dedicated prefix: domain-samples/{workspace_id}/{sample_set_id}/
    stored_paths = []
    thumbnails = []
    for idx, (raw_data, orig_fname, ctype) in enumerate(zip(accepted_bytes, accepted_filenames, accepted_content_types)):
        safe_ext = Path(orig_fname).suffix or ".jpg"
        storage_key = f"domain-samples/{workspace_id}/{sample_set_id}/{idx:03d}_{uuid.uuid4().hex[:8]}{safe_ext}"
        try:
            minio_client.put_object(
                bucket_name=settings.minio_bucket_name,
                object_name=storage_key,
                data=io.BytesIO(raw_data),
                length=len(raw_data),
                content_type=ctype,
            )
            stored_paths.append(storage_key)

            # Generate presigned thumbnail URL (valid 2h)
            presigned_url = minio_client.presigned_get_object(
                settings.minio_bucket_name,
                storage_key,
                expires=timedelta(hours=2),
            )
            thumbnails.append(presigned_url)
        except Exception as e:
            logger.error(f"Error uploading domain sample image to MinIO {storage_key}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to store domain sample images in object storage.",
            )

    # Persist in tbl_domain_sample_sets
    sample_set = DomainSampleSet(
        sample_set_id=sample_set_id,
        workspace_id=workspace_id,
        created_by=current_user.user_id,
        created_at=datetime.utcnow(),
        image_paths=stored_paths,
        embeddings=embeddings_list,
        sample_count=len(stored_paths),
    )
    session.add(sample_set)
    session.commit()
    session.refresh(sample_set)

    return {
        "sample_set_id": str(sample_set_id),
        "accepted_count": len(stored_paths),
        "rejected": rejected,
        "thumbnails": thumbnails,
    }


@router.get("/workspaces/{workspace_id}/domain-samples")
def list_domain_sample_sets(
    workspace_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Lists saved domain sample sets in the given workspace."""
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.user_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or unauthorized",
        )

    records = session.exec(
        select(DomainSampleSet)
        .where(DomainSampleSet.workspace_id == workspace_id)
        .order_by(DomainSampleSet.created_at.desc())
    ).all()

    return [
        {
            "sample_set_id": str(s.sample_set_id),
            "sample_count": s.sample_count,
            "created_at": s.created_at.isoformat(),
        }
        for s in records
    ]


@router.delete("/domain-samples/{sample_set_id}")
def delete_domain_sample_set(
    sample_set_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Deletes a domain sample set and all associated MinIO images and analysis results."""
    sample_set = session.get(DomainSampleSet, sample_set_id)
    if not sample_set:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain sample set not found",
        )

    # Check user ownership via workspace
    workspace = workspace_service.get_workspace_by_id(session, sample_set.workspace_id, current_user.user_id)
    if not workspace and sample_set.created_by != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this sample set",
        )

    # Delete all MinIO objects under domain-samples/{workspace_id}/{sample_set_id}/
    prefix = f"domain-samples/{sample_set.workspace_id}/{sample_set_id}/"
    try:
        objects = list(minio_client.list_objects(settings.minio_bucket_name, prefix=prefix, recursive=True))
        for obj in objects:
            minio_client.remove_object(settings.minio_bucket_name, obj.object_name)
    except Exception as e:
        logger.warning(f"Error removing MinIO domain sample objects for {sample_set_id}: {e}")

    # Delete associated gap results
    session.exec(
        delete(DatasetDomainGapResult).where(DatasetDomainGapResult.sample_set_id == sample_set_id)
    )

    session.delete(sample_set)
    session.commit()

    return {
        "message": "Domain sample set and associated artifacts deleted successfully.",
        "sample_set_id": str(sample_set_id),
    }
