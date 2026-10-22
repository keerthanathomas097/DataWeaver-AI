from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class LearningCurveRequest(BaseModel):
    force_recompute: bool = False


class LearningCurveStatusResponse(BaseModel):
    status: str  # "not_run" | "running" | "completed" | "failed" | "cancelled" | "ineligible"
    stage: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None


class FractionResult(BaseModel):
    fraction: float
    train_images_mean: float
    score_mean: float
    score_std: float
    skipped: bool = False


class ClassGainItem(BaseModel):
    class_name: str
    recall_baseline: float
    recall_full: float
    gain: float
    would_benefit: bool


class ConfusedPairItem(BaseModel):
    true_class: str
    predicted_class: str
    rate: float


class MislabelCandidateItem(BaseModel):
    image_path: str
    labelled_class: str
    predicted_class: str
    confidence: float
    image_url: Optional[str] = None


class LearningCurveResultPayload(BaseModel):
    status: str = "completed"
    dataset_id: str
    dataset_name: Optional[str] = None
    file_list_checksum: str
    params_hash: str
    computed_at: str
    images_used: int
    images_total: int
    num_classes: int
    class_counts: Dict[str, int]
    grouping: str  # "duplicate_groups" | "none_fallback"
    fractions: List[FractionResult]
    chance_level: float
    final_score: float
    verdict: str  # "still_improving" | "levelling_off" | "flat_from_start" | "weak_signal"
    last_step_gain: float
    per_class: List[ClassGainItem]
    confused_pairs: List[ConfusedPairItem]
    mislabel_candidates: List[MislabelCandidateItem]
    caveats: List[str]
    params: Dict[str, Any]
