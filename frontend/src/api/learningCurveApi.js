import client from './client';

/**
 * Starts learning curve calculation or returns cached completed result.
 */
export async function triggerLearningCurve(datasetId, forceRecompute = false) {
  const { data } = await client.post(`/datasets/${datasetId}/learning-curve`, {
    force_recompute: forceRecompute,
  });
  return data;
}

/**
 * Polls the current execution status, stage, and progress.
 */
export async function getLearningCurveStatus(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/learning-curve/status`);
  return data;
}

/**
 * Retrieves the latest completed learning curve result with presigned URLs.
 */
export async function getLearningCurveResults(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/learning-curve`);
  return data;
}

/**
 * Cancels an active learning curve job.
 */
export async function cancelLearningCurve(datasetId) {
  const { data } = await client.post(`/datasets/${datasetId}/learning-curve/cancel`);
  return data;
}
