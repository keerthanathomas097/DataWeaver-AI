import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlmodel import Session, select

from app.database import get_session
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.profiling import DatasetProfilingResult
from app.schemas.purpose_fitting import (
    PurposeFitRequest,
    PurposeFitResponse,
    PurposeDefinition,
    TextMatchRequest,
    TextMatchResponse,
    ClipAnalysisResponse,
    ComparisonCandidateResult,
    MatrixCriterionDef,
    WorkspacePurposeFitComparisonResponse,
)
from app.services import dataset_service, workspace_service
from app.services.purpose_fitting_service import (
    evaluate_purpose_fit,
    load_purpose_fitting_rules,
)
from app.services.clip_concept_service import (
    check_label_match,
    get_cached_clip_analysis,
    search_text_match,
)

PLAIN_METRIC_LABELS: Dict[str, str] = {
    "duplicate_ratio": "Repeated Images",
    "long_tail_imbalance": "Uneven Category Sizes",
    "zero_resolution_variance": "Same Image Size",
    "single_aspect_ratio": "Same Image Shape",
    "narrow_brightness_contrast": "Limited Lighting Variety",
    "high_blur_ratio": "Blurry Images",
    "low_visual_diversity": "Limited Visual Variety",
    "low_silhouette_score": "Indistinct Visual Groups",
    "high_visual_outlier_ratio": "Many Isolated Images",
    "mixed_domain": "Mixed Image Types",
    "visually_similar_ratio": "Visually Similar Images",
    "duplicate_concentration": "Duplicate Concentration",
    "suspiciously_uniform_class_balance": "Uniform Class Distribution",
    "single_source_domain": "Single Image Source",
    "label_match_mismatch_ratio": "Label Mismatch Ratio",
}


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


