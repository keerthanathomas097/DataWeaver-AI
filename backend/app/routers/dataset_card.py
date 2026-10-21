import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlmodel import Session

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.schemas.dataset_card import DatasetCardResponse
from app.services.dataset_card_service import (
    build_dataset_card_data,
    generate_dataset_card_pdf,
    sanitize_filename,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dataset_card"])


@router.get("/datasets/{dataset_id}/dataset-card", response_model=DatasetCardResponse)
def get_dataset_card(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the consolidated research-grade Dataset Card specification for a dataset.
    """
    try:
        card_data = build_dataset_card_data(
            session=session,
            dataset_id=dataset_id,
            user_id=current_user.user_id,
        )
        return card_data
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Error assembling dataset card for {dataset_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate dataset card: {str(e)}",
        )


@router.get("/datasets/{dataset_id}/dataset-card/pdf")
def download_dataset_card_pdf(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Generates and downloads a multi-page, publication-grade vector PDF of the Dataset Card.
    """
    try:
        card_data = build_dataset_card_data(
            session=session,
            dataset_id=dataset_id,
            user_id=current_user.user_id,
        )
        pdf_bytes = generate_dataset_card_pdf(card_data)

        raw_name = card_data.get("identity", {}).get("dataset_name", "dataset")
        clean_name = sanitize_filename(raw_name)
        date_str = datetime.utcnow().strftime("%Y%m%d")
        filename = f"{clean_name}_DatasetCard_{date_str}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "application/pdf",
            },
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Error compiling PDF dataset card for {dataset_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compile dataset card PDF: {str(e)}",
        )
