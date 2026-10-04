import chromadb

chroma_client = chromadb.PersistentClient(path="D:/dataweaver/chroma_data")

datasets_collection = chroma_client.get_or_create_collection(name="dataset_embeddings")
duplicate_detection_collection = chroma_client.get_or_create_collection(name="duplicate_detection_embeddings")
profiling_collection = chroma_client.get_or_create_collection(name="profiling_embeddings")

def init_duplicate_collection():
    return chroma_client.get_or_create_collection(name="duplicate_detection_embeddings")

def get_profiling_collection():
    return chroma_client.get_or_create_collection(name="profiling_embeddings")