import pytest
from app.services.vector_service import init_duplicate_collection, duplicate_detection_collection


@pytest.mark.integration
def test_chroma_collection_initialization():
    col = init_duplicate_collection()
    assert col is not None
    assert col.name == "duplicate_detection_embeddings"


@pytest.mark.integration
def test_chroma_add_query_and_delete():
    col = duplicate_detection_collection
    
    # Add embeddings
    emb1 = [0.1] * 1280
    emb2 = [0.9] * 1280
    
    col.add(
        ids=["doc_1", "doc_2"],
        embeddings=[emb1, emb2],
        metadatas=[{"dataset_id": "ds_100", "image_path": "path1.jpg"}, {"dataset_id": "ds_100", "image_path": "path2.jpg"}]
    )
    
    # Query collection
    res = col.get(ids=["doc_1"])
    assert len(res["ids"]) == 1
    assert res["metadatas"][0]["image_path"] == "path1.jpg"
    
    # Delete collection items
    col.delete(where={"dataset_id": "ds_100"})
    res_after = col.get(where={"dataset_id": "ds_100"})
    assert len(res_after["ids"]) == 0
