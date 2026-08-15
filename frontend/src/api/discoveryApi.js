import client from './client';

/**
 * Searches datasets using the backend API.
 * @param {string} query 
 * @param {string[]} [sources] 
 * @param {number} [limit] 
 */
export async function searchDatasets(query, sources, limit) {
  const params = new URLSearchParams();
  params.append('query', query);
  
  if (sources && sources.length > 0) {
    sources.forEach(src => params.append('sources', src));
  }
  
  if (limit) {
    params.append('limit', limit);
  }
  
  const { data } = await client.get('/discovery/search', { params });
  return data;
}

/**
 * Helper to parse backend error responses to user-friendly messages.
 * @param {any} error 
 */
export function getDiscoveryErrorMessage(error) {
  if (!error.response) {
    return 'The backend server is currently unavailable. Please verify that the server is running.';
  }
  if (error.response.status === 401) {
    return 'Session expired or unauthorized. Please log in again to access this service.';
  }
  const detail = error.response.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(', ');
  }
  return 'Failed to retrieve datasets from backend. Please try again later.';
}

/**
 * Extracts metadata dynamically from a dataset description.
 * @param {string} description 
 */
export async function extractMetadata(description) {
  const { data } = await client.post('/discovery/extract-metadata', null, {
    params: { description }
  });
  return data;
}

/**
 * Fetches Kaggle-specific dataset details.
 * @param {string} externalId 
 */
export async function getKaggleDetails(externalId) {
  const [owner, datasetSlug] = externalId.split('/');
  const { data } = await client.get(`/discovery/kaggle-details/${owner}/${datasetSlug}`);
  return data;
}
