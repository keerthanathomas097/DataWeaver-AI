import os
import json
from pathlib import Path
from typing import Optional
from functools import lru_cache
from pydantic import BaseModel, Field, ValidationError


# Empirically tuned via offline testing:
# F1 ~0.99 on visually diverse non-photographic content;
# reduced accuracy F1 ~0.70 on structurally homogeneous domains like medical imaging,
# documented as a known limitation.
class DedupThresholdsConfig(BaseModel):
    """Configuration thresholds and voting rules for multi-hash non-photographic deduplication."""
    phash_threshold: float = Field(..., ge=0.0, le=1.0, description="Normalized Hamming threshold for pHash")
    dhash_threshold: float = Field(..., ge=0.0, le=1.0, description="Normalized Hamming threshold for dHash")
    whash_threshold: float = Field(..., ge=0.0, le=1.0, description="Normalized Hamming threshold for wHash")
    voting_rule: str = Field(..., pattern="^2_of_3$", description="Consensus voting rule")


def resolve_dedup_config_path(custom_path: Optional[str] = None) -> Path:
    """Resolves the path to dedup_thresholds.json across standard locations.

    Raises FileNotFoundError if the file cannot be found.
    """
    if custom_path:
        path = Path(custom_path)
        if not path.is_file():
            raise FileNotFoundError(f"Specified deduplication threshold config file not found: {custom_path}")
        return path.resolve()

    candidates = []

    env_path = os.getenv("DEDUP_CONFIG_PATH")
    if env_path:
        candidates.append(Path(env_path))

    cwd = Path.cwd()
    candidates.append(cwd / "config" / "dedup_thresholds.json")
    candidates.append(cwd / "backend" / "config" / "dedup_thresholds.json")

    # Relative to this file (backend/app/config_dedup.py)
    app_dir = Path(__file__).resolve().parent
    candidates.append(app_dir.parent / "config" / "dedup_thresholds.json")          # backend/config/...
    candidates.append(app_dir.parent.parent / "config" / "dedup_thresholds.json")   # root/config/...

    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()

    searched_paths = "\n  - ".join(str(p) for p in candidates)
    raise FileNotFoundError(
        f"Deduplication threshold config file 'dedup_thresholds.json' not found. Searched locations:\n  - {searched_paths}"
    )


@lru_cache(maxsize=4)
def _load_cached_config(resolved_path_str: str) -> DedupThresholdsConfig:
    """Internal cached loader based on resolved absolute path."""
    path = Path(resolved_path_str)
    if not path.is_file():
        raise FileNotFoundError(f"Deduplication threshold config file not found: {resolved_path_str}")

    try:
        raw_text = path.read_text(encoding="utf-8")
        data = json.loads(raw_text)
    except json.JSONDecodeError as err:
        raise ValueError(f"Malformed JSON in deduplication config file '{resolved_path_str}': {err}") from err

    try:
        return DedupThresholdsConfig.model_validate(data)
    except ValidationError as err:
        raise ValueError(f"Invalid schema in deduplication config file '{resolved_path_str}': {err}") from err


def load_dedup_thresholds(config_path: Optional[str] = None) -> DedupThresholdsConfig:
    """Loads, validates, and caches the multi-hash deduplication thresholds.

    Cached across calls to avoid disk re-reads during batch processing.
    """
    resolved_path = resolve_dedup_config_path(config_path)
    return _load_cached_config(str(resolved_path))


def clear_dedup_config_cache():
    """Clears the cached configuration (useful for testing runtime config changes)."""
    _load_cached_config.cache_clear()
