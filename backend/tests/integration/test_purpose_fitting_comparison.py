import uuid
import pytest
from app.models.dataset import Dataset
from app.models.workspace import Workspace
from app.models.profiling import DatasetProfilingResult
from tests.unit.test_purpose_fitting import sample_profile_payload


def test_comparison_unauthenticated(client, test_workspace):
    res = client.get(
        f"/datasets/workspace/{test_workspace.workspace_id}/purpose-fit-comparison",
        params={"purpose_key": "classification"},
    )
    assert res.status_code == 401


def test_comparison_non_existent_workspace(client, auth_headers):
    fake_ws = uuid.uuid4()
    res = client.get(
        f"/datasets/workspace/{fake_ws}/purpose-fit-comparison",
        headers=auth_headers,
        params={"purpose_key": "classification"},
    )
    assert res.status_code == 404
    assert "Workspace not found" in res.json()["detail"]


def test_comparison_invalid_purpose(client, auth_headers, test_workspace):
    res = client.get(
        f"/datasets/workspace/{test_workspace.workspace_id}/purpose-fit-comparison",
        headers=auth_headers,
        params={"purpose_key": "invalid_purpose_xyz"},
    )
    assert res.status_code == 422
    assert "Invalid purpose_key" in res.json()["detail"]


def test_comparison_empty_workspace(client, auth_headers, db_session, test_user):
    ws = Workspace(
        user_id=test_user.user_id,
        workspace_name="Empty WS",
        workspace_research_domain="Vision",
        workspace_description="Empty workspace for test",
    )
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)

    res = client.get(
        f"/datasets/workspace/{ws.workspace_id}/purpose-fit-comparison",
        headers=auth_headers,
        params={"purpose_key": "classification"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_datasets_in_workspace"] == 0
    assert data["eligible_candidate_count"] == 0
    assert len(data["candidates"]) == 0
    assert len(data["matrix_criteria"]) > 0


def test_comparison_multi_dataset_ranking_and_unprofiled(
    client, auth_headers, db_session, test_workspace
):
    # 1. Dataset A: Clean baseline, minimal duplicates
    ds_a = Dataset(
        workspace_id=test_workspace.workspace_id,
        dataset_name="Dataset A - Clean",
        dataset_source_type="local",
        dataset_image_count=500,
        dataset_status="completed",
    )
    # 2. Dataset B: High duplicate ratio (advisory warning)
    ds_b = Dataset(
        workspace_id=test_workspace.workspace_id,
        dataset_name="Dataset B - High Dups",
        dataset_source_type="local",
        dataset_image_count=400,
        dataset_status="completed",
    )
    # 3. Dataset C: Unprofiled
    ds_c = Dataset(
        workspace_id=test_workspace.workspace_id,
        dataset_name="Dataset C - Unprofiled",
        dataset_source_type="local",
        dataset_image_count=200,
        dataset_status="acquired",
    )
    db_session.add_all([ds_a, ds_b, ds_c])
    db_session.commit()
    db_session.refresh(ds_a)
    db_session.refresh(ds_b)
    db_session.refresh(ds_c)

    # Add profiling for A
    payload_a = sample_profile_payload(
        duplicate_ratio=0.04,
        blurred_pct=5.0,
    )
    payload_a["dataset"]["dataset_id"] = str(ds_a.dataset_id)
    payload_a["dataset"]["dataset_name"] = "Dataset A - Clean"
    prof_a = DatasetProfilingResult(
        dataset_id=ds_a.dataset_id,
        file_list_checksum="chk_a",
        status="completed",
        profile_payload=payload_a,
    )

    # Add profiling for B
    payload_b = sample_profile_payload(
        duplicate_ratio=0.81,
        blurred_pct=5.0,
    )
    payload_b["dataset"]["dataset_id"] = str(ds_b.dataset_id)
    payload_b["dataset"]["dataset_name"] = "Dataset B - High Dups"
    prof_b = DatasetProfilingResult(
        dataset_id=ds_b.dataset_id,
        file_list_checksum="chk_b",
        status="completed",
        profile_payload=payload_b,
    )
    db_session.add_all([prof_a, prof_b])
    db_session.commit()

    # Call comparison with reference = Dataset A
    res = client.get(
        f"/datasets/workspace/{test_workspace.workspace_id}/purpose-fit-comparison",
        headers=auth_headers,
        params={
            "purpose_key": "classification",
            "reference_dataset_id": str(ds_a.dataset_id),
        },
    )
    assert res.status_code == 200
    data = res.json()

    assert data["workspace_id"] == str(test_workspace.workspace_id)
    assert data["purpose_key"] == "classification"
    assert data["reference_dataset_id"] == str(ds_a.dataset_id)
    assert data["reference_dataset_name"] == "Dataset A - Clean"
    assert data["total_datasets_in_workspace"] >= 3
    assert data["eligible_candidate_count"] >= 2
    assert data["unprofiled_candidate_count"] >= 1

    # Check candidates
    cand_a = next(c for c in data["candidates"] if c["dataset_id"] == str(ds_a.dataset_id))
    cand_b = next(c for c in data["candidates"] if c["dataset_id"] == str(ds_b.dataset_id))
    cand_c = next(c for c in data["candidates"] if c["dataset_id"] == str(ds_c.dataset_id))

    assert cand_a["is_reference"] is True
    assert cand_b["is_reference"] is False
    assert cand_a["eligibility_status"] == "evaluated"
    assert cand_b["eligibility_status"] == "evaluated"
    assert cand_c["eligibility_status"] == "unprofiled"

    # Dataset A should rank above Dataset B because B has high duplicates (warning/critical)
    assert cand_a["rank"] is not None
    assert cand_b["rank"] is not None
    assert cand_a["rank"] < cand_b["rank"]
    assert cand_c["rank"] is None
    assert cand_c["tier"] == 4

    # Verify criteria matrix definitions are present
    assert len(data["matrix_criteria"]) > 0
    crit_keys = [c["metric_key"] for c in data["matrix_criteria"]]
    assert "duplicate_ratio" in crit_keys


def test_comparison_excludes_unrelated_workspaces(
    client, auth_headers, db_session, test_user, test_workspace
):
    # Other workspace
    ws_other = Workspace(
        user_id=test_user.user_id,
        workspace_name="Other Workspace",
        workspace_research_domain="Medical",
        workspace_description="Unrelated workspace",
    )
    db_session.add(ws_other)
    db_session.commit()
    db_session.refresh(ws_other)

    ds_other = Dataset(
        workspace_id=ws_other.workspace_id,
        dataset_name="Foreign Dataset",
        dataset_source_type="local",
        dataset_image_count=300,
        dataset_status="completed",
    )
    db_session.add(ds_other)
    db_session.commit()
    db_session.refresh(ds_other)

    res = client.get(
        f"/datasets/workspace/{test_workspace.workspace_id}/purpose-fit-comparison",
        headers=auth_headers,
        params={"purpose_key": "classification"},
    )
    assert res.status_code == 200
    data = res.json()
    candidate_ids = [c["dataset_id"] for c in data["candidates"]]
    assert str(ds_other.dataset_id) not in candidate_ids
