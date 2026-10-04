import os
import json
import pytest
import numpy as np
from PIL import Image
import imagehash

from app.config_dedup import (
    DedupThresholdsConfig,
    load_dedup_thresholds,
    resolve_dedup_config_path,
    clear_dedup_config_cache,
)
from app.services.non_photographic_dedup_service import (
    compute_multi_hashes,
    compute_normalized_hamming_distance,
    compute_multi_hash_match,
    ImageMultiHash,
)


def create_mock_hash(bit_array: np.ndarray) -> imagehash.ImageHash:
    """Helper to create an ImageHash object from a boolean 8x8 numpy array."""
    assert bit_array.shape == (8, 8), "ImageHash expects 8x8 array by default"
    return imagehash.ImageHash(bit_array)


# =====================================================================
# Config Loader Tests
# =====================================================================

@pytest.mark.unit
def test_load_dedup_thresholds_success():
    """Verify that dedup_thresholds.json loads and matches expected values."""
    clear_dedup_config_cache()
    config = load_dedup_thresholds()

    assert isinstance(config, DedupThresholdsConfig)
    assert config.phash_threshold == pytest.approx(0.408)
    assert config.dhash_threshold == pytest.approx(0.367)
    assert config.whash_threshold == pytest.approx(0.377)
    assert config.voting_rule == "2_of_3"


@pytest.mark.unit
def test_dedup_thresholds_caching():
    """Verify that multiple load calls return the identical cached instance."""
    clear_dedup_config_cache()
    cfg1 = load_dedup_thresholds()
    cfg2 = load_dedup_thresholds()
    assert cfg1 is cfg2


@pytest.mark.unit
def test_load_dedup_thresholds_missing_file(tmp_path):
    """Verify that a non-existent config path raises FileNotFoundError."""
    missing_path = tmp_path / "non_existent_config.json"
    with pytest.raises(FileNotFoundError):
        load_dedup_thresholds(str(missing_path))


@pytest.mark.unit
def test_load_dedup_thresholds_malformed_json(tmp_path):
    """Verify that malformed JSON raises ValueError."""
    bad_file = tmp_path / "malformed.json"
    bad_file.write_text("{invalid_json: true,}", encoding="utf-8")
    with pytest.raises(ValueError, match="Malformed JSON"):
        load_dedup_thresholds(str(bad_file))


