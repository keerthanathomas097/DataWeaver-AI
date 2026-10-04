from typing import Optional, Union, Tuple, Dict, Any
from dataclasses import dataclass
from PIL import Image
import imagehash

from app.config_dedup import DedupThresholdsConfig, load_dedup_thresholds


@dataclass
class ImageMultiHash:
    """Container for perceptual, gradient difference, and wavelet image hashes."""
    phash: imagehash.ImageHash
    dhash: imagehash.ImageHash
    whash: imagehash.ImageHash

    def to_dict(self) -> Dict[str, imagehash.ImageHash]:
        return {
            "phash": self.phash,
            "dhash": self.dhash,
            "whash": self.whash,
        }


def compute_multi_hashes(pil_img: Image.Image) -> ImageMultiHash:
    """Computes pHash, dHash, and wHash for a given PIL Image."""
    # Ensure consistent RGB mode conversion for hashing algorithms
    if pil_img.mode not in ("L", "RGB"):
        img = pil_img.convert("RGB")
    else:
        img = pil_img

    phash = imagehash.phash(img)
    dhash = imagehash.dhash(img)
    whash = imagehash.whash(img)

    return ImageMultiHash(phash=phash, dhash=dhash, whash=whash)


def compute_normalized_hamming_distance(h1: imagehash.ImageHash, h2: imagehash.ImageHash) -> float:
    """Computes the normalized Hamming distance between two image hashes in range [0.0, 1.0]."""
    total_bits = float(h1.hash.size) if hasattr(h1.hash, "size") and h1.hash.size > 0 else 64.0
    raw_distance = float(h1 - h2)
    return max(0.0, min(1.0, raw_distance / total_bits))


def compute_multi_hash_match(
    hash1: Union[ImageMultiHash, Dict[str, imagehash.ImageHash]],
    hash2: Union[ImageMultiHash, Dict[str, imagehash.ImageHash]],
    config: Optional[DedupThresholdsConfig] = None,
) -> Tuple[bool, float, Dict[str, Any]]:
    """Evaluates whether two multi-hashes constitute a duplicate pair using 2-of-3 consensus voting.

    Args:
        hash1: First image's multi-hash (ImageMultiHash or dict with keys 'phash', 'dhash', 'whash')
        hash2: Second image's multi-hash
        config: Optional DedupThresholdsConfig. If omitted, loaded from cached configuration.

    Returns:
        Tuple of:
          - is_match (bool): True if at least 2 of 3 hash types satisfy their threshold.
          - confidence_score (float): Probability score in [0.0, 1.0]:
              * 3-of-3 votes pass: [0.95, 1.00] (displays as 'Duplicate' on dashboard)
              * 2-of-3 votes pass: [0.75, 0.94] (displays as 'Visually Similar' on dashboard)
              * <2 votes pass: 0.00 (not a match)
          - details (dict): Per-hash normalized distances, votes, and threshold comparison details.
    """
    if config is None:
        config = load_dedup_thresholds()

    h1_p = hash1.phash if isinstance(hash1, ImageMultiHash) else hash1["phash"]
    h1_d = hash1.dhash if isinstance(hash1, ImageMultiHash) else hash1["dhash"]
    h1_w = hash1.whash if isinstance(hash1, ImageMultiHash) else hash1["whash"]

    h2_p = hash2.phash if isinstance(hash2, ImageMultiHash) else hash2["phash"]
    h2_d = hash2.dhash if isinstance(hash2, ImageMultiHash) else hash2["dhash"]
    h2_w = hash2.whash if isinstance(hash2, ImageMultiHash) else hash2["whash"]

    dist_phash = compute_normalized_hamming_distance(h1_p, h2_p)
    dist_dhash = compute_normalized_hamming_distance(h1_d, h2_d)
    dist_whash = compute_normalized_hamming_distance(h1_w, h2_w)

    vote_phash = dist_phash <= config.phash_threshold
    vote_dhash = dist_dhash <= config.dhash_threshold
    vote_whash = dist_whash <= config.whash_threshold

    votes = sum([vote_phash, vote_dhash, vote_whash])

    sim_phash = 1.0 - dist_phash
    sim_dhash = 1.0 - dist_dhash
    sim_whash = 1.0 - dist_whash

    is_match = False
    confidence_score = 0.0

    if config.voting_rule == "2_of_3":
        if votes == 3:
            is_match = True
            # Full consensus: map similarity to [0.95, 1.00]
            avg_sim = (sim_phash + sim_dhash + sim_whash) / 3.0
            confidence_score = round(0.95 + 0.05 * min(1.0, max(0.0, (avg_sim - 0.60) / 0.40)), 4)
        elif votes == 2:
            is_match = True
            # Majority consensus: map passing similarity to [0.75, 0.94]
            passing_sims = [
                sim for sim, passed in [
                    (sim_phash, vote_phash),
                    (sim_dhash, vote_dhash),
                    (sim_whash, vote_whash),
                ] if passed
            ]
            avg_passing_sim = sum(passing_sims) / len(passing_sims)
            confidence_score = round(0.75 + 0.19 * min(1.0, max(0.0, (avg_passing_sim - 0.60) / 0.40)), 4)
        else:
            is_match = False
            confidence_score = 0.0
    else:
        raise ValueError(f"Unsupported voting rule: '{config.voting_rule}'")

    details = {
        "distances": {
            "phash": dist_phash,
            "dhash": dist_dhash,
            "whash": dist_whash,
        },
        "thresholds": {
            "phash": config.phash_threshold,
            "dhash": config.dhash_threshold,
            "whash": config.whash_threshold,
        },
        "votes": {
            "phash": vote_phash,
            "dhash": vote_dhash,
            "whash": vote_whash,
            "total": votes,
        },
        "is_match": is_match,
        "confidence_score": confidence_score,
    }

    return is_match, confidence_score, details
