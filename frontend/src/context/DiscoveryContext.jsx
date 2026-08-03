import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { searchDatasets } from '../api/discoveryApi';

const DiscoveryContext = createContext(null);

const REPOSITORIES = [
  'Kaggle',
  'Hugging Face',
  'Zenodo',
  'GitHub',
  'OpenML',
  'Papers With Code'
];

export function DiscoveryProvider({ children }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [datasets, setDatasets] = useState(null);
  const [selectedSources, setSelectedSources] = useState([...REPOSITORIES]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const search = useCallback(async (query, sources, limit = 10) => {
    setIsLoading(true);
    setSearchError(null);
    try {
      const response = await searchDatasets(query, sources, limit);
      return response;
    } catch (err) {
      setSearchError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      datasets,
      setDatasets,
      selectedSources,
      setSelectedSources,
      isLoading,
      setIsLoading,
      searchError,
      setSearchError,
      search,
    }),
    [
      searchQuery,
      datasets,
      selectedSources,
      isLoading,
      searchError,
      search,
    ]
  );

  return (
    <DiscoveryContext.Provider value={value}>
      {children}
    </DiscoveryContext.Provider>
  );
}

export function useDiscovery() {
  const context = useContext(DiscoveryContext);
  if (!context) {
    throw new Error('useDiscovery must be used within a DiscoveryProvider');
  }
  return context;
}
