"""
Mock external API responses for discovery service tests.
"""

MOCK_ZENODO_RESPONSE = {
    "hits": {
        "hits": [
            {
                "id": 123456,
                "metadata": {
                    "title": "Zenodo Brain MRI Dataset",
                    "description": "A collection of 500 brain MRI scans.",
                    "license": {"id": "CC-BY-4.0"}
                },
                "links": {
                    "self_html": "https://zenodo.org/record/123456"
                }
            }
        ]
    }
}

MOCK_FIGSHARE_RESPONSE = [
    {
        "id": 987654,
        "title": "Figshare Retinal OCT Images",
        "description": "High resolution retinal optical coherence tomography dataset.",
        "url_public_html": "https://figshare.com/articles/dataset/987654"
    }
]

MOCK_OPENML_RESPONSE = {
    "data": {
        "dataset": [
            {
                "did": 4321,
                "name": "chest_xray_openml"
            }
        ]
    }
}

MOCK_OPENVERSE_RESPONSE = {
    "results": [
        {
            "id": "ov-5555",
            "title": "Microscopic Cells Openverse",
            "foreign_landing_url": "https://openverse.org/image/ov-5555",
            "license": "cc0",
            "thumbnail": "https://openverse.org/thumbs/ov-5555.jpg"
        }
    ]
}

MOCK_HUGGINGFACE_RESPONSE = [
    {
        "id": "medical-ai/skin-cancer-isic",
        "description": "ISIC dataset for melanoma classification"
    }
]

MOCK_GITHUB_RESPONSE = {
    "items": [
        {
            "id": 11223344,
            "full_name": "researcher/cardiac-mri-dataset",
            "description": "Curated cardiac MRI dataset and segmentation benchmarks.",
            "html_url": "https://github.com/researcher/cardiac-mri-dataset",
            "license": {"spdx_id": "MIT"}
        }
    ]
}

MOCK_ROBOFLOW_RESPONSE = {
    "datasets": [
        {
            "id": "roboflow-leaf-rust-v1",
            "name": "Plant Village Leaf Rust",
            "url": "https://universe.roboflow.com/project/leaf-rust",
            "images": 1500
        }
    ]
}
