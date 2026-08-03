import chromadb

chroma_client = chromadb.PersistentClient(path="D:/dataweaver/chroma_data")

datasets_collection = chroma_client.get_or_create_collection(name="dataset_embeddings")