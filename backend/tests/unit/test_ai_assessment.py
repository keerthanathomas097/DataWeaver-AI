import uuid
import json
import pytest
from unittest.mock import MagicMock, patch
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.models.user import User
from app.models.workspace import Workspace
from app.models.dataset import Dataset
from app.models.profiling import DatasetProfilingResult
from app.models.clip_finding import DatasetClipFinding
from app.models.ai_assessment import DatasetAiAssessment
from app.services import ai_assessment_service
from app.services.ai_assessment_service import (
    build_assessment_input,
    compute_input_hash,
    validate_assessment,
    build_fallback_assessment,
    generate_assessment,
)


@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def create_sample_profiling_payload(
    total_images=200,
    duplicate_ratio=0.08,
    blurred_pct=2.5,
    cluster_count=8,
    noise_ratio=0.10,
    silhouette_score=0.45,
    max_to_min_ratio=2.5,
):
    return {
        "profiling_version": "1.0",
        "dataset": {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Test Detection Dataset",
            "dataset_domain": "photographic",
        },
        "basic_statistics": {
            "total_images": total_images,
            "dimensions": {
                "resolution": {"std": 12000.0, "mean": 262144.0},
            },
            "aspect_ratios": {
                "stats": {"std": 0.25, "mean": 1.33},
            },
        },
        "quality": {
            "percentages": {"blurred_pct": blurred_pct},
            "brightness": {"std": 25.0, "mean": 120.0},
            "contrast": {"std": 18.0, "mean": 55.0},
        },
        "duplicates": {
            "status": "completed",
            "duplicate_ratio": duplicate_ratio,
        },
        "labels": {
            "status": "available",
            "num_classes": 5,
            "metrics": {
                "max_to_min_ratio": max_to_min_ratio,
            },
        },
        "diversity": {
            "status": "completed",
            "cluster_count": cluster_count,
            "noise_ratio": noise_ratio,
            "silhouette_score": silhouette_score,
        },
        "metadata_insights": {
            "status": "completed",
            "stated_purpose": "Autonomous vehicle obstacle classification.",
            "collection_method": "Mounted roof camera.",
            "known_limitations": "Night driving samples are underrepresented.",
        },
    }


def setup_sample_dataset(session: Session, payload=None) -> uuid.UUID:
    user = User(
        user_id=uuid.uuid4(),
        user_email="test_curator@example.com",
        user_password_hash="fakehash",
    )
    session.add(user)
    session.commit()

    workspace = Workspace(
        workspace_id=uuid.uuid4(),
        user_id=user.user_id,
        workspace_name="CV Research",
        workspace_research_domain="object_detection",
    )
    session.add(workspace)
    session.commit()

    dataset_id = uuid.uuid4()
    dataset = Dataset(
        dataset_id=dataset_id,
        workspace_id=workspace.workspace_id,
        dataset_name="Autonomous Driving Benchmark",
        dataset_source_type="Local",
        dataset_image_count=200,
        dataset_storage_path="datasets/auto_bench/",
        dataset_domain="photographic",
        dataset_status="completed",
    )
    session.add(dataset)
    session.commit()

    if payload is None:
        payload = create_sample_profiling_payload()

    profiling = DatasetProfilingResult(
        profiling_id=uuid.uuid4(),
        dataset_id=dataset_id,
        file_list_checksum="chk_sha256_mock",
        status="completed",
        profile_payload=payload,
    )
    session.add(profiling)
    session.commit()

    return dataset_id


def test_build_assessment_input_structure(test_db_session):
    dataset_id = setup_sample_dataset(test_db_session)
    result = build_assessment_input(dataset_id, "object_detection", test_db_session)

    assert result["dataset_id"] == str(dataset_id)
    assert result["purpose_key"] == "object_detection"
    assert "purpose_name" in result
    assert "purpose_description" in result
    assert "verdict_counts" in result
    assert "flagged_issues" in result
    assert "stats" in result
    assert result["stats"]["image_count"] == 200
    assert result["stats"]["blurred_pct"] == 2.5
    assert result["stats"]["duplicate_ratio"] == 0.08
    assert "not_measured" in result

    # Verify no URLs or per-image file paths leaked into the compact input
    json_str = json.dumps(result)
    assert "presigned" not in json_str.lower()
    assert ".jpg" not in json_str.lower()


