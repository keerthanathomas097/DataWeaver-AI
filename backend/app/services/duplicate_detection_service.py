import time
import uuid
import hashlib
import io
import os
import random
import numpy as np
import joblib
from PIL import Image
import imagehash
from sqlmodel import Session, select
from app.database import engine
from app.models.dataset import Dataset, DatasetDuplicateGroup, DatasetDuplicateGroupImage
from app.services.storage_service import minio_client
from app.config import settings
from app.services.embedding_service import generate_embeddings
from app.services.vector_service import duplicate_detection_collection

# pHash thresholds config (Independent constants)
PHASH_THRESHOLD_PHOTOGRAPHIC = 6      # Hamming distance <= 6 (similarity >= 90%)
PHASH_THRESHOLD_NON_PHOTOGRAPHIC = 2  # Stricter: Hamming distance <= 2 (similarity >= 96.8%)

# Load Logistic Regression Fusion Classifier
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml_artifacts", "fusion_classifier_logistic_regression.joblib")
fusion_classifier = joblib.load(MODEL_PATH)

class DSU:
    def __init__(self):
        self.parent = {}
    def find(self, i):
        if i not in self.parent:
            self.parent[i] = i
            return i
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])
        return self.parent[i]
    def union(self, i, j):
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i != root_j:
            self.parent[root_i] = root_j

def is_photographic(pil_img) -> bool:
    """
    Grayscale-mode check + RGB channel-variance heuristic computed directly from pixel data.
    """
    if pil_img.mode in ("1", "L", "CMYK"):
        return False
    
    img = pil_img.convert("RGB")
    arr = np.array(img)
    
    # Heuristic 1: Grayscale check in RGB space
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    diff_rg = np.mean(np.abs(r.astype(np.int16) - g.astype(np.int16)))
    diff_gb = np.mean(np.abs(g.astype(np.int16) - b.astype(np.int16)))
    diff_br = np.mean(np.abs(b.astype(np.int16) - r.astype(np.int16)))
    
    if (diff_rg + diff_gb + diff_br) / 3.0 < 5.0:
        return False  # Grayscale behaves as non-photographic (docs, line-art, etc.)
        
    # Heuristic 2: RGB channel variance check
    std_r = np.std(r)
    std_g = np.std(g)
    std_b = np.std(b)
    
    if std_r < 15.0 or std_g < 15.0 or std_b < 15.0:
        return False  # Uniform regions or digital drawings
        
    # Heuristic 3: Luminance variance check
    gray = 0.2989 * r + 0.5870 * g + 0.1140 * b
    if np.std(gray) < 20.0:
        return False  # High flat colors, scan documents, text, etc.
        
    return True


def check_cancellation(dataset_id: uuid.UUID) -> bool:
    """
    Check if the job has been cancelled.
    If so, clean up any partially written duplicate groups and embeddings from ChromaDB.
    """
    with Session(engine) as session:
        dataset = session.get(Dataset, dataset_id)
        if dataset and dataset.dataset_status == "cancelled":
            print(f"Cancellation requested for dataset: {dataset_id}. Cleaning up...")
            
            # Delete any duplicate groups/images created in this run
            old_groups = session.exec(
                select(DatasetDuplicateGroup).where(DatasetDuplicateGroup.dataset_id == dataset_id)
            ).all()
            for g in old_groups:
                old_images = session.exec(
                    select(DatasetDuplicateGroupImage).where(DatasetDuplicateGroupImage.duplicate_group_id == g.duplicate_group_id)
                ).all()
                for img in old_images:
                    session.delete(img)
                session.delete(g)
            session.commit()
            
            # Clean up ChromaDB embeddings
            try:
                duplicate_detection_collection.delete(where={"dataset_id": str(dataset_id)})
            except Exception as e:
                print(f"ChromaDB cleanup error on cancellation: {e}")
                
            return True
    return False


