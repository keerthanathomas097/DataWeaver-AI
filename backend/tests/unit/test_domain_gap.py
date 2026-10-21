import io
import uuid
import pytest
import numpy as np
from PIL import Image
from unittest.mock import MagicMock, patch

from app.services.domain_gap_service import (
    extract_class_label,
    load_domain_gap_config,
    compute_domain_gap,
    compute_mmd_rbf,
)
from app.models.dataset import Dataset
from app.models.domain_gap import DomainSampleSet, DatasetDomainGapResult


def test_extract_class_label():
    storage = "datasets/1234/"
    # Standard class subfolder
    assert extract_class_label("datasets/1234/cats/cat_01.jpg", storage) == "cats"
    # Split folder prefix (train/val/test)
    assert extract_class_label("datasets/1234/train/dogs/dog_01.jpg", storage) == "dogs"
    assert extract_class_label("datasets/1234/val/birds/bird_01.png", storage) == "birds"
    # Flat image (no class subfolder)
    assert extract_class_label("datasets/1234/image_01.jpg", storage) is None
    # None handling
    assert extract_class_label("", storage) is None
    assert extract_class_label("datasets/1234/cats/cat_01.jpg", None) is None


def test_domain_gap_synthetic_embeddings_math():
    """
    Test that a sample identical to a dataset vector is covered (1.0 similarity),
    while an out-of-domain / distant vector is not covered.
    """
    dim = 768
    num_dataset = 50

    # Domain cluster centered around direction e0 = [1, 0, 0, ...]
    cluster_center = np.zeros(dim, dtype=np.float32)
    cluster_center[0] = 1.0

    # Dataset vectors cluster tightly around cluster_center (domain similarity ~0.8)
    rng = np.random.RandomState(42)
    noise = rng.randn(num_dataset, dim).astype(np.float32) * 0.15
    D = cluster_center + noise
    D = D / np.linalg.norm(D, axis=1, keepdims=True)

    # Sample 1: in-domain sample, identical to D[0] (sim = 1.0)
    sample_identical = D[0].copy()

    # Sample 2: out-of-domain sample orthogonal to the cluster center
    sample_distant = np.zeros(dim, dtype=np.float32)
    sample_distant[1] = 1.0  # e1 is completely orthogonal to e0

    S = np.stack([sample_identical, sample_distant])  # shape (2, 768)

    # Compute similarity matrix
    sims = np.dot(S, D.T)
    top1_sims = np.max(sims, axis=1)

    assert pytest.approx(top1_sims[0], abs=1e-5) == 1.0
    assert top1_sims[1] < 0.2

    # Baseline calculation on D
    baseline_distribution = []
    B_sims = np.dot(D, D.T)
    for j in range(num_dataset):
        row = B_sims[j].copy()
        row[j] = -1.0  # exclude self
        valid = row[row <= 0.97]
        baseline_distribution.append(float(np.max(valid)) if len(valid) > 0 else 0.0)

    threshold = float(np.percentile(baseline_distribution, 10))

    # Identical sample is covered
    assert top1_sims[0] >= threshold
    # Out-of-domain sample is not covered
    assert top1_sims[1] < threshold


def test_baseline_excludes_near_duplicates():
    """
    Ensures that exact or near-duplicates (> 0.97) between dataset images are excluded
    from setting an artificially inflated baseline.
    """
    dim = 768
    rng = np.random.RandomState(42)
    D = rng.randn(20, dim).astype(np.float32)
    D = D / np.linalg.norm(D, axis=1, keepdims=True)

    # Artificially create a near clone of D[0] at D[1] with 0.99 similarity
    orthogonal = rng.randn(dim).astype(np.float32)
    orthogonal -= np.dot(orthogonal, D[0]) * D[0]
    orthogonal /= np.linalg.norm(orthogonal)

    # 0.99 * D[0] + sqrt(1 - 0.99^2) * orthogonal
    clone = 0.99 * D[0] + np.sqrt(1 - 0.99**2) * orthogonal
    D[1] = clone.astype(np.float32)

    sim = float(np.dot(D[0], D[1]))
    assert sim >= 0.985

    # Check that baseline calculation for index 0 excludes index 1 (> 0.97)
    row = np.dot(D, D[0])
    row[0] = -1.0  # exclude self
    valid_neighbors = row[row <= 0.97]

    assert len(valid_neighbors) > 0
    max_valid = np.max(valid_neighbors)
    assert max_valid <= 0.97


