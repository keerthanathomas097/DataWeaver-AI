import client from './client';

/**
 * Triggers or fetches workspace-level domain gap comparison across all eligible datasets.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @param {string} sampleSetId - UUID of the active sample set
 * @param {number} [referenceSimilarity] - Optional custom reference cutoff
 * @param {boolean} [forceRecompute=false] - Force recomputation of matrix
 * @returns {Promise<Object>} WorkspaceDomainGapComparisonResponse
 */
export async function triggerWorkspaceDomainGapCompare(workspaceId, sampleSetId, referenceSimilarity = null, forceRecompute = false) {
  const payload = {
    sample_set_id: sampleSetId,
    force_recompute: forceRecompute,
  };
  if (referenceSimilarity !== null && referenceSimilarity !== undefined) {
    payload.reference_similarity = referenceSimilarity;
  }
  const { data } = await client.post(`/workspaces/${workspaceId}/domain-gap/compare`, payload);
  return data;
}

/**
 * Fetches existing workspace-level domain gap comparison.
 *
 * @param {string} workspaceId - UUID of the workspace
 * @param {string} sampleSetId - UUID of the active sample set
 * @param {number} [referenceSimilarity] - Optional custom reference cutoff
 * @returns {Promise<Object>} WorkspaceDomainGapComparisonResponse
 */
export async function getWorkspaceDomainGapCompare(workspaceId, sampleSetId, referenceSimilarity = null) {
  const params = { sample_set_id: sampleSetId };
  if (referenceSimilarity !== null && referenceSimilarity !== undefined) {
    params.reference_similarity = referenceSimilarity;
  }
  const { data } = await client.get(`/workspaces/${workspaceId}/domain-gap/compare`, { params });
  return data;
}
