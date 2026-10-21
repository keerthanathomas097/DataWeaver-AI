import io
import re
import json
import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

from sqlmodel import Session, select

from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.workspace import Workspace
from app.models.profiling import DatasetProfilingResult
from app.models.domain_gap import DomainSampleSet, DatasetDomainGapResult
from app.models.ai_assessment import DatasetAiAssessment
from app.services import dataset_service
from app.services.profiling_service import calculate_dataset_file_checksum
from app.services.purpose_fitting_service import (
    load_purpose_fitting_rules,
    evaluate_purpose_fit,
)

logger = logging.getLogger(__name__)


def sanitize_filename(name: str) -> str:
    """Sanitizes dataset name for safe cross-platform file naming."""
    clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', name)
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean[:50] or "dataset"


def build_dataset_card_data(
    session: Session,
    dataset_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Dict[str, Any]:
    """
    Consolidates all verified metadata, composition metrics, duplicate detection records,
    purpose fitting assessments, domain check results, and technical provenance into a
    structured research-grade Dataset Card.
    """
    dataset = dataset_service.get_dataset_by_id(session, dataset_id, user_id)
    if not dataset:
        raise ValueError(f"Dataset {dataset_id} not found or user unauthorized.")

    workspace = session.get(Workspace, dataset.workspace_id)
    workspace_name = workspace.workspace_name if workspace else "Default Workspace"

    now = datetime.utcnow()

    # 1. Verify storage and live file checksum for staleness detection
    current_checksum = None
    image_paths = []
    total_file_bytes = None
    if dataset.dataset_storage_path:
        try:
            current_checksum, image_paths, total_file_bytes = calculate_dataset_file_checksum(
                dataset.dataset_storage_path
            )
        except Exception as e:
            logger.warning(f"Could not calculate current checksum for dataset {dataset_id}: {e}")

    # 2. Retrieve latest profiling record
    profiling_rec = session.exec(
        select(DatasetProfilingResult)
        .where(DatasetProfilingResult.dataset_id == dataset_id)
        .order_by(DatasetProfilingResult.computed_at.desc())
    ).first()

    profiling_payload = profiling_rec.profile_payload if profiling_rec and profiling_rec.profile_payload else {}
    profiling_status = profiling_rec.status if profiling_rec else "not_yet_profiled"
    is_profiling_stale = False

    if profiling_rec and current_checksum and profiling_rec.file_list_checksum:
        if profiling_rec.file_list_checksum != current_checksum:
            is_profiling_stale = True

    # 3. Section A: Dataset Identity
    meta_insights = profiling_payload.get("metadata_insights") or {}
    identity_section = {
        "dataset_id": str(dataset.dataset_id),
        "dataset_name": dataset.dataset_name,
        "workspace_id": str(dataset.workspace_id),
        "workspace_name": workspace_name,
        "dataset_source_type": dataset.dataset_source_type or "unknown",
        "dataset_source_url": dataset.dataset_source_url,
        "dataset_license": dataset.dataset_license or "Not specified",
        "dataset_image_count": dataset.dataset_image_count or len(image_paths),
        "dataset_storage_path": dataset.dataset_storage_path,
        "dataset_domain": dataset.dataset_domain or "general_visual",
        "dataset_status": dataset.dataset_status or "acquired",
        "dataset_created_at": dataset.dataset_created_at.isoformat() if dataset.dataset_created_at else now.isoformat(),
        "dataset_updated_at": dataset.dataset_updated_at.isoformat() if dataset.dataset_updated_at else now.isoformat(),
        "file_list_checksum": current_checksum or (profiling_rec.file_list_checksum if profiling_rec else None),
        "total_size_bytes": total_file_bytes or profiling_payload.get("basic_statistics", {}).get("file_sizes_bytes", {}).get("total_bytes"),
        "stated_purpose": meta_insights.get("stated_purpose"),
        "collection_method": meta_insights.get("collection_method"),
        "documented_limitations": meta_insights.get("known_limitations"),
        "card_generated_at": now.isoformat(),
    }

    # 4. Section B: Composition & Profiling
    basic_stats = profiling_payload.get("basic_statistics") or {}
    quality_stats = profiling_payload.get("quality") or {}
    diversity_stats = profiling_payload.get("diversity") or {}
    labels_stats = profiling_payload.get("labels") or {}

    composition_status = (
        "stale" if is_profiling_stale
        else (profiling_status if profiling_status == "completed" else "not_yet_profiled")
    )
    composition_msg = None
    if composition_status == "stale":
        composition_msg = "Dataset files have been modified since profiling. Values reflect the snapshot at profiling time."
    elif composition_status == "not_yet_profiled":
        composition_msg = "Dataset profiling has not been computed. Basic file and quality statistics are unavailable."

    composition_section = {
        "status": composition_status,
        "status_message": composition_msg,
        "computed_at": profiling_rec.computed_at.isoformat() if profiling_rec and profiling_rec.computed_at else None,
        "total_images": basic_stats.get("total_images", dataset.dataset_image_count or 0),
        "corrupted_images": basic_stats.get("corrupted_images", 0),
        "formats": basic_stats.get("formats", {}),
        "color_modes": basic_stats.get("color_modes", {}),
        "channels": basic_stats.get("channels", {}),
        "aspect_ratios": basic_stats.get("aspect_ratios", {}),
        "dimensions": basic_stats.get("dimensions", {}),
        "file_sizes_bytes": basic_stats.get("file_sizes_bytes", {}),
        "quality": quality_stats,
        "diversity": diversity_stats,
        "labels": labels_stats,
    }

    # 5. Section C: Duplicate Detection
    dup_groups = session.exec(
        select(DatasetDuplicateGroup).where(DatasetDuplicateGroup.dataset_id == dataset_id)
    ).all()

    dup_status = "not_yet_computed"
    dup_msg = None
    affected_count = 0
    exact_groups = 0
    near_groups = 0
    exact_duplicates_count = 0
    near_duplicates_count = 0
    sample_groups_data = []

    if dup_groups or dataset.dataset_status == "duplicates_detected":
        dup_status = "completed"
        group_ids = [g.duplicate_group_id for g in dup_groups]
        dup_images = session.exec(
            select(DatasetDuplicateGroupImage).where(
                DatasetDuplicateGroupImage.duplicate_group_id.in_(group_ids)
            )
        ).all() if group_ids else []

        affected_count = len(dup_images)
        exact_groups = sum(1 for g in dup_groups if g.duplicate_group_detection_method == "exact_hash")
        near_groups = sum(1 for g in dup_groups if g.duplicate_group_detection_method != "exact_hash")

        # Count exact vs near affected images
        exact_group_ids = {g.duplicate_group_id for g in dup_groups if g.duplicate_group_detection_method == "exact_hash"}
        exact_duplicates_count = sum(1 for img in dup_images if img.duplicate_group_id in exact_group_ids)
        near_duplicates_count = affected_count - exact_duplicates_count

        # Pick up to 3 sample duplicate groups
        for g in dup_groups[:3]:
            g_imgs = [img.image_storage_path for img in dup_images if img.duplicate_group_id == g.duplicate_group_id]
            sample_groups_data.append({
                "group_id": str(g.duplicate_group_id),
                "method": g.duplicate_group_detection_method,
                "confidence_score": g.duplicate_group_confidence_score,
                "domain_route": g.duplicate_group_domain_route or "general",
                "image_count": len(g_imgs),
                "images": g_imgs[:4],
            })
    else:
        dup_msg = "Duplicate detection has not been executed for this dataset."

    total_imgs = dataset.dataset_image_count or max(affected_count, 1)
    dup_ratio = round(affected_count / float(total_imgs), 4) if total_imgs > 0 else 0.0

    duplicate_section = {
        "status": dup_status,
        "status_message": dup_msg,
        "total_examined": total_imgs,
        "duplicate_groups_count": len(dup_groups),
        "affected_images_count": affected_count,
        "duplicate_ratio": dup_ratio,
        "exact_duplicates_count": exact_duplicates_count,
        "near_duplicates_count": near_duplicates_count,
        "exact_duplicate_groups": exact_groups,
        "near_duplicate_groups": near_groups,
        "methods_used": [
            {
                "stage": "Bitwise Duplicate Detection",
                "method": "SHA-256 Hash",
                "criterion": "Identical file hash (100% byte-for-byte exact copy)",
            },
            {
                "stage": "Domain Classification",
                "method": "RGB Channel Variance & Grayscale Check",
                "criterion": "Routes images to photographic or non-photographic pipeline",
            },
            {
                "stage": "Perceptual Near-Duplicate Filter",
                "method": "ImageHash pHash (64-bit DCT)",
                "criterion": "Hamming distance <= 6 (photographic) or <= 2 (non-photographic)",
            },
            {
                "stage": "Non-Photographic Consensus",
                "method": "Multi-Hash 2-of-3 Consensus",
                "criterion": "Agreement between pHash (<= 2), dHash (<= 4), and aHash (<= 4)",
            },
            {
                "stage": "Photographic Visual Embedding Fusion",
                "method": "Logistic Regression Fusion Classifier v1.0",
                "criterion": "Combined DINOv2 / CLIP cosine distance + normalized Hamming distance",
            },
        ],
        "thresholds_applied": {
            "phash_photographic_max_hamming": 6,
            "phash_non_photographic_max_hamming": 2,
            "multi_hash_consensus_required": "2 of 3 hashes",
            "dhash_threshold": 4,
            "ahash_threshold": 4,
        },
        "sample_groups": sample_groups_data,
    }

    # 6. Section D: Purpose Fitting Evaluation
    purposes_evaluated = []
    pf_status = "completed" if (profiling_status == "completed" and profiling_payload) else "not_yet_profiled"
    pf_msg = None

    if pf_status == "completed":
        try:
            rules_cfg = load_purpose_fitting_rules()
            purposes_dict = rules_cfg.get("purposes", {})

            for p_key, p_meta in purposes_dict.items():
                fit_dict = evaluate_purpose_fit(
                    profile_payload=profiling_payload,
                    purpose_key=p_key,
                    dataset_id=dataset_id,
                    rules_cfg=rules_cfg,
                )
                summ = fit_dict.get("summary", {})
                crit = summ.get("critical", 0)
                warn = summ.get("warning", 0)
                fav = summ.get("favorable", 0)
                neut = summ.get("neutral", 0)

                if crit > 0:
                    overall = "Significant Concerns"
                    tier = 3
                elif warn > 0:
                    overall = "Review Recommended"
                    tier = 2
                else:
                    overall = "Good Fit"
                    tier = 1

                top_findings = []
                for rule_res in fit_dict.get("flagged_findings", [])[:3]:
                    top_findings.append({
                        "metric_display_name": rule_res.get("metric_display_name"),
                        "verdict": rule_res.get("verdict"),
                        "message": rule_res.get("message"),
                        "explanation": rule_res.get("explanation"),
                    })

                purposes_evaluated.append({
                    "purpose_key": p_key,
                    "purpose_display_name": p_meta.get("display_name", p_key),
                    "overall_status": overall,
                    "tier": tier,
                    "favorable_count": fav,
                    "neutral_count": neut,
                    "warning_count": warn,
                    "critical_count": crit,
                    "top_findings": top_findings,
                })
        except Exception as e:
            logger.warning(f"Error evaluating purpose fitting for dataset card: {e}")
            pf_status = "failed"
            pf_msg = f"Purpose fitting rules evaluation failed: {str(e)}"
    else:
        pf_msg = "Purpose fitting requires completed dataset profiling."

    purpose_section = {
        "status": pf_status,
        "status_message": pf_msg,
        "purposes_evaluated": purposes_evaluated,
        "rules_config_version": "1.0",
        "clip_analysis_status": "available" if session.exec(select(DatasetDuplicateGroup).where(DatasetDuplicateGroup.dataset_id == dataset_id)).first() else "not_computed",
    }

    # 7. Section E: Domain Check & Target-Domain Coverage
    dg_rec = session.exec(
        select(DatasetDomainGapResult)
        .where(DatasetDomainGapResult.dataset_id == dataset_id)
        .order_by(DatasetDomainGapResult.computed_at.desc())
    ).first()

    domain_section = {
        "status": "not_assessed",
        "status_message": "No deployment sample photos have been evaluated against this dataset.",
        "computed_at": None,
        "sample_set_id": None,
        "sample_count": 0,
        "coverage_pct": None,
        "verdict": None,
        "counts": {},
        "baseline_threshold": None,
        "baseline_median": None,
        "centroid_similarity": None,
        "distribution_distance": None,
        "caveats": [],
        "embedding_model": "facebook/dinov2-base (768-dim, L2-normalized)",
    }

    if dg_rec and getattr(dg_rec, "result", None):
        is_dg_stale = False
        if current_checksum and dg_rec.file_list_checksum != current_checksum:
            is_dg_stale = True

        r = dg_rec.result
        sample_set = session.get(DomainSampleSet, dg_rec.sample_set_id) if dg_rec.sample_set_id else None

        domain_section.update({
            "status": "stale" if is_dg_stale else "completed",
            "status_message": "Dataset files changed since this domain check was computed." if is_dg_stale else None,
            "computed_at": dg_rec.computed_at.isoformat() if dg_rec.computed_at else None,
            "sample_set_id": str(dg_rec.sample_set_id) if dg_rec.sample_set_id else None,
            "sample_count": sample_set.sample_count if sample_set else len(r.get("samples", [])),
            "coverage_pct": r.get("coverage_pct"),
            "verdict": r.get("verdict"),
            "counts": r.get("counts", {}),
            "baseline_threshold": r.get("baseline", {}).get("threshold"),
            "baseline_median": r.get("baseline", {}).get("median"),
            "centroid_similarity": r.get("centroid_similarity"),
            "distribution_distance": r.get("distribution_distance"),
            "caveats": r.get("caveats", []),
            "embedding_model": "facebook/dinov2-base (768-dim, L2-normalized)",
        })

    # 8. Section F: Integrated Findings & Limitations
    strengths = []
    risks = []

    # Composition findings
    if composition_status == "completed":
        total_valid = basic_stats.get("total_images", 0)
        corrupted = basic_stats.get("corrupted_images", 0)
        if corrupted == 0 and total_valid > 0:
            strengths.append(f"High file integrity: All {total_valid} images are valid and uncorrupted.")
        elif corrupted > 0:
            risks.append(f"Corrupted files detected: {corrupted} images could not be parsed.")

        quality_counts = quality_stats.get("counts", {})
        blurred = quality_counts.get("blurred_images", 0)
        if total_valid > 0 and blurred == 0:
            strengths.append("High image clarity: No blurred images detected under standard Laplacian variance.")
        elif total_valid > 0 and (blurred / total_valid) > 0.15:
            risks.append(f"Blur rate concern: {blurred} images ({round(blurred / total_valid * 100, 1)}%) flagged with low Laplacian variance.")

        # Class distribution
        if labels_stats.get("status") == "available":
            n_cls = labels_stats.get("num_classes", 0)
            balance = labels_stats.get("metrics", {}).get("balance_indicator")
            if balance == "well_balanced":
                strengths.append(f"Balanced category structure: {n_cls} classes with well-distributed sample counts.")
            elif balance == "heavily_imbalanced":
                max_min = labels_stats.get("metrics", {}).get("max_to_min_ratio")
                risks.append(f"Severe class imbalance: {n_cls} classes with a max-to-min class count ratio of {max_min}x.")
        else:
            risks.append("Unlabeled structure: No directory-based class taxonomy detected; suitable primarily for self-supervised training or retrieval.")

    # Duplicate findings
    if dup_status == "completed":
        if affected_count == 0:
            strengths.append("Zero redundancy: No exact duplicates or perceptual near-duplicates detected.")
        else:
            if dup_ratio > 0.05:
                risks.append(f"Dataset redundancy: {affected_count} images ({round(dup_ratio * 100, 1)}%) involved in duplicate or near-duplicate groups.")
            else:
                strengths.append(f"Low redundancy: Only {affected_count} images ({round(dup_ratio * 100, 1)}%) identified as near-duplicate variants.")

    # Domain coverage findings
    if domain_section["status"] == "completed":
        cov = domain_section["coverage_pct"] or 0
        if cov >= 80:
            strengths.append(f"Strong deployment coverage: {cov}% of target domain photos covered within baseline proximity.")
        elif cov < 50:
            risks.append(f"Domain gap warning: Only {cov}% of target deployment photos covered by nearest-neighbor visual features.")

    # Completeness scoring
    score = 0
    breakdown = {}
    if composition_status == "completed":
        score += 30
        breakdown["profiling"] = "Completed (30%)"
    elif composition_status == "stale":
        score += 15
        breakdown["profiling"] = "Stale (15%)"
    else:
        breakdown["profiling"] = "Not Run (0%)"

    if dup_status == "completed":
        score += 25
        breakdown["duplicate_detection"] = "Completed (25%)"
    else:
        breakdown["duplicate_detection"] = "Not Run (0%)"

    if pf_status == "completed":
        score += 25
        breakdown["purpose_fitting"] = "Completed (25%)"
    else:
        breakdown["purpose_fitting"] = "Not Run (0%)"

    if domain_section["status"] == "completed":
        score += 20
        breakdown["domain_check"] = "Completed (20%)"
    elif domain_section["status"] == "stale":
        score += 10
        breakdown["domain_check"] = "Stale (10%)"
    else:
        breakdown["domain_check"] = "Not Run (0%)"

    if score >= 90:
        level = "Comprehensive"
    elif score >= 65:
        level = "Substantial"
    elif score >= 40:
        level = "Preliminary"
    else:
        level = "Minimal"

    suitability_summary = (
        f"This dataset card reflects an overall assessment completeness of {score}% ({level}). "
        f"Identified {len(strengths)} key technical strengths and {len(risks)} operational concerns or limitations. "
        "Adoption decisions should consider both rule-based characteristics and domain-gap coverage against intended deployment conditions."
    )

    integrated_findings_section = {
        "strengths": strengths or ["Basic dataset properties recorded; further profiling recommended."],
        "risks_and_concerns": risks or ["No critical red flags detected in completed analyses."],
        "suitability_summary": suitability_summary,
        "completeness_score": score,
        "completeness_level": level,
        "completeness_breakdown": breakdown,
    }

    # 9. Section G: Provenance & Reproducibility Record
    provenance_section = {
        "source_provenance": {
            "source_type": dataset.dataset_source_type or "manual",
            "source_url": dataset.dataset_source_url or "Not recorded",
            "storage_path": dataset.dataset_storage_path or "Not configured",
            "file_list_checksum": current_checksum or "Unavailable",
            "import_timestamp": dataset.dataset_created_at.isoformat() if dataset.dataset_created_at else None,
        },
        "methodologies": [
            {
                "module": "Dataset Profiling Engine",
                "version": "1.0",
                "description": "Calculates PIL image properties, SciPy Laplacian variance for sharpness, NumPy luminance for exposure, and DBSCAN clustering over DINOv2 embeddings.",
            },
            {
                "module": "Duplicate Detection Pipeline",
                "version": "1.0",
                "description": "Hybrid pipeline combining SHA-256 exact matching, domain-routed perceptual hashing (pHash), 2-of-3 multi-hash consensus, and a Logistic Regression fusion classifier.",
            },
            {
                "module": "Purpose Fitting Evaluation",
                "version": "1.0",
                "description": "Deterministic rule-based criterion matrix checking 8 computer vision research purposes against verified profiling metrics without LLM scoring.",
            },
            {
                "module": "Domain Gap Assessment",
                "version": "1.0",
                "description": "Measures visual feature coverage between real-world sample photos and dataset profiling embeddings using DINOv2 cosine similarity, 10th-percentile baseline cutoffs, and MMD distribution distance.",
            },
        ],
        "models_and_tools": [
            {"name": "DINOv2", "variant": "facebook/dinov2-base", "dimension": 768, "metric": "Cosine Similarity"},
            {"name": "CLIP", "variant": "openai/clip-vit-base-patch32", "dimension": 512, "metric": "Cosine Similarity"},
            {"name": "ImageHash", "algorithms": "pHash, dHash, aHash", "precision": "64-bit DCT"},
            {"name": "ReportLab", "version": "5.0.1", "role": "Vector PDF Report Compilation Engine"},
        ],
        "reproducibility_notes": [
            "All embeddings are L2-normalized float32 vectors generated with torch.no_grad().",
            "Random seed 42 is used for all empirical baseline sampling and UMAP projections.",
            "Nearest-neighbor similarity thresholds reflect high-dimensional feature proximity and are heuristic baseline estimates.",
        ],
    }

    return {
        "identity": identity_section,
        "composition": composition_section,
        "duplicate_detection": duplicate_section,
        "purpose_fitting": purpose_section,
        "domain_check": domain_section,
        "integrated_findings": integrated_findings_section,
        "provenance": provenance_section,
    }


def generate_dataset_card_pdf(card_data: Dict[str, Any]) -> bytes:
    """
    Compiles a research-grade, multi-page vector PDF publication report from
    the structured Dataset Card data using ReportLab.
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        KeepTogether,
        HRFlowable,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.graphics.shapes import Drawing, Rect, String, Line

    identity = card_data.get("identity", {})
    composition = card_data.get("composition", {})
    duplicates = card_data.get("duplicate_detection", {})
    purpose_fit = card_data.get("purpose_fitting", {})
    domain_check = card_data.get("domain_check", {})
    findings = card_data.get("integrated_findings", {})
    provenance = card_data.get("provenance", {})

    dataset_name = identity.get("dataset_name", "Dataset")
    gen_date = identity.get("card_generated_at", "")[:10]

    # Custom NumberedCanvas for professional running headers and footers
    class NumberedCanvas(canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self.draw_decorations(num_pages)
                super().showPage()
            super().save()

        def draw_decorations(self, page_count):
            self.saveState()
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748b"))

            # Running Header on page 2+
            if self._pageNumber > 1:
                self.drawString(36, 756, f"DataWeaver AI — Dataset Card: {dataset_name[:45]}")
                self.drawRightString(576, 756, f"Generated: {gen_date}")
                self.setStrokeColor(colors.HexColor("#cbd5e1"))
                self.setLineWidth(0.5)
                self.line(36, 750, 576, 750)

            # Running Footer on all pages
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 40, 576, 40)
            self.drawString(36, 28, "RESEARCH-GRADE DATASET SPECIFICATION  •  DATAWEAVER AI")
            self.drawRightString(576, 28, f"Page {self._pageNumber} of {page_count}")
            self.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=48,
        bottomMargin=52,
    )

    base_styles = getSampleStyleSheet()
    primary_color = colors.HexColor("#0f172a")
    text_color = colors.HexColor("#334155")
    accent_color = colors.HexColor("#2563eb")

    title_style = ParagraphStyle(
        "DocTitle",
        parent=base_styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=primary_color,
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=12,
    )
    h2_style = ParagraphStyle(
        "SectionH2",
        parent=base_styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=primary_color,
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyTextClean",
        parent=base_styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11.5,
        textColor=text_color,
    )
    bold_label = ParagraphStyle(
        "BoldLabel",
        parent=body_style,
        fontName="Helvetica-Bold",
        textColor=primary_color,
    )
    badge_good = ParagraphStyle(
        "BadgeGood",
        parent=body_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#047857"),
    )
    badge_warn = ParagraphStyle(
        "BadgeWarn",
        parent=body_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#b45309"),
    )
    badge_danger = ParagraphStyle(
        "BadgeDanger",
        parent=body_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#b91c1c"),
    )

    story = []

    # Title & Metadata Banner
    story.append(Paragraph("DATAWEAVER AI — RESEARCH-GRADE DATASET CARD", subtitle_style))
    story.append(Paragraph(dataset_name, title_style))
    story.append(Paragraph(
        f"<b>Dataset Identifier:</b> {identity.get('dataset_id')} &nbsp;|&nbsp; "
        f"<b>Workspace:</b> {identity.get('workspace_name')} &nbsp;|&nbsp; "
        f"<b>Source:</b> {identity.get('dataset_source_type')} &nbsp;|&nbsp; "
        f"<b>Generated:</b> {gen_date}",
        body_style,
    ))
    story.append(Spacer(1, 10))

    # Executive Summary 4-Column Card Table
    img_cnt = identity.get("dataset_image_count", 0)
    size_bytes = identity.get("total_size_bytes")
    size_mb = f"{round(size_bytes / (1024*1024), 1)} MB" if size_bytes else "—"
    dup_pct = f"{round(duplicates.get('duplicate_ratio', 0) * 100, 1)}%"
    comp_score = f"{findings.get('completeness_score', 0)}%"
    comp_lvl = findings.get("completeness_level", "Preliminary")

    summary_boxes = [
        [
            Paragraph("<b>Total Images</b>", body_style),
            Paragraph("<b>Dataset Size</b>", body_style),
            Paragraph("<b>Duplicate Ratio</b>", body_style),
            Paragraph("<b>Card Completeness</b>", body_style),
        ],
        [
            Paragraph(f"<font size=14><b>{img_cnt:,}</b></font>", body_style),
            Paragraph(f"<font size=14><b>{size_mb}</b></font>", body_style),
            Paragraph(f"<font size=14><b>{dup_pct}</b></font>", body_style),
            Paragraph(f"<font size=14><b>{comp_score}</b></font> ({comp_lvl})", body_style),
        ],
    ]
    summary_table = Table(summary_boxes, colWidths=[135, 135, 135, 135])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 10))

    # Stated Purpose & Limitations Note (if available)
    if identity.get("stated_purpose") or identity.get("documented_limitations"):
        doc_rows = []
        if identity.get("stated_purpose"):
            doc_rows.append([Paragraph("<b>Documented Purpose:</b>", bold_label), Paragraph(identity["stated_purpose"], body_style)])
        if identity.get("documented_limitations"):
            doc_rows.append([Paragraph("<b>Known Limitations:</b>", bold_label), Paragraph(identity["documented_limitations"], body_style)])
        doc_table = Table(doc_rows, colWidths=[120, 420])
        doc_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
            ("PADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(doc_table)
        story.append(Spacer(1, 8))

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=6))

    # SECTION A: Identity & Overview Table
    story.append(Paragraph("Section A: Dataset Identity & Provenance", h2_style))
    id_rows = [
        [Paragraph("<b>Dataset Name:</b>", bold_label), Paragraph(identity.get("dataset_name", ""), body_style),
         Paragraph("<b>Source URL:</b>", bold_label), Paragraph(identity.get("dataset_source_url") or "Not provided", body_style)],
        [Paragraph("<b>Storage Path:</b>", bold_label), Paragraph(identity.get("dataset_storage_path") or "—", body_style),
         Paragraph("<b>License:</b>", bold_label), Paragraph(identity.get("dataset_license", "Not specified"), body_style)],
        [Paragraph("<b>File Checksum:</b>", bold_label), Paragraph(f"<font face=Courier size=7>{identity.get('file_list_checksum') or 'Unavailable'}</font>", body_style),
         Paragraph("<b>Domain Type:</b>", bold_label), Paragraph(identity.get("dataset_domain", "general"), body_style)],
    ]
    id_table = Table(id_rows, colWidths=[85, 185, 85, 185])
    id_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(id_table)
    story.append(Spacer(1, 8))

    # SECTION B: Dataset Composition & Profiling
    story.append(Paragraph("Section B: Dataset Composition & Profiling", h2_style))
    if composition.get("status") == "not_yet_profiled":
        story.append(Paragraph("<font color='#64748b'><i>Dataset profiling has not been executed yet. Run profiling to inspect image dimensions, color modes, and class distribution.</i></font>", body_style))
    else:
        dims = composition.get("dimensions", {})
        w_stats = dims.get("width", {})
        h_stats = dims.get("height", {})
        fmts = composition.get("formats", {})
        labels = composition.get("labels", {})
        qual = composition.get("quality", {})
        qual_counts = qual.get("counts", {})

        comp_rows = [
            [
                Paragraph("<b>Image Dimensions:</b>", bold_label),
                Paragraph(f"Width: {w_stats.get('min', '—')}–{w_stats.get('max', '—')}px (mean {w_stats.get('mean', '—')}px) | Height: {h_stats.get('min', '—')}–{h_stats.get('max', '—')}px", body_style),
            ],
            [
                Paragraph("<b>File Formats:</b>", bold_label),
                Paragraph(", ".join([f"{k.upper()}: {v}" for k, v in fmts.items()]) or "Standard images", body_style),
            ],
            [
                Paragraph("<b>Quality Screen:</b>", bold_label),
                Paragraph(
                    f"Sharp: {qual_counts.get('normal_images', 0)} | "
                    f"Blurred: {qual_counts.get('blurred_images', 0)} | "
                    f"Underexposed: {qual_counts.get('underexposed_images', 0)} | "
                    f"Overexposed: {qual_counts.get('overexposed_images', 0)}",
                    body_style,
                ),
            ],
        ]

        if labels.get("status") == "available":
            n_c = labels.get("num_classes", 0)
            bal = labels.get("metrics", {}).get("balance_indicator", "balanced")
            top_classes = list(labels.get("class_counts", {}).items())[:6]
            cls_str = ", ".join([f"{k}: {v}" for k, v in top_classes])
            comp_rows.append([
                Paragraph("<b>Class Distribution:</b>", bold_label),
                Paragraph(f"{n_c} classes ({bal.replace('_', ' ')}). Top classes: {cls_str}", body_style),
            ])
        else:
            comp_rows.append([
                Paragraph("<b>Class Distribution:</b>", bold_label),
                Paragraph("<i>No folder-based class taxonomy detected (flat image directory structure).</i>", body_style),
            ])

        comp_table = Table(comp_rows, colWidths=[105, 435])
        comp_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(comp_table)
    story.append(Spacer(1, 8))

    # SECTION C: Duplicate Detection & Redundancy
    story.append(Paragraph("Section C: Duplicate Detection & Dataset Redundancy", h2_style))
    if duplicates.get("status") == "not_yet_computed":
        story.append(Paragraph("<font color='#64748b'><i>Duplicate detection has not been executed for this dataset yet.</i></font>", body_style))
    else:
        dup_rows = [
            [
                Paragraph("<b>Examined Images:</b>", bold_label),
                Paragraph(str(duplicates.get("total_examined", 0)), body_style),
                Paragraph("<b>Duplicate Groups:</b>", bold_label),
                Paragraph(str(duplicates.get("duplicate_groups_count", 0)), body_style),
            ],
            [
                Paragraph("<b>Exact Duplicates:</b>", bold_label),
                Paragraph(f"{duplicates.get('exact_duplicates_count', 0)} images ({duplicates.get('exact_duplicate_groups', 0)} groups)", body_style),
                Paragraph("<b>Near-Duplicates:</b>", bold_label),
                Paragraph(f"{duplicates.get('near_duplicates_count', 0)} images ({duplicates.get('near_duplicate_groups', 0)} groups)", body_style),
            ],
            [
                Paragraph("<b>Redundancy Ratio:</b>", bold_label),
                Paragraph(f"{round(duplicates.get('duplicate_ratio', 0) * 100, 2)}% of dataset affected", bold_label if duplicates.get('duplicate_ratio', 0) > 0.05 else body_style),
                Paragraph("<b>Detection Stack:</b>", bold_label),
                Paragraph("SHA-256 + pHash (DCT) + Multi-hash + Fusion Classifier", body_style),
            ],
        ]
        dup_table = Table(dup_rows, colWidths=[105, 165, 105, 165])
        dup_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(dup_table)
    story.append(Spacer(1, 8))

    # SECTION D: Purpose Fitting Evaluation
    story.append(Paragraph("Section D: Purpose Fitting Assessment", h2_style))
    purposes = purpose_fit.get("purposes_evaluated", [])
    if not purposes:
        story.append(Paragraph("<font color='#64748b'><i>Purpose fitting has not been evaluated (requires profiling).</i></font>", body_style))
    else:
        pf_table_data = [
            [
                Paragraph("<b>Research Purpose</b>", bold_label),
                Paragraph("<b>Assessment Status</b>", bold_label),
                Paragraph("<b>Fav / Neut / Warn / Crit</b>", bold_label),
                Paragraph("<b>Key Findings</b>", bold_label),
            ]
        ]
        for p in purposes:
            status_text = p.get("overall_status", "Neutral")
            style_to_use = (
                badge_good if status_text == "Good Fit"
                else badge_warn if status_text == "Review Recommended"
                else badge_danger
            )
            counts_str = f"{p.get('favorable_count', 0)} / {p.get('neutral_count', 0)} / {p.get('warning_count', 0)} / {p.get('critical_count', 0)}"
            findings_summary = "; ".join([f.get("message", "") for f in p.get("top_findings", [])[:2]]) or "No warnings flagged."

            pf_table_data.append([
                Paragraph(f"<b>{p.get('purpose_display_name')}</b>", body_style),
                Paragraph(status_text, style_to_use),
                Paragraph(counts_str, body_style),
                Paragraph(findings_summary[:80] + ("..." if len(findings_summary) > 80 else ""), body_style),
            ])

        pf_table = Table(pf_table_data, colWidths=[120, 110, 100, 210])
        pf_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("PADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(pf_table)
    story.append(Spacer(1, 8))

    # SECTION E: Domain Check & Target Coverage
    story.append(Paragraph("Section E: Domain Check & Target-Domain Coverage", h2_style))
    if domain_check.get("status") == "not_assessed":
        story.append(Paragraph("<font color='#64748b'><i>No real-world deployment photos have been evaluated against this dataset. Use the Domain Gap Check page to test deployment photo coverage.</i></font>", body_style))
    else:
        cov_pct = domain_check.get("coverage_pct")
        verdict = domain_check.get("verdict", "Evaluated")
        cnts = domain_check.get("counts", {})
        dist = domain_check.get("distribution_distance", {})
        mmd_val = dist.get("value") if dist else None

        dg_rows = [
            [
                Paragraph("<b>Target Coverage:</b>", bold_label),
                Paragraph(f"<b>{cov_pct}%</b> ({verdict})", badge_good if cov_pct and cov_pct >= 80 else badge_warn),
                Paragraph("<b>Evaluated Photos:</b>", bold_label),
                Paragraph(f"{cnts.get('covered_samples', 0)} covered of {cnts.get('total_samples', domain_check.get('sample_count', 0))} target photos", body_style),
            ],
            [
                Paragraph("<b>Similarity Cutoff:</b>", bold_label),
                Paragraph(f"{round(domain_check.get('baseline_threshold', 0), 3)} (intra-dataset 10th percentile)", body_style),
                Paragraph("<b>Centroid Proximity:</b>", bold_label),
                Paragraph(f"{round(domain_check.get('centroid_similarity', 0), 3)}", body_style),
            ],
            [
                Paragraph("<b>MMD Distance:</b>", bold_label),
                Paragraph(f"{mmd_val} (RBF kernel in 768-D DINOv2 space)" if mmd_val is not None else "Not calculated", body_style),
                Paragraph("<b>Embedding Model:</b>", bold_label),
                Paragraph("DINOv2 (facebook/dinov2-base, 768-D)", body_style),
            ],
        ]
        dg_table = Table(dg_rows, colWidths=[105, 165, 105, 165])
        dg_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(dg_table)

        # Draw a crisp vector coverage progress bar
        if cov_pct is not None:
            bar_drawing = Drawing(540, 16)
            bar_drawing.add(Rect(0, 2, 540, 12, fillColor=colors.HexColor("#e2e8f0"), strokeColor=None, rx=4, ry=4))
            covered_w = min(540, max(0, (cov_pct / 100.0) * 540))
            fill_c = colors.HexColor("#10b981") if cov_pct >= 80 else colors.HexColor("#f59e0b") if cov_pct >= 50 else colors.HexColor("#ef4444")
            bar_drawing.add(Rect(0, 2, covered_w, 12, fillColor=fill_c, strokeColor=None, rx=4, ry=4))
            story.append(Spacer(1, 4))
            story.append(bar_drawing)
    story.append(Spacer(1, 8))

    # SECTION F: Integrated Findings & Limitations
    story.append(Paragraph("Section F: Integrated Findings & Research Limitations", h2_style))
    story.append(Paragraph(findings.get("suitability_summary", ""), body_style))
    story.append(Spacer(1, 4))

    findings_rows = []
    strengths_list = findings.get("strengths", [])
    risks_list = findings.get("risks_and_concerns", [])

    s_para = "<br/>".join([f"• {s}" for s in strengths_list])
    r_para = "<br/>".join([f"• {r}" for r in risks_list])

    findings_rows.append([
        Paragraph("<b>Identified Technical Strengths:</b><br/>" + s_para, body_style),
        Paragraph("<b>Quality Flags & Research Limitations:</b><br/>" + r_para, body_style),
    ])

    f_table = Table(findings_rows, colWidths=[270, 270])
    f_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#f0fdf4")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#fffbeb")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(f_table)
    story.append(Spacer(1, 8))

    # SECTION G: Provenance & Reproducibility
    story.append(Paragraph("Section G: Provenance & Reproducibility Record", h2_style))
    prov_text = (
        f"<b>Checksum:</b> <font face=Courier size=7>{identity.get('file_list_checksum') or 'Unavailable'}</font> &nbsp;|&nbsp; "
        f"<b>Profiler:</b> DataWeaver Profiler v1.0 &nbsp;|&nbsp; "
        f"<b>Embeddings:</b> facebook/dinov2-base (768-D L2-norm) &nbsp;|&nbsp; "
        f"<b>Classifier:</b> Logistic Regression Fusion v1.0<br/>"
        "<i>All distance metrics and similarity cutoffs reflect high-dimensional feature proximity in DINOv2 feature space. "
        "Downstream task validation is recommended before final model training.</i>"
    )
    story.append(Paragraph(prov_text, body_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buf.getvalue()
