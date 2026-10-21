import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class DomainGapCompareRequest(BaseModel):
    sample_set_id: uuid.UUID
    reference_similarity: Optional[float] = None
    force_recompute: bool = False


class PhotoSimilarityDetail(BaseModel):
    sample_index: int
    sample_path: str
    sample_url: Optional[str] = None
    similarity: float
    nearest_image_path: str
    nearest_image_url: Optional[str] = None


class CandidateDatasetMetrics(BaseModel):
    dataset_id: uuid.UUID
    dataset_name: str
    dataset_image_count: int
    rank: int
    cutoff: Optional[float] = None
    baseline_median: Optional[float] = None
    median_similarity: float
    mean_similarity: float
    covered_count: int
    near_miss_count: int
    far_count: int
    coverage_pct: float
    near_miss_pct: float
    far_pct: float
    own_cutoff_covered_count: int
    own_cutoff_coverage_pct: float
    size_warning: Optional[str] = None
    per_photo: List[PhotoSimilarityDetail] = []


class IneligibleDatasetInfo(BaseModel):
    dataset_id: uuid.UUID
    dataset_name: str
    dataset_image_count: int
    reason: str
    details: str


class CombinedCoverageStep(BaseModel):
    step: int
    dataset_id: uuid.UUID
    dataset_name: str
    newly_covered_count: int
    cumulative_covered_count: int
    cumulative_coverage_pct: float


class WorkspaceDomainGapComparisonResponse(BaseModel):
    workspace_id: uuid.UUID
    sample_set_id: uuid.UUID
    sample_count: int
    computed_at: datetime
    signature: str
    reference_similarity: float
    reference_min: float
    reference_max: float
    default_reference: float
    near_miss_margin: float
    near_miss_threshold: float
    best_match_dataset_id: Optional[uuid.UUID] = None
    best_match_dataset_name: Optional[str] = None
    summary_sentence: str
    ranked_datasets: List[CandidateDatasetMetrics]
    ineligible_datasets: List[IneligibleDatasetInfo]
    combined_coverage: List[CombinedCoverageStep]
    caveats: List[str]
    sample_photos: List[Dict[str, Any]]
