import client from './client';

export async function addDatasetToWorkspace(workspaceId, datasetData) {
  let payload;
  if (typeof workspaceId === 'object' && workspaceId !== null && !datasetData) {
    payload = workspaceId;
  } else {
    payload = {
      workspace_id: workspaceId,
      ...datasetData,
    };
  }
  const { data } = await client.post('/datasets/', payload);
  return data;
}

export async function getWorkspaceDatasets(workspaceId) {
  const { data } = await client.get(`/datasets/workspace/${workspaceId}`);
  return data;
}

export async function getDataset(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}`);
  return data;
}

export async function detectDuplicates(datasetId) {
  const { data } = await client.post(`/datasets/${datasetId}/detect-duplicates`);
  return data;
}

export async function getDuplicateStatus(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/duplicate-status`);
  return data;
}

export async function getDuplicateGroups(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/duplicate-groups`);
  return data;
}

export async function cancelJob(datasetId) {
  const { data } = await client.post(`/datasets/${datasetId}/cancel-job`);
  return data;
}

export function getDatasetErrorMessage(error) {
  if (!error.response) {
    return 'The backend server is currently unavailable. Please verify that the server is running.';
  }
  if (error.response.status === 401) {
    return 'Session expired or unauthorized. Please log in again to access this service.';
  }
  if (error.response.status === 403) {
    return 'You are not authorized to add datasets to this workspace.';
  }
  const detail = error.response.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(', ');
  }
  return 'Failed to save dataset. Please try again later.';
}