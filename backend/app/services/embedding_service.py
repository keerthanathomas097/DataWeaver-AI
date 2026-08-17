import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel, AutoImageProcessor, Dinov2Model
import numpy as np

# Cache for loaded models to avoid re-loading on each service call
_models = {}

def get_models():
    global _models
    if not _models:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Loading embedding models on device: {device}...")
        
        # Load CLIP ViT-B/32
        clip_model_name = "openai/clip-vit-base-patch32"
        clip_processor = CLIPProcessor.from_pretrained(clip_model_name)
        clip_model = CLIPModel.from_pretrained(clip_model_name)
        
        # Load DINOv2 ViT-B/14
        dino_model_name = "facebook/dinov2-vitb14"
        dino_processor = AutoImageProcessor.from_pretrained(dino_model_name)
        dino_model = Dinov2Model.from_pretrained(dino_model_name)
        
        # Place models on device and convert to half precision if CUDA is available
        if device == "cuda":
            clip_model = clip_model.half().to(device)
            dino_model = dino_model.half().to(device)
        else:
            clip_model = clip_model.to(device)
            dino_model = dino_model.to(device)
            
        clip_model.eval()
        dino_model.eval()
        
        _models = {
            "device": device,
            "clip_processor": clip_processor,
            "clip_model": clip_model,
            "dino_processor": dino_processor,
            "dino_model": dino_model
        }
    return _models

def generate_embeddings(images: list[Image.Image], batch_size: int = 16) -> np.ndarray:
    """
    Generate concatenated CLIP and DINOv2 embeddings for a list of PIL Images.
    Returns:
        np.ndarray of shape (len(images), 1280)
    """
    models = get_models()
    device = models["device"]
    clip_proc = models["clip_processor"]
    clip_model = models["clip_model"]
    dino_proc = models["dino_processor"]
    dino_model = models["dino_model"]
    
    all_embeddings = []
    
    for i in range(0, len(images), batch_size):
        batch = images[i : i + batch_size]
        
        # Ensure all images are RGB
        rgb_batch = [img.convert("RGB") if img.mode != "RGB" else img for img in batch]
        
        # 1. CLIP Embeddings
        clip_inputs = clip_proc(images=rgb_batch, return_tensors="pt").to(device)
        if device == "cuda":
            clip_inputs = {k: v.half() if v.dtype == torch.float32 else v for k, v in clip_inputs.items()}
            
        with torch.no_grad():
            clip_features = clip_model.get_image_features(**clip_inputs)
            # L2 Normalize the features
            clip_features = clip_features / clip_features.norm(dim=-1, keepdim=True)
            clip_features_np = clip_features.cpu().numpy().astype(np.float32)
            
        # 2. DINOv2 Embeddings
        dino_inputs = dino_proc(images=rgb_batch, return_tensors="pt").to(device)
        if device == "cuda":
            dino_inputs = {k: v.half() if v.dtype == torch.float32 else v for k, v in dino_inputs.items()}
            
        with torch.no_grad():
            dino_outputs = dino_model(**dino_inputs)
            # CLS token is at index 0 of last_hidden_state
            dino_features = dino_outputs.last_hidden_state[:, 0, :]
            # L2 Normalize the features
            dino_features = dino_features / dino_features.norm(dim=-1, keepdim=True)
            dino_features_np = dino_features.cpu().numpy().astype(np.float32)
            
        # 3. Concatenate (CLIP 512 + DINOv2 768 = 1280)
        batch_embeddings = np.concatenate([clip_features_np, dino_features_np], axis=-1)
        all_embeddings.append(batch_embeddings)
        
    if not all_embeddings:
        return np.empty((0, 1280), dtype=np.float32)
        
    return np.concatenate(all_embeddings, axis=0)
