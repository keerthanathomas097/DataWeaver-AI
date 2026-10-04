import pytest
from app.services.duplicate_detection_service import DSU


@pytest.mark.unit
def test_dsu_initial_state():
    dsu = DSU()
    assert dsu.find("img1.jpg") == "img1.jpg"
    assert dsu.find("img2.jpg") == "img2.jpg"


@pytest.mark.unit
def test_dsu_single_union():
    dsu = DSU()
    dsu.union("img1.jpg", "img2.jpg")
    
    # Both elements must share the same root
    assert dsu.find("img1.jpg") == dsu.find("img2.jpg")


@pytest.mark.unit
def test_dsu_transitive_unions():
    dsu = DSU()
    dsu.union("img1.jpg", "img2.jpg")
    dsu.union("img2.jpg", "img3.jpg")
    dsu.union("img4.jpg", "img5.jpg")
    
    # Component 1: {img1, img2, img3}
    assert dsu.find("img1.jpg") == dsu.find("img3.jpg")
    # Component 2: {img4, img5}
    assert dsu.find("img4.jpg") == dsu.find("img5.jpg")
    # Separate components should not have the same root
    assert dsu.find("img1.jpg") != dsu.find("img4.jpg")


@pytest.mark.unit
def test_dsu_merging_disjoint_sets():
    dsu = DSU()
    dsu.union("a", "b")
    dsu.union("c", "d")
    assert dsu.find("a") != dsu.find("c")
    
    dsu.union("b", "c")
    assert dsu.find("a") == dsu.find("d")
