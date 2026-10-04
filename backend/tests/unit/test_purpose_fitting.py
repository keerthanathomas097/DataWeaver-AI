import uuid
import pytest
from app.services import purpose_fitting_service
from app.services.purpose_fitting_service import (
    load_purpose_fitting_rules,
    extract_metric_value,
    evaluate_condition,
    evaluate_purpose_mismatch,
    evaluate_purpose_fit,
)


def sample_profile_payload(
    duplicate_ratio: float = 0.81,
    blurred_pct: float = 22.5,
    resolution_std: float = 0.0,
    aspect_std: float = 0.0,
    brightness_std: float = 8.5,
    cluster_count: int = 1,
    silhouette_score: float = 0.12,
    noise_ratio: float = 0.15,
    max_to_min_ratio: float = 18.0,
    dataset_domain: str = "mixed",
    stated_purpose: str = "This dataset was created for image retrieval and similarity search benchmarking.",
):
    return {
        "profiling_version": "1.0",
        "dataset": {
            "dataset_id": str(uuid.uuid4()),
            "dataset_name": "Test Purpose Dataset",
            "dataset_domain": dataset_domain,
        },
        "basic_statistics": {
            "total_images": 100,
            "dimensions": {
                "resolution": {"std": resolution_std, "mean": 262144.0},
            },
            "aspect_ratios": {
                "stats": {"std": aspect_std, "mean": 1.0},
            },
        },
        "quality": {
            "percentages": {"blurred_pct": blurred_pct},
            "brightness": {"std": brightness_std, "mean": 120.0},
            "contrast": {"std": 12.0, "mean": 25.0},
        },
        "duplicates": {
            "status": "completed",
            "duplicate_ratio": duplicate_ratio,
            "affected_images_count": int(duplicate_ratio * 100),
        },
        "labels": {
            "status": "available",
            "metrics": {
                "max_to_min_ratio": max_to_min_ratio,
            },
        },
        "diversity": {
            "status": "completed",
            "cluster_count": cluster_count,
            "silhouette_score": silhouette_score,
            "noise_ratio": noise_ratio,
        },
        "metadata_insights": {
            "stated_purpose": stated_purpose,
        },
    }


def test_load_purpose_fitting_rules():
    config = load_purpose_fitting_rules(reload=True)
    assert config["version"] == "1.0"
    assert config["provenance"]["type"] == "heuristic"
    assert len(config["purposes"]) == 8
    assert "classification" in config["purposes"]
    assert "duplicate_ratio" in config["metrics"]
    assert len(config["rules"]) > 0


def test_invalid_purpose_rejected():
    payload = sample_profile_payload()
    with pytest.raises(ValueError, match="Invalid purpose_key"):
        evaluate_purpose_fit(payload, "non_existent_purpose")


def test_condition_evaluation_operators():
    assert evaluate_condition(0.81, ">", 0.15) is True
    assert evaluate_condition(0.05, ">", 0.15) is False
    assert evaluate_condition(0.0, "==", 0.0) is True
    assert evaluate_condition(2, "<=", 2) is True
    assert evaluate_condition(3, "<=", 2) is False
    assert evaluate_condition("mixed", "==", "mixed") is True
    assert evaluate_condition("photographic", "==", "mixed") is False


def test_rule_triggered_vs_not_triggered():
    # Triggered case: duplicate_ratio = 0.81 > 0.15 for classification -> warning
    payload_high_dup = sample_profile_payload(duplicate_ratio=0.81)
    result_high = evaluate_purpose_fit(payload_high_dup, "classification")

    dup_rule = next(r for r in result_high["all_rules"] if r["metric_key"] == "duplicate_ratio")
    assert dup_rule["triggered"] is True
    assert dup_rule["verdict"] == "warning"
    assert dup_rule["metric_value"] == 0.81
    assert dup_rule["threshold"] == 0.15
    assert dup_rule["operator"] == ">"
    assert dup_rule["rule_id"] == "CLASS_DUP_001"

    # Non-triggered case: duplicate_ratio = 0.05 <= 0.15 for classification -> neutral
    payload_low_dup = sample_profile_payload(duplicate_ratio=0.05)
    result_low = evaluate_purpose_fit(payload_low_dup, "classification")

    dup_rule_low = next(r for r in result_low["all_rules"] if r["metric_key"] == "duplicate_ratio")
    assert dup_rule_low["triggered"] is False
    assert dup_rule_low["verdict"] == "neutral"


def test_favorable_verdict_for_dedup_research():
    # High duplicate ratio in dedup_research purpose should be favorable
    payload = sample_profile_payload(duplicate_ratio=0.81)
    result = evaluate_purpose_fit(payload, "dedup_research")

    dup_rule = next(r for r in result["all_rules"] if r["metric_key"] == "duplicate_ratio")
    assert dup_rule["triggered"] is True
    assert dup_rule["verdict"] == "favorable"
    assert result["summary"]["favorable"] >= 1


