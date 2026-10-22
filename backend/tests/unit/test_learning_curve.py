import uuid
import pytest
import numpy as np
from unittest.mock import MagicMock, patch
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.models.user import User
from app.models.workspace import Workspace
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.models.profiling import DatasetProfilingResult
from app.models.learning_curve import DatasetLearningCurveResult
from app.services.learning_curve_service import (
    load_learning_curve_config,
    compute_params_hash,
    check_eligibility,
    resolve_verdict,
    compute_learning_curve,
)


@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Create user and workspace
        user = User(user_email="test@example.com", user_password_hash="pwd")
        session.add(user)
        session.commit()
        session.refresh(user)

        ws = Workspace(
            user_id=user.user_id,
            workspace_name="Test WS",
            workspace_research_domain="Computer Vision",
        )
        session.add(ws)
        session.commit()
        session.refresh(ws)
        session.default_workspace_id = ws.workspace_id
        yield session


def test_verdict_boundary_values():
    config = load_learning_curve_config()
    num_classes = 2
    chance = 0.50  # 1 / 2

    # 1. Weak signal: final <= chance + weak_signal_margin (0.50 + 0.10 = 0.60)
    fracs_weak = [
        {"fraction": 0.10, "score_mean": 0.52, "score_std": 0.02, "skipped": False},
        {"fraction": 0.25, "score_mean": 0.54, "score_std": 0.02, "skipped": False},
        {"fraction": 0.50, "score_mean": 0.55, "score_std": 0.02, "skipped": False},
        {"fraction": 0.75, "score_mean": 0.58, "score_std": 0.02, "skipped": False},
        {"fraction": 1.00, "score_mean": 0.59, "score_std": 0.02, "skipped": False},  # <= 0.60
    ]
    verdict, gain = resolve_verdict(fracs_weak, num_classes, config)
    assert verdict == "weak_signal"
    assert gain == round(0.59 - 0.58, 4)

    # 2. Flat from start: first >= final - flat_from_start_tolerance (final=0.95, first=0.94 >= 0.95-0.02)
    fracs_flat = [
        {"fraction": 0.10, "score_mean": 0.94, "score_std": 0.01, "skipped": False},
        {"fraction": 0.25, "score_mean": 0.945, "score_std": 0.01, "skipped": False},
        {"fraction": 0.50, "score_mean": 0.95, "score_std": 0.01, "skipped": False},
        {"fraction": 0.75, "score_mean": 0.95, "score_std": 0.01, "skipped": False},
        {"fraction": 1.00, "score_mean": 0.95, "score_std": 0.01, "skipped": False},
    ]
    verdict, gain = resolve_verdict(fracs_flat, num_classes, config)
    assert verdict == "flat_from_start"

    # 3. Still improving: final - prev >= 0.03 AND final - prev > final_std
    # final=0.88, prev=0.83 -> gain=0.05 >= 0.03, final_std=0.02 < 0.05
    fracs_improving = [
        {"fraction": 0.10, "score_mean": 0.65, "score_std": 0.03, "skipped": False},
        {"fraction": 0.25, "score_mean": 0.72, "score_std": 0.03, "skipped": False},
        {"fraction": 0.50, "score_mean": 0.78, "score_std": 0.02, "skipped": False},
        {"fraction": 0.75, "score_mean": 0.83, "score_std": 0.02, "skipped": False},
        {"fraction": 1.00, "score_mean": 0.88, "score_std": 0.02, "skipped": False},
    ]
    verdict, gain = resolve_verdict(fracs_improving, num_classes, config)
    assert verdict == "still_improving"
    assert gain == 0.05

    # 4. Levelling off: gained earlier, but last step gain < 0.03
    fracs_levelling = [
        {"fraction": 0.10, "score_mean": 0.65, "score_std": 0.03, "skipped": False},
        {"fraction": 0.25, "score_mean": 0.75, "score_std": 0.03, "skipped": False},
        {"fraction": 0.50, "score_mean": 0.84, "score_std": 0.02, "skipped": False},
        {"fraction": 0.75, "score_mean": 0.87, "score_std": 0.02, "skipped": False},
        {"fraction": 1.00, "score_mean": 0.88, "score_std": 0.02, "skipped": False},  # gain=0.01 < 0.03
    ]
    verdict, gain = resolve_verdict(fracs_levelling, num_classes, config)
    assert verdict == "levelling_off"
    assert gain == 0.01


def test_params_hash_determinism():
    config1 = load_learning_curve_config()
    config2 = load_learning_curve_config()
    hash1 = compute_params_hash(config1)
    hash2 = compute_params_hash(config2)
    assert hash1 == hash2
    assert len(hash1) == 64  # sha256 hex string