def process_non_photographic_domain(dataset_id: uuid.UUID, image_paths: list[str], session: Session, path_to_phash: dict):
    print(f"Dispatch handler: process_non_photographic_domain with {len(image_paths)} images...")
    grouped_paths = set()
    
    for i, path1 in enumerate(image_paths):
        if check_cancellation(dataset_id):
            return
            
        if path1 in grouped_paths or path1 not in path_to_phash:
            continue
            
        h1 = path_to_phash[path1]
        matches = [path1]
        for path2 in image_paths[i+1:]:
            if path2 in grouped_paths or path2 not in path_to_phash:
                continue
            h2 = path_to_phash[path2]
            # Stricter Hamming threshold for non-photographic domain
            if h1 - h2 <= PHASH_THRESHOLD_NON_PHOTOGRAPHIC:
                matches.append(path2)
                
        if len(matches) > 1:
            matches.sort()
            original_path = matches[0]
            
            sim_scores = [1.0 - (float(h1 - path_to_phash[p]) / 64.0) for p in matches if p != original_path]
            avg_sim = sum(sim_scores) / len(sim_scores) if sim_scores else 0.98
            
            group = DatasetDuplicateGroup(
                dataset_id=dataset_id,
                duplicate_group_detection_method="phash",
                duplicate_group_confidence_score=avg_sim,
                duplicate_group_domain_route="non_photographic"
            )
            session.add(group)
            session.commit()
            session.refresh(group)
            
            for p in matches:
                is_original = (p == original_path)
                img_row = DatasetDuplicateGroupImage(
                    duplicate_group_id=group.duplicate_group_id,
                    image_storage_path=p,
                    is_original_flag=is_original
                )
                session.add(img_row)
                grouped_paths.add(p)
    session.commit()


