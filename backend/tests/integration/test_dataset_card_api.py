import uuid
import pytest
from app.models.profiling import DatasetProfilingResult
from tests.unit.test_purpose_fitting import sample_profile_payload


def test_get_dataset_card_unauthenticated(client, test_dataset):
    res = client.get(f"/datasets/{test_dataset.dataset_id}/dataset-card")
    assert res.status_code == 401


def test_get_dataset_card_pdf_unauthenticated(client, test_dataset):
    res = client.get(f"/datasets/{test_dataset.dataset_id}/dataset-card/pdf")
    assert res.status_code == 401


def test_get_dataset_card_non_existent_dataset(client, auth_headers):
    fake_id = uuid.uuid4()
    res = client.get(f"/datasets/{fake_id}/dataset-card", headers=auth_headers)
    assert res.status_code == 404


def test_get_dataset_card_unprofiled(client, auth_headers, test_dataset):
    res = client.get(f"/datasets/{test_dataset.dataset_id}/dataset-card", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["identity"]["dataset_id"] == str(test_dataset.dataset_id)
    assert data["composition"]["status"] == "not_yet_profiled"
    assert data["duplicate_detection"]["status"] == "not_yet_computed"
    assert data["domain_check"]["status"] == "not_assessed"
    assert data["integrated_findings"]["completeness_score"] >= 0


def test_get_dataset_card_fully_profiled(client, auth_headers, db_session, test_dataset):
    payload = sample_profile_payload()
    profiling_rec = DatasetProfilingResult(
        dataset_id=test_dataset.dataset_id,
        file_list_checksum="chk_card_integration",
        status="completed",
        profile_payload=payload,
    )
    db_session.add(profiling_rec)
    db_session.commit()

    res = client.get(f"/datasets/{test_dataset.dataset_id}/dataset-card", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["identity"]["dataset_name"] == test_dataset.dataset_name
    assert data["composition"]["status"] == "completed"
    assert data["composition"]["total_images"] == 100
    assert len(data["purpose_fitting"]["purposes_evaluated"]) == 8
    assert data["integrated_findings"]["completeness_score"] >= 50


def test_download_dataset_card_pdf_endpoint(client, auth_headers, db_session, test_dataset):
    payload = sample_profile_payload()
    profiling_rec = DatasetProfilingResult(
        dataset_id=test_dataset.dataset_id,
        file_list_checksum="chk_card_pdf",
        status="completed",
        profile_payload=payload,
    )
    db_session.add(profiling_rec)
    db_session.commit()

    res = client.get(f"/datasets/{test_dataset.dataset_id}/dataset-card/pdf", headers=auth_headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment; filename=" in res.headers["content-disposition"]
    # PDF files start with %PDF-
    assert res.content.startswith(b"%PDF-")
    assert len(res.content) > 1000