def test_neutral_verdict_for_retrieval_duplicate_ratio():
    # Duplicate ratio triggered in retrieval results in neutral verdict
    payload = sample_profile_payload(duplicate_ratio=0.81)
    result = evaluate_purpose_fit(payload, "retrieval")

    dup_rule = next(r for r in result["all_rules"] if r["metric_key"] == "duplicate_ratio")
    assert dup_rule["triggered"] is True
    assert dup_rule["verdict"] == "neutral"


def test_critical_verdict_assignments():
    # In benchmarking, high duplicate ratio is critical
    payload = sample_profile_payload(duplicate_ratio=0.81)
    result_bench = evaluate_purpose_fit(payload, "benchmarking")
    dup_rule = next(r for r in result_bench["all_rules"] if r["metric_key"] == "duplicate_ratio")
    assert dup_rule["verdict"] == "critical"

    # In segmentation, high blur ratio is critical
    payload_blur = sample_profile_payload(blurred_pct=35.0)
    result_seg = evaluate_purpose_fit(payload_blur, "segmentation")
    blur_rule = next(r for r in result_seg["all_rules"] if r["metric_key"] == "high_blur_ratio")
    assert blur_rule["verdict"] == "critical"

    # In generative, low visual variety is critical
    payload_div = sample_profile_payload(cluster_count=1)
    result_gen = evaluate_purpose_fit(payload_div, "generative")
    div_rule = next(r for r in result_gen["all_rules"] if r["metric_key"] == "low_visual_diversity")
    assert div_rule["verdict"] == "critical"


def test_not_applicable_metric_for_purpose():
    # Silhouette score is NOT applicable for retrieval, generative, self_supervised, dedup_research
    payload = sample_profile_payload(silhouette_score=0.10)
    result = evaluate_purpose_fit(payload, "retrieval")

    silh_rule = next(r for r in result["all_rules"] if r["metric_key"] == "low_silhouette_score")
    assert silh_rule["applicable"] is False


def test_missing_and_unavailable_metrics_handling():
    payload = sample_profile_payload()
    # Remove labels section entirely
    payload["labels"] = {"status": "unavailable"}
    # Set silhouette_score to None
    payload["diversity"]["silhouette_score"] = None

    result = evaluate_purpose_fit(payload, "classification")

    # Should not crash, but record unavailable metrics
    unavail_keys = [u["metric_key"] for u in result["unavailable_metrics"]]
    assert "long_tail_imbalance" in unavail_keys
    assert "low_silhouette_score" in unavail_keys
    # Also 4 unsupported metrics from config
    assert "visually_similar_ratio" in unavail_keys
    assert "duplicate_concentration" in unavail_keys
    assert "suspiciously_uniform_class_balance" in unavail_keys
    assert "single_source_domain" in unavail_keys


def test_malformed_config_detection(tmp_path):
    bad_config = tmp_path / "bad_rules.json"
    bad_config.write_text('{"version": "1.0"}', encoding="utf-8")

    with pytest.raises(ValueError, match="Malformed purpose fitting configuration"):
        load_purpose_fitting_rules(config_path=bad_config)


def test_purpose_mismatch_detection():
    config = load_purpose_fitting_rules()
    purposes = config["purposes"]

    # Mismatch case: stated is retrieval, selected is classification
    payload_mismatch = sample_profile_payload(
        stated_purpose="This dataset was created for image retrieval and visual similarity search."
    )
    mismatch_info = evaluate_purpose_mismatch(payload_mismatch, "classification", purposes)
    assert mismatch_info is not None
    assert mismatch_info["mismatch"] is True
    assert "retrieval" in mismatch_info["message"].lower()

    # Match case: stated is classification, selected is classification
    payload_match = sample_profile_payload(
        stated_purpose="High resolution dataset for multi-class image classification and categorization."
    )
    match_info = evaluate_purpose_mismatch(payload_match, "classification", purposes)
    assert match_info is not None
    assert match_info["mismatch"] is False

    # No stated purpose
    payload_no_doc = sample_profile_payload(stated_purpose=None)
    no_doc_info = evaluate_purpose_mismatch(payload_no_doc, "classification", purposes)
    assert no_doc_info is None


def test_rule_traceability_and_sorting():
    payload = sample_profile_payload(duplicate_ratio=0.81, blurred_pct=30.0)
    result = evaluate_purpose_fit(payload, "classification")

    # Check flagged findings sort order: critical first, warning second
    flagged = result["flagged_findings"]
    assert len(flagged) > 0
    verdict_indices = [0 if f["verdict"] == "critical" else 1 for f in flagged]
    assert verdict_indices == sorted(verdict_indices)

    # Check traceability fields
    for item in result["all_rules"]:
        assert "rule_id" in item
        assert "metric_key" in item
        assert "metric_display_name" in item
        assert "threshold" in item
        assert "operator" in item
        assert "triggered" in item
        assert "verdict" in item
        assert "message" in item
        assert "explanation" in item

    # Check radar data contains valid ordinal scores (0 to 3)
    for pt in result["radar_data"]:
        assert pt["ordinal_score"] in (0, 1, 2, 3)
