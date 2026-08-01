import httpx
from app.schemas.discovery import NormalizedDataset
from app.config import settings
import asyncio
import os
from app.config import settings

os.environ["KAGGLE_USERNAME"] = settings.kaggle_username
os.environ["KAGGLE_KEY"] = settings.kaggle_key
# ============ NO-KEY SOURCES ============

def search_zenodo(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://zenodo.org/api/records"
    params = {"q": query, "size": limit, "type": "dataset"}
    response = httpx.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    for hit in data.get("hits", {}).get("hits", []):
        results.append(NormalizedDataset(
            source="zenodo",
            external_id=str(hit.get("id")),
            name=hit.get("metadata", {}).get("title", "Untitled"),
            description=hit.get("metadata", {}).get("description"),
            url=hit.get("links", {}).get("self_html", ""),
            license=hit.get("metadata", {}).get("license", {}).get("id"),
        ))
    return results


def search_figshare(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://api.figshare.com/v2/articles/search"
    params = {"search_for": query, "page_size": limit}
    response = httpx.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    for item in data:
        results.append(NormalizedDataset(
            source="figshare",
            external_id=str(item.get("id")),
            name=item.get("title", "Untitled"),
            description=item.get("description"),
            url=item.get("url_public_html", ""),
            license=None,
        ))
    return results


def search_openml(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://www.openml.org/api/v1/json/data/list"
    params = {"data_name": query, "limit": limit}
    response = httpx.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    datasets = data.get("data", {}).get("dataset", [])
    if isinstance(datasets, dict):
        datasets = [datasets]
    for item in datasets[:limit]:
        did = item.get("did")
        results.append(NormalizedDataset(
            source="openml",
            external_id=str(did),
            name=item.get("name", "Untitled"),
            description=None,
            url=f"https://www.openml.org/d/{did}",
        ))
    return results


def search_openverse(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://api.openverse.org/v1/images/"
    params = {"q": query, "page_size": limit}
    response = httpx.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    for item in data.get("results", []):
        results.append(NormalizedDataset(
            source="openverse",
            external_id=str(item.get("id")),
            name=item.get("title", "Untitled"),
            description=None,
            url=item.get("foreign_landing_url", ""),
            license=item.get("license"),
            thumbnail_url=item.get("thumbnail"),
        ))
    return results


# ============ KEY-REQUIRED SOURCES ============

def search_huggingface(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://huggingface.co/api/datasets"
    params = {"search": query, "limit": limit}
    headers = {"Authorization": f"Bearer {settings.huggingface_api_key}"}
    response = httpx.get(url, params=params, headers=headers, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    for item in data:
        dataset_id = item.get("id")
        results.append(NormalizedDataset(
            source="huggingface",
            external_id=dataset_id,
            name=dataset_id,
            description=None,
            url=f"https://huggingface.co/datasets/{dataset_id}",
        ))
    return results


def search_github(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://api.github.com/search/repositories"
    params = {"q": f"{query} dataset", "per_page": limit}
    headers = {"Authorization": f"token {settings.github_api_key}"}
    response = httpx.get(url, params=params, headers=headers, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    for item in data.get("items", []):
        results.append(NormalizedDataset(
            source="github",
            external_id=str(item.get("id")),
            name=item.get("full_name", "Untitled"),
            description=item.get("description"),
            url=item.get("html_url", ""),
            license=(item.get("license") or {}).get("spdx_id"),
        ))
    return results


def search_kaggle(query: str, limit: int = 10) -> list[NormalizedDataset]:
    # Kaggle's public API requires the kaggle package + credentials file,
    # not a plain HTTP call like the others.
    import kaggle
    kaggle.api.authenticate()
    datasets = kaggle.api.dataset_list(search=query)

    results = []
    for item in datasets[:limit]:
        results.append(NormalizedDataset(
            source="kaggle",
            external_id=str(item.ref),
            name=item.title,
            description=item.subtitle,
            url=f"https://www.kaggle.com/datasets/{item.ref}",
            license=getattr(item, "licenseName", None) or getattr(item, "license_name", None),
        ))
    return results


def search_roboflow(query: str, limit: int = 10) -> list[NormalizedDataset]:
    url = "https://api.roboflow.com/dataset/search"
    params = {"query": query, "limit": limit, "api_key": settings.roboflow_api_key}
    response = httpx.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    results = []
    for item in data.get("datasets", []):
        results.append(NormalizedDataset(
            source="roboflow",
            external_id=str(item.get("id")),
            name=item.get("name", "Untitled"),
            description=None,
            url=item.get("url", ""),
            image_count=item.get("images"),
        ))
    return results


# ============ AGGREGATOR ============

SEARCH_FUNCTIONS = {
    "zenodo": search_zenodo,
    "figshare": search_figshare,
    "openml": search_openml,
    "openverse": search_openverse,
    "huggingface": search_huggingface,
    "github": search_github,
    "kaggle": search_kaggle,
    "roboflow": search_roboflow,
}

async def search_all_sources(query: str, sources: list[str] | None = None, limit: int = 10) -> tuple[list[NormalizedDataset], list[str]]:
    sources_to_search = sources or list(SEARCH_FUNCTIONS.keys())

    async def run_source(source_name: str):
        search_fn = SEARCH_FUNCTIONS.get(source_name)
        if not search_fn:
            return source_name, []
        try:
            results = await asyncio.to_thread(search_fn, query, limit)
            return source_name, results
        except Exception as e:
            print(f"Search failed for {source_name}: {e}")
            return source_name, []

    tasks = [run_source(name) for name in sources_to_search]
    outcomes = await asyncio.gather(*tasks)

    all_results = []
    succeeded = []
    for source_name, results in outcomes:
        if results:
            all_results.extend(results)
            succeeded.append(source_name)

    return all_results, succeeded