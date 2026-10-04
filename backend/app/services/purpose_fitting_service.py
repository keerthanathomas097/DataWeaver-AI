import json
import uuid
import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

# Cached rules configuration
_RULES_CACHE: Optional[Dict[str, Any]] = None

ORDINAL_VERDICT_SCORES = {
    "critical": 0,
    "warning": 1,
    "neutral": 2,
    "favorable": 3,
}

PURPOSE_KEYWORDS: Dict[str, List[str]] = {
    "classification": ["classif", "categoriz", "recognition", "labeling", "tagging"],
    "object_detection": ["object detection", "bounding box", "detector", "yolo", "locate object", "localization"],
    "segmentation": ["segmentation", "mask", "pixel-level", "semantic segmentation", "instance segmentation"],
    "retrieval": ["retrieval", "similarity search", "reverse image search", "visual search", "query"],
    "dedup_research": ["duplicate", "dedup", "copy detection", "plagiarism", "near-duplicate"],
    "generative": ["generative", "diffusion", "gan", "generation", "synthesis", "image generation"],
    "self_supervised": ["self-supervised", "unsupervised", "ssl", "representation learning", "contrastive"],
    "benchmarking": ["benchmark", "evaluation", "test suite", "leaderboard", "validation set"],
}


def get_default_config_path() -> Path:
    """Resolves the default path to backend/config/purpose_fitting_rules.json."""
    return Path(__file__).resolve().parent.parent.parent / "config" / "purpose_fitting_rules.json"


def load_purpose_fitting_rules(config_path: Optional[Union[str, Path]] = None, reload: bool = False) -> Dict[str, Any]:
    """
    Loads and validates the purpose-fitting rules configuration JSON.
    Validates required top-level keys: version, provenance, purposes, metrics, rules.
    Raises ValueError if configuration is missing, malformed, or invalid.
    """
    global _RULES_CACHE
    if _RULES_CACHE is not None and not reload and config_path is None:
        return _RULES_CACHE

    target_path = Path(config_path) if config_path else get_default_config_path()

    if not target_path.exists():
        raise FileNotFoundError(f"Purpose fitting configuration file not found at: {target_path}")

    try:
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise ValueError(f"Failed to parse purpose fitting rules JSON: {e}")

    # Validate structure
    required_keys = ("version", "provenance", "purposes", "metrics", "rules")
    for key in required_keys:
        if key not in data:
            raise ValueError(f"Malformed purpose fitting configuration: missing top-level key '{key}'")

    if not isinstance(data["purposes"], dict) or not data["purposes"]:
        raise ValueError("Malformed configuration: 'purposes' must be a non-empty dictionary.")
    if not isinstance(data["metrics"], dict) or not data["metrics"]:
        raise ValueError("Malformed configuration: 'metrics' must be a non-empty dictionary.")
    if not isinstance(data["rules"], list) or not data["rules"]:
        raise ValueError("Malformed configuration: 'rules' must be a non-empty list.")

    if config_path is None:
        _RULES_CACHE = data

    return data


def extract_metric_value(profile_payload: Dict[str, Any], profile_path: Optional[str]) -> Tuple[bool, Any, Optional[str]]:
    """
    Safely traverses dot-separated paths in profile_payload (e.g. 'duplicates.duplicate_ratio').
    Returns (success: bool, value: Any, failure_reason: Optional[str]).
    """
    if not profile_path:
        return False, None, "No profile path configured for this metric."

    if not isinstance(profile_payload, dict):
        return False, None, "Profile payload is not a valid dictionary."

    parts = profile_path.split(".")
    current = profile_payload

    for idx, part in enumerate(parts):
        if not isinstance(current, dict):
            return False, None, f"Path segment '{part}' not accessible in parent value."
        if part not in current:
            # Check for domain-specific explanations
            if parts[0] == "labels":
                return False, None, "Dataset has no folder-based class taxonomy available."
            if parts[0] == "duplicates":
                return False, None, "Duplicate detection statistics have not been computed."
            return False, None, f"Field '{part}' not found in profile section '{parts[idx - 1] if idx > 0 else 'root'}'."
        current = current[part]

    if current is None:
        if parts[-1] == "silhouette_score":
            return False, None, "Silhouette score was not computable due to insufficient clusters or samples."
        return False, None, f"Field '{profile_path}' is null in profiling payload."

    return True, current, None