def process_photographic_domain(dataset_id: uuid.UUID, image_paths: list[str], session: Session, path_to_phash: dict):
    print(f"Dispatch handler: process_photographic_domain with {len(image_paths)} images...")
    
    # 1. pHash near-match pass with photographic threshold
    grouped_pHash_paths = set()
    phash_groups = []
    remaining_after_phash = []
    
    for i, path1 in enumerate(image_paths):
        if check_cancellation(dataset_id):
            return
            
        if path1 in grouped_pHash_paths or path1 not in path_to_phash:
            continue
            
        h1 = path_to_phash[path1]
        matches = [path1]
        for path2 in image_paths[i+1:]:
            if path2 in grouped_pHash_paths or path2 not in path_to_phash:
                continue
            h2 = path_to_phash[path2]
            if h1 - h2 <= PHASH_THRESHOLD_PHOTOGRAPHIC:
                matches.append(path2)
                
        if len(matches) > 1:
            matches.sort()
            original_path = matches[0]
            
            sim_scores = [1.0 - (float(h1 - path_to_phash[p]) / 64.0) for p in matches if p != original_path]
            avg_sim = sum(sim_scores) / len(sim_scores) if sim_scores else 0.95
            
            group = DatasetDuplicateGroup(
                dataset_id=dataset_id,
                duplicate_group_detection_method="phash",
                duplicate_group_confidence_score=avg_sim,
                duplicate_group_domain_route="photographic"
            )
            session.add(group)
            session.commit()
            session.refresh(group)
            
            for p in matches:
                is_original = (p == original_path)
                img_row = DatasetDuplicateGroupImage(
                    duplicate_group_id=group.duplicate_group_id,
                    image_storage_path=p,
                    is_original_flag=is_original
                )
                session.add(img_row)
                grouped_pHash_paths.add(p)
                
            phash_groups.append((group.duplicate_group_id, original_path))
            remaining_after_phash.append(original_path)
        else:
            remaining_after_phash.append(path1)
    session.commit()

    if check_cancellation(dataset_id):
        return

    # 2. Embedding generation + ChromaDB NN Query + Fusion Classifier Scoring
    if remaining_after_phash:
        print(f"Generating CLIP & DINOv2 embeddings for {len(remaining_after_phash)} photographic images...")
        pil_images = []
        valid_paths = []
        for path in remaining_after_phash:
            if check_cancellation(dataset_id):
                return
            try:
                response = minio_client.get_object(settings.minio_bucket_name, path)
                data = response.read()
                pil_images.append(Image.open(io.BytesIO(data)))
                valid_paths.append(path)
            except Exception as e:
                print(f"Error loading image {path} for embedding: {e}")
            finally:
                response.close()
                response.release_conn()
                
        if valid_paths:
            if check_cancellation(dataset_id):
                return
                
            embeddings = generate_embeddings(pil_images, batch_size=16)
            
            ids = [f"{dataset_id}_{p}" for p in valid_paths]
            metadatas = [{"dataset_id": str(dataset_id), "image_path": p} for p in valid_paths]
            
            duplicate_detection_collection.add(
                ids=ids,
                embeddings=embeddings.tolist(),
                metadatas=metadatas
            )
            
            # Query ChromaDB and evaluate fusion classifier
            dsu = DSU()
            matched_pairs = []
            
            for path in valid_paths:
                if check_cancellation(dataset_id):
                    return
                    
                item_id = f"{dataset_id}_{path}"
                result = duplicate_detection_collection.get(
                    ids=[item_id],
                    include=["embeddings"]
                )
                if result is None or result.get("embeddings") is None or len(result["embeddings"]) == 0:
                    continue
                    
                emb_query = np.array(result["embeddings"][0])
                
                query_res = duplicate_detection_collection.query(
                    query_embeddings=[emb_query.tolist()],
                    n_results=min(15, len(valid_paths)),
                    where={"dataset_id": str(dataset_id)},
                    include=["embeddings", "metadatas"]
                )
                
                if query_res is None or query_res.get("metadatas") is None or len(query_res["metadatas"]) == 0:
                    continue
                    
                candidates = query_res["metadatas"][0]
                cand_embeddings = query_res["embeddings"][0]
                
                for cand, emb_cand in zip(candidates, cand_embeddings):
                    cand_path = cand["image_path"]
                    if cand_path == path:
                        continue
                        
                    pair = tuple(sorted([path, cand_path]))
                    
                    phash1 = path_to_phash.get(path)
                    phash2 = path_to_phash.get(cand_path)
                    if phash1 is None or phash2 is None:
                        continue
                        
                    phash_sim = 1.0 - (float(phash1 - phash2) / 64.0)
                    
                    emb_query_np = np.array(emb_query)
                    emb_cand_np = np.array(emb_cand)
                    
                    clip1, dino1 = emb_query_np[:512], emb_query_np[512:]
                    clip2, dino2 = emb_cand_np[:512], emb_cand_np[512:]
                    
                    clip_sim = float(np.dot(clip1, clip2))
                    dino_sim = float(np.dot(dino1, dino2))
                    
                    prob = float(fusion_classifier.predict_proba([[phash_sim, dino_sim, clip_sim]])[0][1])
                    
                    if prob >= 0.5:
                        dsu.union(path, cand_path)
                        matched_pairs.append((path, cand_path, prob))
                        
            # Save final component groups
            components = {}
            for path in valid_paths:
                root = dsu.find(path)
                components.setdefault(root, []).append(path)
                
            for root, paths in components.items():
                if len(paths) < 2:
                    continue
                paths.sort()
                original_path = paths[0]
                
                comp_probs = [p for p1, p2, p in matched_pairs if dsu.find(p1) == root or dsu.find(p2) == root]
                avg_prob = sum(comp_probs) / len(comp_probs) if comp_probs else 0.85
                
                group = DatasetDuplicateGroup(
                    dataset_id=dataset_id,
                    duplicate_group_detection_method="fusion_classifier",
                    duplicate_group_confidence_score=avg_prob,
                    duplicate_group_domain_route="photographic"
                )
                session.add(group)
                session.commit()
                session.refresh(group)
                
                for p in paths:
                    is_original = (p == original_path)
                    img_row = DatasetDuplicateGroupImage(
                        duplicate_group_id=group.duplicate_group_id,
                        image_storage_path=p,
                        is_original_flag=is_original
                    )
                    session.add(img_row)
            session.commit()

# Dispatch Registry
DOMAIN_HANDLERS = {
    "photographic": process_photographic_domain,
    "non_photographic": process_non_photographic_domain,
}