def test_eligibility_reasons(test_db_session):
    session = test_db_session
    dataset = Dataset(
        dataset_name="Test DS",
        dataset_source_type="kaggle",
        dataset_storage_path="datasets/test_ds",
        workspace_id=session.default_workspace_id,
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    # 1. not_profiled
    ok, reason, msg, _ = check_eligibility(dataset.dataset_id, session)
    assert not ok
    assert reason == "not_profiled"

    # Add completed profile
    prof = DatasetProfilingResult(
        dataset_id=dataset.dataset_id,
        status="completed",
        file_list_checksum="chk123",
    )
    session.add(prof)
    session.commit()

    # Mock Chroma collection with no embeddings
    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        mock_coll.get.return_value = {"ids": []}
        mock_coll_fn.return_value = mock_coll

        ok, reason, msg, _ = check_eligibility(dataset.dataset_id, session)
        assert not ok
        assert reason == "not_profiled"

    # 2. no_labels: images are in root folder without subfolders
    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        mock_coll.get.side_effect = [
            {"ids": ["id1", "id2"]},
            {"metadatas": [{"image_path": "datasets/test_ds/img1.png"}, {"image_path": "datasets/test_ds/img2.png"}]},
        ]
        mock_coll_fn.return_value = mock_coll

        ok, reason, msg, _ = check_eligibility(dataset.dataset_id, session)
        assert not ok
        assert reason == "no_labels"

    # 3. too_few_classes: only 1 class detected
    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        mock_coll.get.side_effect = [
            {"ids": ["id1", "id2"]},
            {"metadatas": [{"image_path": "datasets/test_ds/cats/img1.png"}, {"image_path": "datasets/test_ds/cats/img2.png"}]},
        ]
        mock_coll_fn.return_value = mock_coll

        ok, reason, msg, _ = check_eligibility(dataset.dataset_id, session)
        assert not ok
        assert reason == "too_few_classes"

    # 4. too_few_images: 2 classes, but one class has only 5 images (< 20)
    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        cats = [{"image_path": f"datasets/test_ds/cats/img_{i}.png"} for i in range(25)]
        dogs = [{"image_path": f"datasets/test_ds/dogs/img_{i}.png"} for i in range(5)]
        mock_coll.get.side_effect = [
            {"ids": ["id1"]},
            {"metadatas": cats + dogs},
        ]
        mock_coll_fn.return_value = mock_coll

        ok, reason, msg, _ = check_eligibility(dataset.dataset_id, session)
        assert not ok
        assert reason == "too_few_images"

    # 5. Eligible: 2 classes with >= 20 images each
    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        cats = [{"image_path": f"datasets/test_ds/cats/img_{i}.png"} for i in range(30)]
        dogs = [{"image_path": f"datasets/test_ds/dogs/img_{i}.png"} for i in range(30)]
        mock_coll.get.side_effect = [
            {"ids": ["id1"]},
            {"metadatas": cats + dogs},
        ]
        mock_coll_fn.return_value = mock_coll

        ok, reason, msg, details = check_eligibility(dataset.dataset_id, session)
        assert ok
        assert reason is None
        assert details["class_counts"]["cats"] == 30
        assert details["class_counts"]["dogs"] == 30


def test_synthetic_separable_classes(test_db_session):
    """Clearly separable classes should give flat_from_start."""
    session = test_db_session
    dataset = Dataset(
        dataset_name="Separable DS",
        dataset_source_type="kaggle",
        dataset_storage_path="datasets/separable",
        workspace_id=session.default_workspace_id,
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    prof = DatasetProfilingResult(
        dataset_id=dataset.dataset_id,
        status="completed",
        file_list_checksum="chk_sep",
    )
    session.add(prof)
    session.commit()

    rng = np.random.RandomState(42)
    n_per_class = 40
    # Class 0 centered at -5.0, Class 1 centered at +5.0 (perfectly separable)
    emb_c0 = rng.normal(loc=-5.0, scale=0.5, size=(n_per_class, 16))
    emb_c1 = rng.normal(loc=5.0, scale=0.5, size=(n_per_class, 16))
    all_emb = np.vstack([emb_c0, emb_c1]).tolist()

    metadatas = (
        [{"image_path": f"datasets/separable/classA/img_{i}.jpg"} for i in range(n_per_class)]
        + [{"image_path": f"datasets/separable/classB/img_{i}.jpg"} for i in range(n_per_class)]
    )

    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        mock_coll.get.return_value = {"embeddings": all_emb, "metadatas": metadatas}
        mock_coll_fn.return_value = mock_coll

        config = load_learning_curve_config()
        config["n_repeats"] = 2  # speed up test
        config["n_splits"] = 3
        res = compute_learning_curve(dataset.dataset_id, session, config)

        assert res["num_classes"] == 2
        assert res["verdict"] == "flat_from_start"
        assert res["final_score"] >= 0.95
        assert res["fractions"][0]["score_mean"] >= 0.95


def test_synthetic_random_labels_weak_signal(test_db_session):
    """Pure random noise with random labels gives weak_signal near chance (0.5)."""
    session = test_db_session
    dataset = Dataset(
        dataset_name="Random DS",
        dataset_source_type="kaggle",
        dataset_storage_path="datasets/random",
        workspace_id=session.default_workspace_id,
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    prof = DatasetProfilingResult(
        dataset_id=dataset.dataset_id,
        status="completed",
        file_list_checksum="chk_rnd",
    )
    session.add(prof)
    session.commit()

    rng = np.random.RandomState(123)
    n_per_class = 30
    # Same distribution for both classes
    emb_c0 = rng.normal(loc=0.0, scale=1.0, size=(n_per_class, 16))
    emb_c1 = rng.normal(loc=0.0, scale=1.0, size=(n_per_class, 16))
    all_emb = np.vstack([emb_c0, emb_c1]).tolist()

    metadatas = (
        [{"image_path": f"datasets/random/classA/img_{i}.jpg"} for i in range(n_per_class)]
        + [{"image_path": f"datasets/random/classB/img_{i}.jpg"} for i in range(n_per_class)]
    )

    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        mock_coll.get.return_value = {"embeddings": all_emb, "metadatas": metadatas}
        mock_coll_fn.return_value = mock_coll

        config = load_learning_curve_config()
        config["n_repeats"] = 2
        config["n_splits"] = 3
        res = compute_learning_curve(dataset.dataset_id, session, config)

        assert res["verdict"] == "weak_signal"
        # Chance is 0.5, final score should be <= chance + 0.10 = 0.60
        assert res["final_score"] <= (res["chance_level"] + config["weak_signal_margin"])


def test_giant_group_fallback_trigger(test_db_session):
    """When a duplicate group exceeds max_group_share (25%), fallback to none_fallback."""
    session = test_db_session
    dataset = Dataset(
        dataset_name="Giant Group DS",
        dataset_source_type="kaggle",
        dataset_storage_path="datasets/giant",
        workspace_id=session.default_workspace_id,
    )
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    prof = DatasetProfilingResult(
        dataset_id=dataset.dataset_id,
        status="completed",
        file_list_checksum="chk_giant",
    )
    session.add(prof)
    session.commit()

    # 60 images total: 30 classA, 30 classB
    # Create a duplicate group with 20 classA images (20/60 = 33.3% > 25% max_group_share)
    dup_group = DatasetDuplicateGroup(
        dataset_id=dataset.dataset_id,
        duplicate_group_detection_method="dino",
        duplicate_group_confidence_score=0.99,
    )
    session.add(dup_group)
    session.commit()
    session.refresh(dup_group)

    for i in range(20):
        img_row = DatasetDuplicateGroupImage(
            duplicate_group_id=dup_group.duplicate_group_id,
            image_storage_path=f"datasets/giant/classA/img_{i}.jpg",
        )
        session.add(img_row)
    session.commit()

    rng = np.random.RandomState(42)
    all_emb = rng.normal(0, 1, size=(60, 16)).tolist()
    metadatas = (
        [{"image_path": f"datasets/giant/classA/img_{i}.jpg"} for i in range(30)]
        + [{"image_path": f"datasets/giant/classB/img_{i}.jpg"} for i in range(30)]
    )

    with patch("app.services.learning_curve_service.get_profiling_collection") as mock_coll_fn:
        mock_coll = MagicMock()
        mock_coll.get.return_value = {"embeddings": all_emb, "metadatas": metadatas}
        mock_coll_fn.return_value = mock_coll

        config = load_learning_curve_config()
        config["n_repeats"] = 1
        config["n_splits"] = 3
        res = compute_learning_curve(dataset.dataset_id, session, config)

        assert res["grouping"] == "none_fallback"
        assert "grouping_fallback" in res["caveats"]


def test_no_duplicate_group_crosses_splits(test_db_session):
    """Checks that when duplicate groups are used, no group appears on both sides of any split."""
    from sklearn.model_selection import StratifiedGroupKFold

    # 10 groups, each group has 4 images with identical labels
    groups = []
    y = []
    for g in range(10):
        label = 0 if g < 5 else 1
        for _ in range(4):
            groups.append(f"group_{g}")
            y.append(label)

    X = np.zeros((len(y), 4))
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)

    for train_idx, val_idx in sgkf.split(X, y, groups=groups):
        train_groups = set(np.array(groups)[train_idx])
        val_groups = set(np.array(groups)[val_idx])
        # Intersection must be empty!
        assert len(train_groups.intersection(val_groups)) == 0
