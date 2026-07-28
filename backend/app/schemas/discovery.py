from pydantic import BaseModel
from typing import Optional

class NormalizedDataset(BaseModel):
    source: str  # 'zenodo' | 'figshare' | 'openml' | 'openverse' | 'huggingface' | 'github' | 'kaggle' | 'roboflow'
    external_id: str
    name: str
    description: Optional[str] = None
    url: str
    license: Optional[str] = None
    image_count: Optional[int] = None
    thumbnail_url: Optional[str] = None

class DiscoverySearchResponse(BaseModel):
    query: str
    results: list[NormalizedDataset]
    sources_searched: list[str]