def test_compute_input_hash_stability():
    input_a = {
        "dataset_id": "123",
        "purpose_key": "classification",
        "stats": {"image_count": 50, "blurred_pct": 1.2},
        "flagged_issues": [{"metric_key": "duplicate_ratio", "verdict": "critical"}],
    }
    # Same data, reversed dictionary insertion order
    input_b = {
        "flagged_issues": [{"metric_key": "duplicate_ratio", "verdict": "critical"}],
        "stats": {"blurred_pct": 1.2, "image_count": 50},
        "purpose_key": "classification",
        "dataset_id": "123",
    }

    hash_a = compute_input_hash(input_a)
    hash_b = compute_input_hash(input_b)
    assert hash_a == hash_b
    assert len(hash_a) == 64

    # Change value alters hash
    input_c = dict(input_a, purpose_key="retrieval")
    assert compute_input_hash(input_c) != hash_a


def test_validate_assessment_success():
    sample_input = {
        "purpose_name": "Image Classification",
        "stats": {"image_count": 120, "blurred_pct": 2.0, "duplicate_ratio": 0.05},
        "flagged_issues": [
            {"metric_key": "high_blur_ratio", "verdict": "warning"},
            {"metric_key": "duplicate_ratio", "verdict": "critical"},
        ],
        "not_measured": ["visually_similar_ratio"],
    }

    valid_payload = {
        "headline": "Solid Classification Suitability with Deduplication Required",
        "summary": "This dataset provides strong visual diversity for image classification. However, redundant duplicates were flagged as critical. Addressing duplicates will improve generalization.",
        "strengths": ["Low overall blur ratio", "Adequate class balance across categories"],
        "concerns": [
            {
                "text": "Severe duplicate concentration detected across training images.",
                "severity": "critical",
                "evidence": ["duplicate_ratio"],
            },
            {
                "text": "Minor proportion of blurred frames present.",
                "severity": "warning",
                "evidence": ["high_blur_ratio"],
            },
        ],
        "recommendations": [
            "Filter duplicate images before training.",
            "Verify label consistency across the top categories.",
        ],
        "confidence_note": "High confidence based on measured heuristic profiling across 120 images.",
    }

    is_valid, err = validate_assessment(valid_payload, sample_input)
    assert is_valid is True
    assert err is None


def test_validate_assessment_headline_too_long():
    sample_input = {"flagged_issues": [], "stats": {}, "not_measured": []}
    payload = {
        "headline": "A" * 145,  # Exceeds 140 chars
        "summary": "This is a valid summary with adequate length and proper context for analysis.",
        "strengths": ["Good diversity"],
        "concerns": [],
        "recommendations": ["Train baseline model"],
        "confidence_note": "Standard confidence.",
    }
    is_valid, err = validate_assessment(payload, sample_input)
    assert is_valid is False
    assert "Headline exceeds 140" in err


def test_validate_assessment_missing_critical_flag():
    sample_input = {
        "flagged_issues": [
            {"metric_key": "duplicate_ratio", "verdict": "critical"},
        ],
        "stats": {"image_count": 100},
        "not_measured": [],
    }
    payload = {
        "headline": "Headline fits nicely",
        "summary": "Summary describing the dataset without mentioning duplicates.",
        "strengths": ["High sharpness"],
        "concerns": [
            {
                "text": "Lighting is slightly narrow.",
                "severity": "warning",
                "evidence": ["image_count"],
            }
        ],
        "recommendations": ["Expand lighting variety"],
        "confidence_note": "Standard confidence.",
    }
    is_valid, err = validate_assessment(payload, sample_input)
    assert is_valid is False
    assert "Critical flags not referenced in concerns" in err


def test_validate_assessment_invalid_evidence_key():
    sample_input = {
        "flagged_issues": [],
        "stats": {"image_count": 100},
        "not_measured": [],
    }
    payload = {
        "headline": "Headline fits",
        "summary": "Summary describing the dataset.",
        "strengths": ["Clear visuals"],
        "concerns": [
            {
                "text": "Invalid evidence citation.",
                "severity": "warning",
                "evidence": ["fabricated_metric_name_xyz"],
            }
        ],
        "recommendations": ["Proceed with caution"],
        "confidence_note": "Standard confidence.",
    }
    is_valid, err = validate_assessment(payload, sample_input)
    assert is_valid is False
    assert "fabricated_metric_name_xyz" in err


