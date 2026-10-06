import client from './client';

/**
 * Runs the deterministic Purpose-Fitting rules evaluation for a dataset.
 *
 * @param {string} datasetId - UUID of the dataset
 * @param {string} purposeKey - e.g. 'classification', 'object_detection', etc.
 * @returns {Promise<Object>} The structured PurposeFitResponse
 */
export async function evaluatePurposeFit(datasetId, purposeKey) {
  const { data } = await client.post(`/datasets/${datasetId}/purpose-fit`, {
    purpose_key: purposeKey,
  });
  return data;
}

/**
 * Fetches the list of all 8 configured research purposes with metadata.
 *
 * @returns {Promise<Array>} List of PurposeDefinition objects
 */
export async function getPurposeDefinitions() {
  const { data } = await client.get('/datasets/purpose-fit/purposes');
  return data;
}

/**
 * Fetches existing cached CLIP semantic label match findings.
 *
 * @param {string} datasetId - UUID of the dataset
 * @returns {Promise<Object>} The ClipAnalysisResponse
 */
export async function getClipAnalysis(datasetId) {
  const { data } = await client.get(`/datasets/${datasetId}/purpose-fit/clip-analysis`);
  return data;
}

/**
 * Triggers or re-computes CLIP semantic label match analysis for a dataset.
 *
 * @param {string} datasetId - UUID of the dataset
 * @returns {Promise<Object>} The ClipAnalysisResponse
 */
export async function triggerClipAnalysis(datasetId) {
  const { data } = await client.post(`/datasets/${datasetId}/purpose-fit/clip-analysis`);
  return data;
}

/**
 * Runs free-text requirement query against dataset images using CLIP similarity.
 *
 * @param {string} datasetId - UUID of the dataset
 * @param {string} queryText - User-provided natural language requirement
 * @returns {Promise<Object>} The TextMatchResponse
 */
export async function checkTextMatch(datasetId, queryText) {
  const { data } = await client.post(`/datasets/${datasetId}/purpose-fit/text-match`, {
    query_text: queryText,
  });
  return data;
}