@router.get("/{dataset_id}/purpose-fit/clip-analysis", response_model=ClipAnalysisResponse)
def get_clip_analysis_status(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Returns existing cached semantic label match findings if already computed.
    If not yet computed, returns status 'not_computed'.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    cached_data = get_cached_clip_analysis(dataset_id, session)
    if cached_data:
        return cached_data

    return ClipAnalysisResponse(
        has_labels=False,
        status="not_computed",
        reason="Semantic label analysis has not been executed yet.",
        mismatch_ratio=None,
        threshold=0.20,
        total_evaluated=0,
        mismatched_count=0,
        worst_matches=[],
    )


@router.post("/{dataset_id}/purpose-fit/clip-analysis", response_model=ClipAnalysisResponse)
def trigger_clip_analysis(
    dataset_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Runs or retrieves semantic label match analysis for the dataset using CLIP.
    Caches finding and mirrors summary into profiling_results so rules engine can evaluate it.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    try:
        result = check_label_match(dataset_id, session)
        return result
    except Exception as e:
        print(f"Error executing CLIP label analysis for dataset {dataset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute CLIP label analysis: {str(e)}",
        )


@router.post("/{dataset_id}/purpose-fit/text-match", response_model=TextMatchResponse)
def run_text_purpose_match(
    dataset_id: uuid.UUID,
    request_data: TextMatchRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Ad-hoc free-text requirement match against dataset images using CLIP text-to-image similarity.
    Returns score distribution, best matches, and worst matches.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, current_user.user_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found or unauthorized",
        )

    try:
        result = search_text_match(
            dataset_id=dataset_id,
            query_text=request_data.query_text,
            session=session,
            top_k=10,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        print(f"Error evaluating text match for dataset {dataset_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate text match analysis.",
        )


@router.get("/workspace/{workspace_id}/purpose-fit-comparison", response_model=WorkspacePurposeFitComparisonResponse)
def get_workspace_purpose_fit_comparison(
    workspace_id: uuid.UUID,
    purpose_key: str = Query(..., description="Selected research purpose"),
    reference_dataset_id: Optional[uuid.UUID] = Query(None, description="Current reference dataset UUID"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluates and compares all datasets within the active workspace for a selected research purpose.
    Ranks eligible candidates deterministically using established purpose-fitting assessment tiers.
    Unprofiled datasets are flagged honestly without fabricating numerical scores.
    """
    workspace = workspace_service.get_workspace_by_id(session, workspace_id, current_user.user_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or unauthorized",
        )

    rules_cfg = load_purpose_fitting_rules()
    purposes = rules_cfg.get("purposes", {})
    if purpose_key not in purposes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid purpose_key '{purpose_key}'. Available: {list(purposes.keys())}",
        )

    purpose_meta = purposes[purpose_key]
    purpose_display_name = purpose_meta.get("display_name", purpose_key)

    # Retrieve all datasets belonging to this workspace
    datasets = dataset_service.get_datasets_for_workspace(session, workspace_id, current_user.user_id)

    reference_dataset_name: Optional[str] = None
    if reference_dataset_id:
        ref_ds = next((d for d in datasets if d.dataset_id == reference_dataset_id), None)
        if ref_ds:
            reference_dataset_name = ref_ds.dataset_name

    evaluated_candidates: List[ComparisonCandidateResult] = []
    unevaluated_candidates: List[ComparisonCandidateResult] = []

    for dataset in datasets:
        is_ref = bool(reference_dataset_id and dataset.dataset_id == reference_dataset_id)

        # Get latest profiling record
        latest_profiling = session.exec(
            select(DatasetProfilingResult)
            .where(DatasetProfilingResult.dataset_id == dataset.dataset_id)
            .order_by(DatasetProfilingResult.computed_at.desc())
        ).first()

        if (
            latest_profiling
            and latest_profiling.status == "completed"
            and latest_profiling.profile_payload
        ):
            try:
                fit_dict = evaluate_purpose_fit(
                    profile_payload=latest_profiling.profile_payload,
                    purpose_key=purpose_key,
                    dataset_id=dataset.dataset_id,
                    rules_cfg=rules_cfg,
                )
                fit_res = PurposeFitResponse(**fit_dict)

                crit = fit_res.summary.critical
                warn = fit_res.summary.warning
                fav = fit_res.summary.favorable
                neut = fit_res.summary.neutral

                if crit > 0:
                    overall_status = "Significant Concerns"
                    tier = 3
                elif warn > 0:
                    overall_status = "Review Recommended"
                    tier = 2
                else:
                    overall_status = "Good Fit"
                    tier = 1

                candidate = ComparisonCandidateResult(
                    dataset_id=dataset.dataset_id,
                    dataset_name=dataset.dataset_name,
                    dataset_image_count=dataset.dataset_image_count or 0,
                    dataset_status=dataset.dataset_status,
                    is_reference=is_ref,
                    eligibility_status="evaluated",
                    status_message=None,
                    fit_result=fit_res,
                    overall_status=overall_status,
                    tier=tier,
                    favorable_count=fav,
                    neutral_count=neut,
                    warning_count=warn,
                    critical_count=crit,
                    total_applicable_rules=len(fit_res.all_rules),
                )
                evaluated_candidates.append(candidate)
            except Exception as e:
                candidate = ComparisonCandidateResult(
                    dataset_id=dataset.dataset_id,
                    dataset_name=dataset.dataset_name,
                    dataset_image_count=dataset.dataset_image_count or 0,
                    dataset_status=dataset.dataset_status,
                    is_reference=is_ref,
                    eligibility_status="failed",
                    status_message=f"Evaluation error: {str(e)}",
                    tier=4,
                    overall_status="Unavailable",
                )
                unevaluated_candidates.append(candidate)
        elif latest_profiling and latest_profiling.status == "profiling":
            candidate = ComparisonCandidateResult(
                dataset_id=dataset.dataset_id,
                dataset_name=dataset.dataset_name,
                dataset_image_count=dataset.dataset_image_count or 0,
                dataset_status=dataset.dataset_status,
                is_reference=is_ref,
                eligibility_status="profiling",
                status_message="Profiling is actively running in background.",
                tier=4,
                overall_status="Unavailable",
            )
            unevaluated_candidates.append(candidate)
        elif latest_profiling and latest_profiling.status == "failed":
            candidate = ComparisonCandidateResult(
                dataset_id=dataset.dataset_id,
                dataset_name=dataset.dataset_name,
                dataset_image_count=dataset.dataset_image_count or 0,
                dataset_status=dataset.dataset_status,
                is_reference=is_ref,
                eligibility_status="failed",
                status_message="Dataset profiling failed. Re-run profiling to enable purpose assessment.",
                tier=4,
                overall_status="Unavailable",
            )
            unevaluated_candidates.append(candidate)
        else:
            candidate = ComparisonCandidateResult(
                dataset_id=dataset.dataset_id,
                dataset_name=dataset.dataset_name,
                dataset_image_count=dataset.dataset_image_count or 0,
                dataset_status=dataset.dataset_status,
                is_reference=is_ref,
                eligibility_status="unprofiled",
                status_message="Dataset profiling has not been executed yet.",
                tier=4,
                overall_status="Unavailable",
            )
            unevaluated_candidates.append(candidate)

    # Sort evaluated candidates:
    # 1. Tier (1: Good Fit, 2: Review Recommended, 3: Significant Concerns)
    # 2. Critical count ASC
    # 3. Warning count ASC
    # 4. Favorable count DESC (-favorable_count)
    # 5. Name ASC
    evaluated_candidates.sort(
        key=lambda c: (
            c.tier,
            c.critical_count,
            c.warning_count,
            -c.favorable_count,
            c.dataset_name.lower(),
        )
    )

    # Standard competition ranking with tie handling
    for idx, cand in enumerate(evaluated_candidates):
        if idx > 0:
            prev = evaluated_candidates[idx - 1]
            if (
                cand.tier == prev.tier
                and cand.critical_count == prev.critical_count
                and cand.warning_count == prev.warning_count
                and cand.favorable_count == prev.favorable_count
            ):
                cand.rank = prev.rank
                cand.is_tied = True
                prev.is_tied = True
            else:
                cand.rank = idx + 1
                cand.is_tied = False
        else:
            cand.rank = 1
            cand.is_tied = False

    # Extract matrix criteria definitions for this purpose
    metrics_cfg = rules_cfg.get("metrics", {})
    purpose_rules = [r for r in rules_cfg.get("rules", []) if r.get("purpose") == purpose_key]

    matrix_criteria: List[MatrixCriterionDef] = []
    seen_metrics = set()
    for r in purpose_rules:
        m_key = r.get("metric")
        if not m_key or m_key in seen_metrics:
            continue
        seen_metrics.add(m_key)
        m_def = metrics_cfg.get(m_key, {})
        matrix_criteria.append(
            MatrixCriterionDef(
                metric_key=m_key,
                metric_display_name=m_def.get("display_name", m_key),
                plain_label=PLAIN_METRIC_LABELS.get(m_key, m_def.get("display_name", m_key)),
                operator=m_def.get("operator"),
                threshold=m_def.get("threshold"),
                unit=m_def.get("unit"),
                applicable=m_def.get("applicable", True),
                rule_id=r.get("id"),
            )
        )

    all_ordered_candidates = evaluated_candidates + unevaluated_candidates

    return WorkspacePurposeFitComparisonResponse(
        workspace_id=workspace_id,
        workspace_name=workspace.workspace_name,
        purpose_key=purpose_key,
        purpose_display_name=purpose_display_name,
        reference_dataset_id=reference_dataset_id,
        reference_dataset_name=reference_dataset_name,
        total_datasets_in_workspace=len(datasets),
        eligible_candidate_count=len(evaluated_candidates),
        unprofiled_candidate_count=len(unevaluated_candidates),
        candidates=all_ordered_candidates,
        matrix_criteria=matrix_criteria,
        methodology_note=(
            "Ranking reflects the system's deterministic assessment tiers: Datasets with zero concerns "
            "(Good Fit) rank highest, followed by those with advisory warnings only (Review Recommended), "
            "and those with critical concerns (Significant Concerns). Within tiers, datasets are ordered "
            "by criteria alignment (fewer warnings, more favorable characteristics). Tied candidates share "
            "the same rank. In accordance with scientific integrity guidelines, no synthetic overall percentage "
            "or fabricated numerical score is applied."
        ),
    )


