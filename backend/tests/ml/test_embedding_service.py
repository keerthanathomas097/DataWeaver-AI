import numpy as np
import pytest
from unittest.mock import MagicMock, patch
import torch
from app.services import embedding_service
from tests.fixtures.synthetic_images import create_natural_photo_image


@pytest.mark.ml
def test_generate_embeddings_empty_list():
    embeddings = embedding_service.generate_embeddings([])
    assert embeddings.shape == (0, 1280)
    assert embeddings.dtype == np.float32


@pytest.mark.ml
def test_generate_embeddings_with_mocked_models():
    # Mock CLIP output (512-dim)
    mock_clip_proc = MagicMock()
    mock_clip_proc.return_value = {"pixel_values": torch.zeros((2, 3, 224, 224))}
    
    mock_clip_model = MagicMock()
    mock_clip_features = torch.randn((2, 512))
    mock_clip_model.get_image_features.return_value = mock_clip_features
    
    # Mock DINOv2 output (768-dim)
    mock_dino_proc = MagicMock()
    mock_dino_proc.return_value = {"pixel_values": torch.zeros((2, 3, 224, 224))}
    
    mock_dino_model = MagicMock()
    mock_dino_output = MagicMock()
    mock_dino_output.last_hidden_state = torch.randn((2, 10, 768))
    mock_dino_model.return_value = mock_dino_output
    
    mock_models_dict = {
        "device": "cpu",
        "clip_processor": mock_clip_proc,
        "clip_model": mock_clip_model,
        "dino_processor": mock_dino_proc,
        "dino_model": mock_dino_model,
    }
    
    with patch("app.services.embedding_service.get_models", return_value=mock_models_dict):
        img1 = create_natural_photo_image(size=(64, 64), seed=1)
        img2 = create_natural_photo_image(size=(64, 64), seed=2)
        
        embeddings = embedding_service.generate_embeddings([img1, img2], batch_size=2)
        
        assert embeddings.shape == (2, 1280)
        assert embeddings.dtype == np.float32
        
        clip_part = embeddings[:, :512]
        dino_part = embeddings[:, 512:]
        
        clip_norms = np.linalg.norm(clip_part, axis=1)
        dino_norms = np.linalg.norm(dino_part, axis=1)
        
        assert np.allclose(clip_norms, [1.0, 1.0], atol=1e-3)
        assert np.allclose(dino_norms, [1.0, 1.0], atol=1e-3)