def run_duplicate_detection_pipeline(dataset_id: uuid.UUID):
    print(f"Starting duplicate detection pipeline for dataset: {dataset_id}")
    
    if check_cancellation(dataset_id):
        return
        
    # 0. Cleanup old results for this dataset
    with Session(engine) as session:
        dataset = session.get(Dataset, dataset_id)
        if not dataset:
            print(f"Dataset not found: {dataset_id}")
            return
            
        dataset_storage_path = dataset.dataset_storage_path
        
        old_groups = session.exec(
            select(DatasetDuplicateGroup).where(DatasetDuplicateGroup.dataset_id == dataset_id)
        ).all()
        for g in old_groups:
            old_images = session.exec(
                select(DatasetDuplicateGroupImage).where(DatasetDuplicateGroupImage.duplicate_group_id == g.duplicate_group_id)
            ).all()
            for img in old_images:
                session.delete(img)
            session.delete(g)
        session.commit()
        
        # Delete old ChromaDB embeddings
        try:
            duplicate_detection_collection.delete(where={"dataset_id": str(dataset_id)})
        except Exception as e:
            print(f"No previous ChromaDB embeddings to delete: {e}")

    if check_cancellation(dataset_id):
        return

    try:
        # Retrieve all objects under the storage path from MinIO
        image_extensions = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
        objects = minio_client.list_objects(
            settings.minio_bucket_name,
            prefix=dataset_storage_path,
            recursive=True
        )
        image_paths = [obj.object_name for obj in objects if obj.object_name.lower().endswith(image_extensions)]
        print(f"Found {len(image_paths)} images to process in dataset {dataset_id}")
        
        if not image_paths:
            with Session(engine) as session:
                db_dataset = session.get(Dataset, dataset_id)
                if db_dataset.dataset_status == "cancelled":
                    return
                db_dataset.dataset_status = "duplicates_detected"
                db_dataset.dataset_domain = "photographic"
                session.add(db_dataset)
                session.commit()
            return

        # 1. SHA-256 Exact Match Pass
        print("Starting SHA-256 exact match pass...")
        sha_to_paths = {}
        for path in image_paths:
            if check_cancellation(dataset_id):
                return
            try:
                response = minio_client.get_object(settings.minio_bucket_name, path)
                data = response.read()
                sha = hashlib.sha256(data).hexdigest()
                sha_to_paths.setdefault(sha, []).append(path)
            except Exception as e:
                print(f"Error reading image {path} for SHA-256 check: {e}")
            finally:
                response.close()
                response.release_conn()

        exact_duplicate_paths = set()
        exact_hash_groups = []
        remaining_after_sha = []

        with Session(engine) as session:
            for sha, paths in sha_to_paths.items():
                if len(paths) > 1:
                    paths.sort()  # Sort alphabetically
                    original_path = paths[0]
                    
                    group = DatasetDuplicateGroup(
                        dataset_id=dataset_id,
                        duplicate_group_detection_method="exact_hash",
                        duplicate_group_confidence_score=1.0
                    )
                    session.add(group)
                    session.commit()
                    session.refresh(group)
                    
                    for path in paths:
                        is_original = (path == original_path)
                        img_row = DatasetDuplicateGroupImage(
                            duplicate_group_id=group.duplicate_group_id,
                            image_storage_path=path,
                            is_original_flag=is_original
                        )
                        session.add(img_row)
                        if not is_original:
                            exact_duplicate_paths.add(path)
                    
                    exact_hash_groups.append((group.duplicate_group_id, original_path))
                    remaining_after_sha.append(original_path)
                else:
                    remaining_after_sha.append(paths[0])
            session.commit()

        print(f"SHA-256 exact match pass finished. Grouped {len(exact_duplicate_paths)} duplicates.")

        if check_cancellation(dataset_id):
            return

        # 2. Extract pHash for all unique remaining images
        print("Extracting pHash for remaining images...")
        path_to_phash = {}
        for path in remaining_after_sha:
            if check_cancellation(dataset_id):
                return
            try:
                response = minio_client.get_object(settings.minio_bucket_name, path)
                data = response.read()
                pil_img = Image.open(io.BytesIO(data))
                phash = imagehash.phash(pil_img)
                path_to_phash[path] = phash
            except Exception as e:
                print(f"Error reading image {path} for pHash check: {e}")
            finally:
                response.close()
                response.release_conn()

        if check_cancellation(dataset_id):
            return

        # 3. Domain Sampling Heuristic Heuristics
        print("Running domain-level sampling heuristic...")
        sample_size = min(len(remaining_after_sha), 30)
        sample_paths = random.sample(remaining_after_sha, sample_size) if sample_size > 0 else []
        
        photographic_count = 0
        for path in sample_paths:
            if check_cancellation(dataset_id):
                return
            try:
                response = minio_client.get_object(settings.minio_bucket_name, path)
                data = response.read()
                pil_img = Image.open(io.BytesIO(data))
                if is_photographic(pil_img):
                    photographic_count += 1
            except Exception as e:
                print(f"Error checking domain of {path}: {e}")
            finally:
                response.close()
                response.release_conn()

        if check_cancellation(dataset_id):
            return

        with Session(engine) as session:
            db_dataset = session.get(Dataset, dataset_id)
            if sample_size > 0:
                ratio = photographic_count / sample_size
                if ratio >= 0.80:
                    db_dataset.dataset_domain = "photographic"
                elif ratio <= 0.20:
                    db_dataset.dataset_domain = "non_photographic"
                else:
                    db_dataset.dataset_domain = "mixed"
            else:
                db_dataset.dataset_domain = "photographic"
            session.add(db_dataset)
            session.commit()
            print(f"Dataset domain resolved to: {db_dataset.dataset_domain}")

        if check_cancellation(dataset_id):
            return

        # 4. Route remaining unique paths into photographic and non-photographic
        photographic_paths = []
        non_photographic_paths = []

        with Session(engine) as session:
            db_dataset = session.get(Dataset, dataset_id)
            
            for path in remaining_after_sha:
                if check_cancellation(dataset_id):
                    return
                    
                if db_dataset.dataset_domain == "photographic":
                    photographic_paths.append(path)
                elif db_dataset.dataset_domain == "non_photographic":
                    non_photographic_paths.append(path)
                else:
                    # Mixed: run heuristic per image
                    try:
                        response = minio_client.get_object(settings.minio_bucket_name, path)
                        data = response.read()
                        pil_img = Image.open(io.BytesIO(data))
                        if is_photographic(pil_img):
                            photographic_paths.append(path)
                        else:
                            non_photographic_paths.append(path)
                    except Exception as e:
                        print(f"Error during per-image domain routing for {path}: {e}")
                        photographic_paths.append(path)
                    finally:
                        response.close()
                        response.release_conn()

            # Update exact hash groups domain route
            for g_id, orig_path in exact_hash_groups:
                g_row = session.get(DatasetDuplicateGroup, g_id)
                if g_row:
                    if db_dataset.dataset_domain == "photographic":
                        g_row.duplicate_group_domain_route = "photographic"
                    elif db_dataset.dataset_domain == "non_photographic":
                        g_row.duplicate_group_domain_route = "non_photographic"
                    else:
                        try:
                            response = minio_client.get_object(settings.minio_bucket_name, orig_path)
                            data = response.read()
                            pil_img = Image.open(io.BytesIO(data))
                            g_row.duplicate_group_domain_route = "photographic" if is_photographic(pil_img) else "non_photographic"
                        except:
                            g_row.duplicate_group_domain_route = "photographic"
                        finally:
                            response.close()
                            response.release_conn()
                    session.add(g_row)
            session.commit()

        if check_cancellation(dataset_id):
            return

        # 5. Dispatch domain handlers
        with Session(engine) as session:
            db_dataset = session.get(Dataset, dataset_id)
            if db_dataset.dataset_domain == "mixed":
                if photographic_paths:
                    process_photographic_domain(dataset_id, photographic_paths, session, path_to_phash)
                if non_photographic_paths:
                    process_non_photographic_domain(dataset_id, non_photographic_paths, session, path_to_phash)
            else:
                handler = DOMAIN_HANDLERS.get(db_dataset.dataset_domain)
                if handler:
                    handler(dataset_id, remaining_after_sha, session, path_to_phash)

        if check_cancellation(dataset_id):
            return

        # Update dataset status to 'duplicates_detected'
        with Session(engine) as session:
            db_dataset = session.get(Dataset, dataset_id)
            if db_dataset.dataset_status == "cancelled":
                return
            db_dataset.dataset_status = "duplicates_detected"
            session.add(db_dataset)
            session.commit()
        print(f"Pipeline finished successfully for dataset: {dataset_id}")

    except Exception as e:
        # Check if cancellation was requested during error. If so, just return.
        with Session(engine) as session:
            db_dataset = session.get(Dataset, dataset_id)
            if db_dataset and db_dataset.dataset_status == "cancelled":
                print(f"Pipeline cancelled gracefully during exception handler: {e}")
                return
                
        print(f"Pipeline failed for dataset {dataset_id}: {str(e)}")
        with Session(engine) as session:
            db_dataset = session.get(Dataset, dataset_id)
            if db_dataset:
                db_dataset.dataset_status = "duplicate_detection_failed"
                session.add(db_dataset)
                session.commit()
        raise e
