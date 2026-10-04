import uuid
import datetime
from typing import Dict, List, Optional
import numpy as np
from app.services.vector_service import get_profiling_collection
from app.services.embedding_service import generate_dinov2_embeddings
from app.services.storage_service import get_image_as_pil

def get_or_create_profiling_embeddings(
    dataset_id: uuid.UUID,
    image_paths: List[str],
    batch_size: int = 16,
) -> Dict[str, List[float]]:
    """
    Retrieves cached DINOv2 embeddings from the 'profiling_embeddings' ChromaDB collection,
    downloads only missing images from MinIO, computes their 768-dim DINOv2 embeddings in batches of 16,
    persists the newly computed vectors in ChromaDB, and returns a unified map:
        { image_path: embedding_vector }
    """
    collection = get_profiling_collection()
    embeddings_map: Dict[str, List[float]] = {}
    if not image_paths:
        return embeddings_map

    dataset_id_str = str(dataset_id)
    id_to_path = {f"{dataset_id_str}_{p}": p for p in image_paths}
    all_ids = list(id_to_path.keys())

    # 1. Batch query existing embeddings from ChromaDB (chunked to avoid excessive URL/query length)
    chunk_size = 500
    for i in range(0, len(all_ids), chunk_size):
        chunk_ids = all_ids[i : i + chunk_size]
        try:
            res = collection.get(ids=chunk_ids, include=["embeddings", "metadatas"])
            if res and "ids" in res and res["ids"]:
                for found_id, emb in zip(res["ids"], res.get("embeddings", [])):
                    if found_id in id_to_path and emb is not None:
                        orig_path = id_to_path[found_id]
                        # Ensure embedding is python list of floats
                        if isinstance(emb, np.ndarray):
                            embeddings_map[orig_path] = emb.tolist()
                        else:
                            embeddings_map[orig_path] = list(emb)
        except Exception as e:
            print(f"Error querying existing profiling embeddings from ChromaDB: {e}")

    # 2. Determine missing image paths
    missing_paths = [p for p in image_paths if p not in embeddings_map]
    if not missing_paths:
        return embeddings_map

    print(f"Profiling embeddings: {len(embeddings_map)} cached, {len(missing_paths)} missing. Generating...")

    # 3. Stream missing images from MinIO and generate DINOv2 embeddings in batches of 16
    for i in range(0, len(missing_paths), batch_size):
        batch_paths = missing_paths[i : i + batch_size]
        valid_pil_images = []
        valid_paths = []

        for p in batch_paths:
            pil_img = get_image_as_pil(p)
            if pil_img is not None:
                valid_pil_images.append(pil_img)
                valid_paths.append(p)
            else:
                print(f"Skipping corrupt or unreadable image for profiling embedding: {p}")

        if not valid_pil_images:
            continue

        try:
            # Generate 768-dim DINOv2 embeddings
            embs_np = generate_dinov2_embeddings(valid_pil_images, batch_size=batch_size)
            embs_list = embs_np.tolist()

            batch_ids = [f"{dataset_id_str}_{p}" for p in valid_paths]
            batch_metadatas = [
                {
                    "dataset_id": dataset_id_str,
                    "image_path": p,
                    "is_photographic": True,
                    "created_at": datetime.datetime.utcnow().isoformat(),
                }
                for p in valid_paths
            ]

            # Persist missing embeddings to ChromaDB
            collection.add(
                ids=batch_ids,
                embeddings=embs_list,
                metadatas=batch_metadatas,
            )

            # Store in return dictionary
            for p, emb in zip(valid_paths, embs_list):
                embeddings_map[p] = emb

        except Exception as e:
            print(f"Error generating or saving profiling embeddings batch: {e}")

    return embeddings_map