def evaluate_condition(value: Any, operator: str, threshold: Any) -> bool:
    """
    Evaluates a scalar comparison condition.
    Supported operators: '>', '<', '>=', '<=', '==', '!='
    """
    try:
        # Numeric comparison
        if isinstance(threshold, (int, float)) and isinstance(value, (int, float)):
            val_f = float(value)
            thresh_f = float(threshold)
            if operator == ">":
                return val_f > thresh_f
            elif operator == "<":
                return val_f < thresh_f
            elif operator == ">=":
                return val_f >= thresh_f
            elif operator == "<=":
                return val_f <= thresh_f
            elif operator == "==":
                return abs(val_f - thresh_f) < 1e-9
            elif operator == "!=":
                return abs(val_f - thresh_f) >= 1e-9
            else:
                raise ValueError(f"Unsupported operator: {operator}")

        # String / categorical comparison
        str_val = str(value).lower().strip()
        str_thresh = str(threshold).lower().strip()
        if operator == "==":
            return str_val == str_thresh
        elif operator == "!=":
            return str_val != str_thresh
        else:
            raise ValueError(f"Unsupported operator '{operator}' for categorical values.")
    except Exception as e:
        print(f"Condition evaluation failed for ({value} {operator} {threshold}): {e}")
        return False


def evaluate_purpose_mismatch(
    profile_payload: Dict[str, Any],
    selected_purpose_key: str,
    purposes_cfg: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Compares the creator-stated purpose from metadata_insights against the selected purpose.
    Uses transparent keyword matching without invoking LLMs.
    Returns mismatch dictionary or None if documentation is absent.
    """
    meta_insights = profile_payload.get("metadata_insights") or {}
    stated_purpose = meta_insights.get("stated_purpose")

    if not stated_purpose or not isinstance(stated_purpose, str) or len(stated_purpose.strip()) < 5:
        return None

    stated_lower = stated_purpose.lower()
    matched_purposes = []

    for purpose_key, keywords in PURPOSE_KEYWORDS.items():
        if any(kw in stated_lower for kw in keywords):
            matched_purposes.append(purpose_key)

    selected_display = purposes_cfg.get(selected_purpose_key, {}).get("display_name", selected_purpose_key)

    # Exactly one unambiguous match found
    if len(matched_purposes) == 1:
        matched_key = matched_purposes[0]
        creator_display = purposes_cfg.get(matched_key, {}).get("display_name", matched_key)

        if matched_key == selected_purpose_key:
            return {
                "creator_purpose": stated_purpose,
                "selected_purpose": selected_purpose_key,
                "mismatch": False,
                "message": f"The dataset documentation aligns with the selected purpose ({selected_display}).",
            }
        else:
            return {
                "creator_purpose": stated_purpose,
                "selected_purpose": selected_purpose_key,
                "mismatch": True,
                "message": (
                    f"The dataset documentation describes {creator_display} as its stated purpose, "
                    f"while {selected_display} was selected for this analysis."
                ),
            }

    # Ambiguous or no match
    return {
        "creator_purpose": stated_purpose,
        "selected_purpose": selected_purpose_key,
        "mismatch": None,
        "message": (
            "The dataset documentation contains a stated purpose, but it could not be unambiguously "
            "mapped to one of the 8 standard purpose categories."
        ),
    }


def evaluate_purpose_fit(
    profile_payload: Dict[str, Any],
    purpose_key: str,
    dataset_id: Optional[Union[uuid.UUID, str]] = None,
    rules_cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Pure, deterministic evaluation of all configured rules for the specified purpose
    against the provided dataset profile payload.

    Returns a structured dictionary adhering to PurposeFitResponse schema.
    """
    config = rules_cfg or load_purpose_fitting_rules()

    purposes = config["purposes"]
    metrics = config["metrics"]
    rules_list = config["rules"]

    if purpose_key not in purposes:
        available = ", ".join(purposes.keys())
        raise ValueError(f"Invalid purpose_key '{purpose_key}'. Available purposes: {available}")

    purpose_def = purposes[purpose_key]
    purpose_display_name = purpose_def.get("display_name", purpose_key)

    dataset_uuid = (
        uuid.UUID(str(dataset_id))
        if dataset_id
        else uuid.UUID(str(profile_payload.get("dataset", {}).get("dataset_id") or uuid.uuid4()))
    )

    all_rule_results: List[Dict[str, Any]] = []
    flagged_findings: List[Dict[str, Any]] = []
    dataset_characteristics: List[Dict[str, Any]] = []
    unavailable_metrics: List[Dict[str, Any]] = []
    radar_data: List[Dict[str, Any]] = []

    summary_counts = {
        "favorable": 0,
        "neutral": 0,
        "warning": 0,
        "critical": 0,
    }

    # Filter rules for this purpose
    purpose_rules = [r for r in rules_list if r.get("purpose") == purpose_key]

    # Process each rule
    for rule in purpose_rules:
        metric_key = rule.get("metric")
        metric_def = metrics.get(metric_key, {})

        rule_id = rule.get("id", f"{purpose_key}_{metric_key}")
        metric_display_name = metric_def.get("display_name", metric_key)
        profile_path = metric_def.get("profile_path")
        operator = metric_def.get("operator")
        threshold = metric_def.get("threshold")

        # 1. Check if metric is globally unavailable in config
        if not metric_def.get("applicable", True) or not profile_path:
            unavailable_metrics.append({
                "metric_key": metric_key,
                "metric_display_name": metric_display_name,
                "applicable": False,
                "status": "unavailable",
                "reason": metric_def.get("reason", "This metric is not present in the stored profiling result."),
            })
            continue

        # 2. Check if rule is explicitly marked not applicable for this specific purpose
        if not rule.get("applicable", True):
            all_rule_results.append({
                "rule_id": rule_id,
                "purpose_key": purpose_key,
                "metric_key": metric_key,
                "metric_display_name": metric_display_name,
                "metric_value": None,
                "threshold": threshold,
                "operator": operator,
                "triggered": False,
                "verdict": "neutral",
                "message": rule.get("triggered", {}).get("message", "Metric is not applicable to this purpose."),
                "explanation": rule.get("triggered", {}).get("explanation", "Not applicable."),
                "applicable": False,
                "source_profile_field": profile_path,
            })
            continue

        # 3. Extract actual metric value from profile_payload
        success, value, failure_reason = extract_metric_value(profile_payload, profile_path)

        if not success:
            unavailable_metrics.append({
                "metric_key": metric_key,
                "metric_display_name": metric_display_name,
                "applicable": False,
                "status": "unavailable",
                "reason": failure_reason or "Metric is missing from the stored profiling result.",
            })
            continue

        # 4. Evaluate condition
        triggered = evaluate_condition(value, operator, threshold)
        outcome = rule["triggered"] if triggered else rule["not_triggered"]
        verdict = outcome.get("verdict", "neutral")

        # Increment summary count
        if verdict in summary_counts:
            summary_counts[verdict] += 1

        rule_result = {
            "rule_id": rule_id,
            "purpose_key": purpose_key,
            "metric_key": metric_key,
            "metric_display_name": metric_display_name,
            "metric_value": value,
            "threshold": threshold,
            "operator": operator,
            "triggered": triggered,
            "verdict": verdict,
            "message": outcome.get("message", ""),
            "explanation": outcome.get("explanation", ""),
            "applicable": True,
            "source_profile_field": profile_path,
        }

        all_rule_results.append(rule_result)

        # Radar data point (ordinal scale: 0 to 3)
        radar_data.append({
            "metric_key": metric_key,
            "metric_display_name": metric_display_name,
            "verdict": verdict,
            "ordinal_score": ORDINAL_VERDICT_SCORES.get(verdict, 2),
        })

        # Categorize into findings or characteristics
        if verdict in ("critical", "warning"):
            flagged_findings.append(rule_result)
        else:
            dataset_characteristics.append(rule_result)

    # Sort flagged findings: critical first (0), warning second (1)
    flagged_findings.sort(key=lambda x: (0 if x["verdict"] == "critical" else 1))

    # Purpose mismatch evaluation
    mismatch_notice = evaluate_purpose_mismatch(profile_payload, purpose_key, purposes)

    # Add globally unavailable metrics that have no rule entry
    evaluated_metrics = {r.get("metric") for r in purpose_rules}
    for m_key, m_def in metrics.items():
        if m_key not in evaluated_metrics and not m_def.get("applicable", True):
            if not any(u["metric_key"] == m_key for u in unavailable_metrics):
                unavailable_metrics.append({
                    "metric_key": m_key,
                    "metric_display_name": m_def.get("display_name", m_key),
                    "applicable": False,
                    "status": "unavailable",
                    "reason": m_def.get("reason", "This metric is not present in the stored profiling result."),
                })

    return {
        "purpose_key": purpose_key,
        "purpose_display_name": purpose_display_name,
        "dataset_id": dataset_uuid,
        "computed_at": datetime.datetime.utcnow(),
        "summary": summary_counts,
        "radar_data": radar_data,
        "flagged_findings": flagged_findings,
        "dataset_characteristics": dataset_characteristics,
        "all_rules": all_rule_results,
        "unavailable_metrics": unavailable_metrics,
        "purpose_mismatch": mismatch_notice,
        "config_version": config.get("version", "1.0"),
        "provenance": config.get("provenance", {}),
    }
