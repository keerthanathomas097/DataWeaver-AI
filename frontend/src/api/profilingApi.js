import client from './client';

export async function startProfiling(datasetId, options = {}) {
  const { data } = await client.post(`/datasets/${datasetId}/profile`, options);
  return data;
}

export async function getProfilingStatus(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/profiling-status`);
  return data;
}

export async function getProfilingResults(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/profiling-results`);
  return data;
}

export async function cancelProfiling(datasetId) {
  const { data } = await client.post(`/datasets/${datasetId}/cancel-profiling`);
  return data;
}
