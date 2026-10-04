import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel

class ProfilingRequest(BaseModel):
    user_description: Optional[str] = None
    eps: Optional[float] = 0.35
    min_samples: Optional[int] = 2
    force_recompute: Optional[bool] = False

class ProfilingStatusResponse(BaseModel):
    dataset_id: uuid.UUID
    status: str  # "not_profiled", "profiling", "completed", "failed", "cancelled"
    stage: Optional[str] = None
    computed_at: Optional[datetime] = None
    file_list_checksum: Optional[str] = None

class ProfilingResultsResponse(BaseModel):
    profiling_id: uuid.UUID
    dataset_id: uuid.UUID
    status: str
    computed_at: datetime
    file_list_checksum: str
    profile_payload: Dict[str, Any]
