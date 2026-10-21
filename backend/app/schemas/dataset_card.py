import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class DatasetIdentity(BaseModel):
    dataset_id: uuid.UUID
    dataset_name: str
    workspace_id: uuid.UUID
    workspace_name: Optional[str] = None
    dataset_source_type: str
    dataset_source_url: Optional[str] = None
    dataset_license: Optional[str] = None
    dataset_image_count: int
    dataset_storage_path: Optional[str] = None
    dataset_domain: Optional[str] = None
    dataset_status: str
    dataset_created_at: datetime
    dataset_updated_at: datetime
    file_list_checksum: Optional[str] = None
    total_size_bytes: Optional[int] = None
    stated_purpose: Optional[str] = None
    collection_method: Optional[str] = None
    documented_limitations: Optional[str] = None
    card_generated_at: datetime = Field(default_factory=datetime.utcnow)


class CompositionSection(BaseModel):
    status: str  # "completed", "not_yet_profiled", "profiling", "failed", "stale"
    status_message: Optional[str] = None
    computed_at: Optional[datetime] = None
    total_images: int = 0
    corrupted_images: int = 0
    formats: Dict[str, int] = Field(default_factory=dict)
    color_modes: Dict[str, int] = Field(default_factory=dict)
    channels: Dict[str, int] = Field(default_factory=dict)
    aspect_ratios: Dict[str, Any] = Field(default_factory=dict)
    dimensions: Dict[str, Any] = Field(default_factory=dict)
    file_sizes_bytes: Dict[str, Any] = Field(default_factory=dict)
    quality: Dict[str, Any] = Field(default_factory=dict)
    diversity: Dict[str, Any] = Field(default_factory=dict)
    labels: Dict[str, Any] = Field(default_factory=dict)


class DuplicateDetectionSection(BaseModel):
    status: str  # "completed", "not_yet_computed"
    status_message: Optional[str] = None
    total_examined: int = 0
    duplicate_groups_count: int = 0
    affected_images_count: int = 0
    duplicate_ratio: float = 0.0
    exact_duplicates_count: int = 0
    near_duplicates_count: int = 0
    exact_duplicate_groups: int = 0
    near_duplicate_groups: int = 0
    methods_used: List[Dict[str, Any]] = Field(default_factory=list)
    thresholds_applied: Dict[str, Any] = Field(default_factory=dict)
    sample_groups: List[Dict[str, Any]] = Field(default_factory=list)


class PurposeEvaluationSummary(BaseModel):
    purpose_key: str
    purpose_display_name: str
    overall_status: str  # "Good Fit", "Review Recommended", "Significant Concerns"
    tier: int
    favorable_count: int
    neutral_count: int
    warning_count: int
    critical_count: int
    top_findings: List[Dict[str, Any]] = Field(default_factory=list)


class PurposeFittingSection(BaseModel):
    status: str  # "completed", "not_yet_profiled"
    status_message: Optional[str] = None
    purposes_evaluated: List[PurposeEvaluationSummary] = Field(default_factory=list)
    rules_config_version: str = "1.0"
    clip_analysis_status: Optional[str] = None


class DomainCheckSection(BaseModel):
    status: str  # "completed", "not_assessed", "stale"
    status_message: Optional[str] = None
    computed_at: Optional[datetime] = None
    sample_set_id: Optional[uuid.UUID] = None
    sample_count: int = 0
    coverage_pct: Optional[float] = None
    verdict: Optional[str] = None
    counts: Dict[str, int] = Field(default_factory=dict)
    baseline_threshold: Optional[float] = None
    baseline_median: Optional[float] = None
    centroid_similarity: Optional[float] = None
    distribution_distance: Optional[Dict[str, Any]] = None
    caveats: List[str] = Field(default_factory=list)
    embedding_model: str = "facebook/dinov2-base (768-dim, L2-normalized)"


class IntegratedFindingsSection(BaseModel):
    strengths: List[str] = Field(default_factory=list)
    risks_and_concerns: List[str] = Field(default_factory=list)
    suitability_summary: str
    completeness_score: int  # 0 to 100
    completeness_level: str  # "Comprehensive", "Substantial", "Preliminary", "Minimal"
    completeness_breakdown: Dict[str, str] = Field(default_factory=dict)


class ProvenanceSection(BaseModel):
    source_provenance: Dict[str, Any] = Field(default_factory=dict)
    methodologies: List[Dict[str, Any]] = Field(default_factory=list)
    models_and_tools: List[Dict[str, Any]] = Field(default_factory=list)
    reproducibility_notes: List[str] = Field(default_factory=list)


class DatasetCardResponse(BaseModel):
    identity: DatasetIdentity
    composition: CompositionSection
    duplicate_detection: DuplicateDetectionSection
    purpose_fitting: PurposeFittingSection
    domain_check: DomainCheckSection
    integrated_findings: IntegratedFindingsSection
    provenance: ProvenanceSection