def test_build_fallback_assessment():
    sample_input = {
        "purpose_name": "Object Detection",
        "verdict_counts": {"favorable": 4, "neutral": 2, "warning": 1, "critical": 1},
        "stats": {"image_count": 45, "blurred_pct": 1.5, "duplicate_ratio": 0.22, "cluster_count": 4},
        "flagged_issues": [
            {
                "metric_key": "duplicate_ratio",
                "metric_name": "Duplicate Ratio",
                "verdict": "critical",
                "message": "High duplicate concentration (>15%).",
            },
            {
                "metric_key": "low_visual_diversity",
                "metric_name": "Visual Diversity",
                "verdict": "warning",
                "message": "Limited number of visual clusters.",
            },
        ],
        "not_measured": ["visually_similar_ratio"],
    }

    fallback = build_fallback_assessment(sample_input)
    is_valid, err = validate_assessment(fallback, sample_input)
    assert is_valid is True, f"Fallback assessment failed validation: {err}"
    assert len(fallback["headline"]) <= 140
    assert any("duplicate_ratio" in c["evidence"] for c in fallback["concerns"])
    # Low image count triggers low confidence note
    assert "Low confidence" in fallback["confidence_note"]


def test_generate_assessment_cache_hit(test_db_session):
    dataset_id = setup_sample_dataset(test_db_session)
    input_data = build_assessment_input(dataset_id, "classification", test_db_session)
    input_hash = compute_input_hash(input_data)

    existing_assessment = {
        "headline": "Cached Headline",
        "summary": "Cached summary text for testing.",
        "strengths": ["Cached strength"],
        "concerns": [],
        "recommendations": ["Cached rec"],
        "confidence_note": "Cached confidence.",
    }

    row = DatasetAiAssessment(
        dataset_id=dataset_id,
        purpose_key="classification",
        input_hash=input_hash,
        assessment=existing_assessment,
        generated_by="llm",
        model_name="llama-3.3-70b-versatile",
    )
    test_db_session.add(row)
    test_db_session.commit()

    with patch.object(ai_assessment_service.groq_client.chat.completions, "create") as mock_create:
        res = generate_assessment(dataset_id, "classification", force=False, session=test_db_session)
        assert res["is_cached"] is True
        assert res["assessment"]["headline"] == "Cached Headline"
        mock_create.assert_not_called()


def test_generate_assessment_with_llm_mock(test_db_session):
    dataset_id = setup_sample_dataset(test_db_session)

    mock_llm_output = {
        "headline": "Strong Fit for Image Classification with High Visual Diversity",
        "summary": "The dataset contains high quality imagery with low blur and strong cluster separation. Classification models will benefit from balanced representations. A few minor duplicates should be pruned.",
        "strengths": ["Low blur ratio under 3%", "Strong cluster cohesion"],
        "concerns": [
            {
                "text": "A small fraction of repeated images was observed.",
                "severity": "warning",
                "evidence": ["duplicate_ratio"],
            }
        ],
        "recommendations": ["Deduplicate near-identical images", "Benchmark baseline CNN"],
        "confidence_note": "High confidence based on measured characteristics across 200 images.",
    }

    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock(message=MagicMock(content=json.dumps(mock_llm_output)))]

    with patch.object(ai_assessment_service.groq_client.chat.completions, "create", return_value=mock_resp):
        res = generate_assessment(dataset_id, "classification", force=True, session=test_db_session)
        assert res["is_cached"] is False
        assert res["generated_by"] == "llm"
        assert res["model_name"] == "llama-3.3-70b-versatile"
        assert res["assessment"]["headline"] == mock_llm_output["headline"]


def test_generate_assessment_fallback_on_llm_exception(test_db_session):
    dataset_id = setup_sample_dataset(test_db_session)

    with patch.object(ai_assessment_service.groq_client.chat.completions, "create", side_effect=RuntimeError("Groq API Timeout")):
        res = generate_assessment(dataset_id, "classification", force=True, session=test_db_session)
        assert res["is_cached"] is False
        assert res["generated_by"] == "fallback"
        assert res["model_name"] is None
        assert "headline" in res["assessment"]
        assert len(res["assessment"]["strengths"]) >= 1