@pytest.mark.unit
def test_load_dedup_thresholds_invalid_schema(tmp_path):
    """Verify that schema violations (e.g. out of range threshold or invalid voting rule) raise ValueError."""
    invalid_schema = tmp_path / "invalid_schema.json"
    invalid_schema.write_text(json.dumps({
        "phash_threshold": 1.5,  # Out of [0, 1] range
        "dhash_threshold": 0.367,
        "whash_threshold": 0.377,
        "voting_rule": "2_of_3",
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid schema"):
        load_dedup_thresholds(str(invalid_schema))

    invalid_rule = tmp_path / "invalid_rule.json"
    invalid_rule.write_text(json.dumps({
        "phash_threshold": 0.408,
        "dhash_threshold": 0.367,
        "whash_threshold": 0.377,
        "voting_rule": "3_of_3",  # Unsupported rule
    }), encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid schema"):
        load_dedup_thresholds(str(invalid_rule))


# =====================================================================
# Multi-Hash Computation & Distance Tests
# =====================================================================

@pytest.mark.unit
def test_compute_multi_hashes_returns_all_hashes():
    """Verify compute_multi_hashes generates pHash, dHash, and wHash."""
    img = Image.new("L", (100, 100), color=120)
    m_hash = compute_multi_hashes(img)

    assert isinstance(m_hash, ImageMultiHash)
    assert isinstance(m_hash.phash, imagehash.ImageHash)
    assert isinstance(m_hash.dhash, imagehash.ImageHash)
    assert isinstance(m_hash.whash, imagehash.ImageHash)


@pytest.mark.unit
def test_normalized_hamming_distance_range():
    """Verify normalized Hamming distance is scaled between 0.0 and 1.0."""
    all_zeros = create_mock_hash(np.zeros((8, 8), dtype=bool))
    all_ones = create_mock_hash(np.ones((8, 8), dtype=bool))

    # Identical hashes -> distance 0.0
    dist_same = compute_normalized_hamming_distance(all_zeros, all_zeros)
    assert dist_same == 0.0

    # Completely inverted 64-bit hashes -> distance 1.0 (64 / 64)
    dist_diff = compute_normalized_hamming_distance(all_zeros, all_ones)
    assert dist_diff == 1.0

    # Half inverted (32 bits) -> distance 0.5
    half_bits = np.zeros((8, 8), dtype=bool)
    half_bits[:4, :] = True
    dist_half = compute_normalized_hamming_distance(all_zeros, create_mock_hash(half_bits))
    assert dist_half == pytest.approx(0.5)


# =====================================================================
# 2-of-3 Voting Logic Tests
# =====================================================================

@pytest.mark.unit
def test_voting_all_three_pass():
    """When all 3 hashes pass their thresholds (3/3), classify as match with confidence >= 0.95."""
    test_config = DedupThresholdsConfig(
        phash_threshold=0.408,
        dhash_threshold=0.367,
        whash_threshold=0.377,
        voting_rule="2_of_3",
    )

    base_bits = np.zeros((8, 8), dtype=bool)
    # Differences: pHash = 4 bits (~0.06), dHash = 4 bits (~0.06), wHash = 4 bits (~0.06)
    diff_bits = np.zeros((8, 8), dtype=bool)
    diff_bits[0, :4] = True

    h1 = ImageMultiHash(
        phash=create_mock_hash(base_bits),
        dhash=create_mock_hash(base_bits),
        whash=create_mock_hash(base_bits),
    )
    h2 = ImageMultiHash(
        phash=create_mock_hash(diff_bits),
        dhash=create_mock_hash(diff_bits),
        whash=create_mock_hash(diff_bits),
    )

    is_match, conf, details = compute_multi_hash_match(h1, h2, config=test_config)
    assert is_match is True
    assert conf >= 0.95, f"Expected confidence >= 0.95 for 3/3 match, got: {conf}"
    assert details["votes"]["total"] == 3


@pytest.mark.unit
def test_voting_two_of_three_pass_combinations():
    """When any 2 of the 3 hashes pass, classify as match with confidence < 0.95 ('Visually Similar')."""
    test_config = DedupThresholdsConfig(
        phash_threshold=0.408,
        dhash_threshold=0.367,
        whash_threshold=0.377,
        voting_rule="2_of_3",
    )

    base_bits = np.zeros((8, 8), dtype=bool)

    # Small diff (4 bits = 0.0625 <= all thresholds)
    small_diff = np.zeros((8, 8), dtype=bool)
    small_diff[0, :4] = True

    # Large diff (36 bits = 0.5625 > all thresholds)
    large_diff = np.zeros((8, 8), dtype=bool)
    large_diff[:4, :] = True
    large_diff[4, :4] = True

    h_base = create_mock_hash(base_bits)
    h_small = create_mock_hash(small_diff)
    h_large = create_mock_hash(large_diff)

    # Combo 1: pHash & dHash pass, wHash fails
    h1 = ImageMultiHash(phash=h_base, dhash=h_base, whash=h_base)
    h2_c1 = ImageMultiHash(phash=h_small, dhash=h_small, whash=h_large)

    is_match, conf, details = compute_multi_hash_match(h1, h2_c1, config=test_config)
    assert is_match is True
    assert 0.75 <= conf < 0.95
    assert details["votes"]["phash"] is True
    assert details["votes"]["dhash"] is True
    assert details["votes"]["whash"] is False
    assert details["votes"]["total"] == 2

    # Combo 2: pHash & wHash pass, dHash fails
    h2_c2 = ImageMultiHash(phash=h_small, dhash=h_large, whash=h_small)
    is_match, conf, details = compute_multi_hash_match(h1, h2_c2, config=test_config)
    assert is_match is True
    assert 0.75 <= conf < 0.95
    assert details["votes"]["total"] == 2

    # Combo 3: dHash & wHash pass, pHash fails
    h2_c3 = ImageMultiHash(phash=h_large, dhash=h_small, whash=h_small)
    is_match, conf, details = compute_multi_hash_match(h1, h2_c3, config=test_config)
    assert is_match is True
    assert 0.75 <= conf < 0.95
    assert details["votes"]["total"] == 2


@pytest.mark.unit
def test_voting_one_or_zero_pass():
    """When fewer than 2 hashes pass (1/3 or 0/3), classify as non-match with confidence == 0.0."""
    test_config = DedupThresholdsConfig(
        phash_threshold=0.408,
        dhash_threshold=0.367,
        whash_threshold=0.377,
        voting_rule="2_of_3",
    )

    base_bits = np.zeros((8, 8), dtype=bool)
    small_diff = np.zeros((8, 8), dtype=bool)
    small_diff[0, :4] = True  # ~0.0625 <= threshold
    large_diff = np.zeros((8, 8), dtype=bool)
    large_diff[:5, :] = True  # 40 bits = 0.625 > threshold

    h_base = create_mock_hash(base_bits)
    h_small = create_mock_hash(small_diff)
    h_large = create_mock_hash(large_diff)

    h1 = ImageMultiHash(phash=h_base, dhash=h_base, whash=h_base)

    # 1/3: only pHash passes
    h2_1vote = ImageMultiHash(phash=h_small, dhash=h_large, whash=h_large)
    is_match, conf, details = compute_multi_hash_match(h1, h2_1vote, config=test_config)
    assert is_match is False
    assert conf == 0.0
    assert details["votes"]["total"] == 1

    # 0/3: none pass
    h2_0votes = ImageMultiHash(phash=h_large, dhash=h_large, whash=h_large)
    is_match, conf, details = compute_multi_hash_match(h1, h2_0votes, config=test_config)
    assert is_match is False
    assert conf == 0.0
    assert details["votes"]["total"] == 0


@pytest.mark.unit
def test_real_image_identical_multi_hash_match():
    """Verify identical PIL images result in 3/3 votes with confidence 1.0."""
    img = Image.new("L", (128, 128), color=80)
    # Add simple pattern
    for i in range(20, 40):
        for j in range(20, 40):
            img.putpixel((i, j), 220)

    h1 = compute_multi_hashes(img)
    h2 = compute_multi_hashes(img)

    is_match, conf, details = compute_multi_hash_match(h1, h2)
    assert is_match is True
    assert conf == 1.0
    assert details["votes"]["total"] == 3
