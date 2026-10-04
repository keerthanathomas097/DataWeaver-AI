import os
import joblib
import numpy as np
import pytest


@pytest.mark.ml
def test_fusion_classifier_artifact_loading():
    model_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "app", "ml_artifacts", "fusion_classifier_logistic_regression.joblib"
    )
    assert os.path.exists(model_path), f"Fusion classifier model file missing at {model_path}"
    
    model = joblib.load(model_path)
    assert hasattr(model, "predict_proba")
    assert hasattr(model, "coef_")


@pytest.mark.ml
def test_fusion_classifier_prediction_probabilities():
    model_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "app", "ml_artifacts", "fusion_classifier_logistic_regression.joblib"
    )
    model = joblib.load(model_path)
    
    # Feature vector: [phash_sim, dino_sim, clip_sim]
    high_similarity = [[0.98, 0.95, 0.96]]
    prob_high = model.predict_proba(high_similarity)[0][1]
    assert prob_high >= 0.5, f"Expected duplicate classification for high similarity, got {prob_high}"
    
    low_similarity = [[0.20, 0.15, 0.10]]
    prob_low = model.predict_proba(low_similarity)[0][1]
    assert prob_low < 0.5, f"Expected non-duplicate classification for low similarity, got {prob_low}"


@pytest.mark.ml
def test_fusion_classifier_monotonic_behavior():
    model_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "app", "ml_artifacts", "fusion_classifier_logistic_regression.joblib"
    )
    model = joblib.load(model_path)
    
    # Higher similarity should always yield higher duplicate probability
    prob_near = model.predict_proba([[0.95, 0.92, 0.94]])[0][1]
    prob_far = model.predict_proba([[0.40, 0.40, 0.40]])[0][1]
    assert prob_near > prob_far