def test_verdict_bands_logic():
    config = load_domain_gap_config()
    low_min = config["verdict_bands"]["low_gap_min_pct"]
    mod_min = config["verdict_bands"]["moderate_min_pct"]

    def get_verdict(pct):
        if pct >= low_min:
            return "Low gap"
        elif pct >= mod_min:
            return "Moderate gap"
        return "High gap"

    assert get_verdict(90.0) == "Low gap"
    assert get_verdict(80.0) == "Low gap"
    assert get_verdict(79.9) == "Moderate gap"
    assert get_verdict(50.0) == "Moderate gap"
    assert get_verdict(49.9) == "High gap"
    assert get_verdict(10.0) == "High gap"


@patch("app.services.domain_gap_service.get_or_create_profiling_embeddings")
@patch("app.services.domain_gap_service.calculate_dataset_file_checksum")
def test_compute_domain_gap_end_to_end(mock_checksum, mock_get_embs):
    dataset_id = uuid.uuid4()
    sample_set_id = uuid.uuid4()
    dim = 768

    mock_dataset = Dataset(
        dataset_id=dataset_id,
        workspace_id=uuid.uuid4(),
        dataset_name="Test Vehicles",
        dataset_source_type="kaggle",
        dataset_image_count=35,
        dataset_storage_path="datasets/test_vehicles/",
        dataset_status="completed",
    )

    # 35 dataset vectors in a cluster
    center = np.zeros(dim, dtype=np.float32)
    center[0] = 1.0

    rng = np.random.RandomState(42)
    d_vectors = center + rng.randn(35, dim).astype(np.float32) * 0.1
    d_vectors = d_vectors / np.linalg.norm(d_vectors, axis=1, keepdims=True)

    dataset_paths = [f"datasets/test_vehicles/cars/img_{i:02d}.jpg" for i in range(35)]
    embs_map = {p: d_vectors[i].tolist() for i, p in enumerate(dataset_paths)}

    mock_checksum.return_value = ("chk_12345", dataset_paths, 100000)
    mock_get_embs.return_value = embs_map

    # 10 sample vectors: 8 identical to dataset points, 2 orthogonal
    s_vectors = []
    for i in range(8):
        s_vectors.append(d_vectors[i].tolist())
    for i in range(2):
        far_vec = np.zeros(dim, dtype=np.float32)
        far_vec[1 + i] = 1.0
        s_vectors.append(far_vec.tolist())

    mock_sample_set = DomainSampleSet(
        sample_set_id=sample_set_id,
        workspace_id=mock_dataset.workspace_id,
        created_by=uuid.uuid4(),
        image_paths=[f"domain-samples/ws/ss/{i:02d}.jpg" for i in range(10)],
        embeddings=s_vectors,
        sample_count=10,
    )

    mock_session = MagicMock()
    def mock_get(model, pk):
        if model == Dataset:
            return mock_dataset
        if model == DomainSampleSet:
            return mock_sample_set
        return None
    mock_session.get.side_effect = mock_get

    mock_exec = MagicMock()
    mock_exec.first.return_value = None
    mock_session.exec.return_value = mock_exec

    result = compute_domain_gap(
        session=mock_session,
        dataset_id=dataset_id,
        sample_set_id=sample_set_id,
        force_recompute=True,
    )

    assert "coverage_pct" in result
    assert result["coverage_pct"] >= 70.0
    assert result["verdict"] in ["Low gap", "Moderate gap"]
    assert len(result["samples"]) == 10
    assert len(result["dataset_points"]) > 0
    assert result["projection_method"] in ["umap", "pca"]

    # Verify nearest top 3 are present
    first_sample = result["samples"][0]
    assert len(first_sample["nearest"]) == 3
    assert first_sample["nearest"][0]["similarity"] == 1.0
    assert first_sample["covered"] is True

    # Out of domain sample should be uncovered
    last_sample = result["samples"][9]
    assert last_sample["covered"] is False

    # Verify baseline_points added for Target Chart
    assert "baseline_points" in result
    assert isinstance(result["baseline_points"], list)
    assert len(result["baseline_points"]) <= 500
    for bp in result["baseline_points"]:
        assert "similarity" in bp
        assert -1.0 <= bp["similarity"] <= 1.0
        assert "class_label" in bp

    mock_session.add.assert_called()
    mock_session.commit.assert_called()


