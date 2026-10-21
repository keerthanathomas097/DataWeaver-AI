import client from './client';

export const getDatasetCard = async (datasetId) => {
  const response = await client.get(`/datasets/${datasetId}/dataset-card`);
  return response.data;
};

export const downloadDatasetCardPdf = async (datasetId, datasetName = 'dataset') => {
  const response = await client.get(`/datasets/${datasetId}/dataset-card/pdf`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // Clean dataset name for fallback filename
  const cleanName = datasetName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const dateStr = new Date().toISOString().split('T')[0];
  a.download = `${cleanName}_dataset_card_${dateStr}.pdf`;
  
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
