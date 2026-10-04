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