def test_domain_gap_baseline_points_bounded_and_valid():
    """Verify baseline_points field properties, bounded length, valid ranges, and preservation of existing fields."""
    dim = 768
    num_dataset = 60
    dataset_id = uuid.uuid4()
    sample_set_id = uuid.uuid4()

    rng = np.random.RandomState(42)
    d_vectors = rng.randn(num_dataset, dim).astype(np.float32)
    d_vectors = d_vectors / np.linalg.norm(d_vectors, axis=1, keepdims=True)

    d_paths = [f"datasets/test_ds/class_{i % 3}/img_{i:03d}.jpg" for i in range(num_dataset)]
    embeddings_map = {d_paths[i]: d_vectors[i].tolist() for i in range(num_dataset)}

    s_vectors = d_vectors[:5].tolist()
    s_paths = [f"samples/sample_{i}.jpg" for i in range(5)]

    mock_dataset = MagicMock(spec=Dataset)
    mock_dataset.dataset_id = dataset_id
    mock_dataset.dataset_storage_path = "datasets/test_ds/"

    mock_sample_set = MagicMock(spec=DomainSampleSet)
    mock_sample_set.sample_set_id = sample_set_id
    mock_sample_set.image_paths = s_paths
    mock_sample_set.embeddings = s_vectors
    mock_sample_set.sample_count = 5

    mock_session = MagicMock()
    def mock_get(model, pk):
        if model == Dataset:
            return mock_dataset
        if model == DomainSampleSet:
            return mock_sample_set
        return None
    mock_session.get.side_effect = mock_get

    mock_exec = MagicMock()
    mock_exec.first.return_value = None
    mock_session.exec.return_value = mock_exec

    with patch("app.services.domain_gap_service.calculate_dataset_file_checksum", return_value=("dummy_chk", d_paths, {})):
        with patch("app.services.domain_gap_service.get_or_create_profiling_embeddings", return_value=embeddings_map):
            with patch("app.services.domain_gap_service.attach_presigned_urls", side_effect=lambda r: r):
                res = compute_domain_gap(
                    session=mock_session,
                    dataset_id=dataset_id,
                    sample_set_id=sample_set_id,
                    force_recompute=True,
                )

    # 1. New field present
    assert "baseline_points" in res
    bp_list = res["baseline_points"]
    assert isinstance(bp_list, list)

    # 2. Bounded length (<= 500)
    assert len(bp_list) <= 500
    assert len(bp_list) == num_dataset

    # 3. Values within [-1, 1], 4 decimals, class_label extracted
    for bp in bp_list:
        assert isinstance(bp["similarity"], float)
        assert -1.0 <= bp["similarity"] <= 1.0
        assert bp["class_label"] in ["class_0", "class_1", "class_2"]

    # 4. Pre-existing fields preserved exactly
    expected_keys = {
        "coverage_pct",
        "verdict",
        "counts",
        "baseline",
        "baseline_points",
        "mean_nearest_similarity",
        "median_nearest_similarity",
        "centroid_similarity",
        "distribution_distance",
        "caveats",
        "projection_method",
        "samples",
        "dataset_points",
    }
    for k in expected_keys:
        assert k in res



def test_compute_mmd_rbf_identical_distributions():
    """MMD between identical samples should be practically zero."""
    dim = 768
    rng = np.random.RandomState(42)
    # Generate 40 vectors from Gaussian distribution
    data = rng.randn(40, dim).astype(np.float32)
    data = data / np.linalg.norm(data, axis=1, keepdims=True)

    # Split into source and target from identical distribution
    target = data[:20]
    source = data[20:]

    mmd = compute_mmd_rbf(target, source)
    assert isinstance(mmd, float)
    # Sampling variance on finite sets is small (< 0.15)
    assert mmd < 0.15


def test_compute_mmd_rbf_separated_distributions():
    """MMD between separated/orthogonal clusters should be strictly greater than within-cluster MMD."""
    dim = 768
    rng = np.random.RandomState(42)

    # Source cluster around e0
    e0 = np.zeros(dim, dtype=np.float32)
    e0[0] = 1.0
    source = e0 + rng.randn(30, dim).astype(np.float32) * (0.1 / np.sqrt(dim))
    source = source / np.linalg.norm(source, axis=1, keepdims=True)

    # Target cluster around orthogonal e1
    e1 = np.zeros(dim, dtype=np.float32)
    e1[1] = 1.0
    target = e1 + rng.randn(15, dim).astype(np.float32) * (0.1 / np.sqrt(dim))
    target = target / np.linalg.norm(target, axis=1, keepdims=True)

    mmd = compute_mmd_rbf(target, source)
    assert mmd > 0.4


def test_compute_mmd_rbf_small_sample():
    """MMD should handle small sample sizes (M=1, M=2) gracefully without zero division."""
    dim = 768
    rng = np.random.RandomState(42)
    source = rng.randn(10, dim).astype(np.float32)
    source = source / np.linalg.norm(source, axis=1, keepdims=True)

    target_single = source[0:1]
    mmd_single = compute_mmd_rbf(target_single, source)
    assert isinstance(mmd_single, float)
    assert mmd_single >= 0.0

    target_empty = np.empty((0, dim), dtype=np.float32)
    assert compute_mmd_rbf(target_empty, source) == 0.0

