import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field


class PurposeFitRequest(BaseModel):
    purpose_key: str = Field(
        ...,
        description="Key of the selected research purpose (e.g. 'classification', 'object_detection')."
    )


class RuleResult(BaseModel):
    rule_id: str
    purpose_key: str
    metric_key: str
    metric_display_name: str
    metric_value: Optional[Union[float, int, str]] = None
    threshold: Optional[Union[float, int, str]] = None
    operator: Optional[str] = None
    triggered: bool
    verdict: str  # "favorable", "neutral", "warning", "critical"
    message: str
    explanation: str
    applicable: bool = True
    source_profile_field: Optional[str] = None


class UnavailableMetricInfo(BaseModel):
    metric_key: str
    metric_display_name: str
    applicable: bool = False
    status: str = "unavailable"
    reason: str


class PurposeMismatchNotice(BaseModel):
    creator_purpose: Optional[str] = None
    selected_purpose: str
    mismatch: Optional[bool] = None
    message: str


class SummaryBreakdown(BaseModel):
    favorable: int = 0
    neutral: int = 0
    warning: int = 0
    critical: int = 0


class RadarDataPoint(BaseModel):
    metric_key: str
    metric_display_name: str
    verdict: str
    ordinal_score: int  # 0: critical, 1: warning, 2: neutral, 3: favorable


class PurposeDefinition(BaseModel):
    key: str
    display_name: str
    short_description: str


class PurposeFitResponse(BaseModel):
    purpose_key: str
    purpose_display_name: str
    dataset_id: uuid.UUID
    computed_at: datetime
    summary: SummaryBreakdown
    radar_data: List[RadarDataPoint]
    flagged_findings: List[RuleResult]
    dataset_characteristics: List[RuleResult]
    all_rules: List[RuleResult]
    unavailable_metrics: List[UnavailableMetricInfo]
    purpose_mismatch: Optional[PurposeMismatchNotice] = None
    config_version: str
    provenance: Dict[str, Any]
