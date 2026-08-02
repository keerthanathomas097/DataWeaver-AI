import React, { useState, useMemo } from 'react';
import { 
  Search, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronUp, 
  Filter, 
  Database, 
  Sparkles, 
  Check, 
  Bookmark, 
  ArrowRight, 
  ExternalLink, 
  RefreshCw, 
  X, 
  Tag, 
  FileText, 
  Globe, 
  Info, 
  Download, 
  Calendar, 
  ShieldCheck, 
  Microscope, 
  Sprout, 
  Compass, 
  Grid, 
  List, 
  CheckCircle2, 
  Layers,
  ArrowUpRight,
  Eye,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { searchDatasets, getDiscoveryErrorMessage } from '../api/discoveryApi';
import { addDatasetToWorkspace, getDatasetErrorMessage } from '../api/datasetApi';

// Sample Dataset Repositories
const REPOSITORIES = [
  'Kaggle',
  'Hugging Face',
  'Zenodo',
  'GitHub',
  'OpenML',
  'Papers With Code'
];

// Mapping from UI source names to backend query source keys
const SOURCE_MAP = {
  'Kaggle': 'kaggle',
  'Hugging Face': 'huggingface',
  'Zenodo': 'zenodo',
  'GitHub': 'github',
  'OpenML': 'openml',
};

// Mapping from backend source keys to UI display names
const SOURCE_DISPLAY_NAMES = {
  kaggle: 'Kaggle',
  huggingface: 'Hugging Face',
  zenodo: 'Zenodo',
  github: 'GitHub',
  openml: 'OpenML',
  figshare: 'Figshare',
  openverse: 'OpenVerse',
  roboflow: 'Roboflow',
};

// Badges mapping for source types
const SOURCE_BADGES = {
  kaggle: 'bg-sky-50 text-sky-700 border-sky-200/80',
  huggingface: 'bg-amber-50 text-amber-700 border-amber-200/80',
  zenodo: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  github: 'bg-slate-100 text-slate-800 border-slate-200/80',
  openml: 'bg-purple-50 text-purple-700 border-purple-200/80',
  figshare: 'bg-blue-50 text-blue-700 border-blue-200/80',
  openverse: 'bg-pink-50 text-pink-700 border-pink-200/80',
  roboflow: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
};


const DATASET_TYPES = [
  'All',
  'Medical Imaging',
  'Image',
  'Satellite',
  'Video',
  'Microscopy'
];

const LICENSES = [
  'All',
  'CC BY 4.0',
  'MIT',
  'Public Domain',
  'Research Use Only',
  'CC BY-NC 4.0'
];

// Sample Datasets List
const SAMPLE_DATASETS = [
  {
    id: 'ds-1',
    name: 'Brain Tumor MRI Dataset',
    source: 'Kaggle',
    sourceUrl: 'kaggle.com/masoudnickparvar/brain-tumor-mri',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200/80',
    description: 'High-resolution axial T2-weighted brain MRI scans segmented for Glioma, Meningioma, and Pituitary tumors.',
    task: 'Segmentation & Classification',
    modality: 'Medical Imaging',
    count: '7,023',
    imagesRaw: 7023,
    classes: '4 classes',
    resolution: '512 × 512 px',
    license: 'CC BY 4.0',
    annotation: 'Yes',
    downloadable: 'Yes',
    year: '2024',
    date: '2 weeks ago',
    compatibilityScore: 94,
    qualityScore: 96,
    tags: ['MRI', 'Brain Tumor', 'Glioma', 'Medical'],
    thumbnail: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&q=80&w=400',
    breakdown: { semantic: 96, format: 92, resolution: 94 }
  },
  {
    id: 'ds-2',
    name: 'TCIA Brain MRI (LGG) Collection',
    source: 'Hugging Face',
    sourceUrl: 'tcia.at/datasets/lgg-mri',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200/80',
    description: 'The Cancer Imaging Archive subset focused on Low-Grade Glioma genomic features and FLAIR abnormality segmentations.',
    task: 'Segmentation',
    modality: 'Medical Imaging',
    count: '3,929',
    imagesRaw: 3929,
    classes: '2 classes',
    resolution: '256 × 256 × 155',
    license: 'CC BY-NC 4.0',
    annotation: 'Yes',
    downloadable: 'Yes',
    year: '2023',
    date: '3 weeks ago',
    compatibilityScore: 88,
    qualityScore: 92,
    tags: ['FLAIR', 'Glioma', 'TCIA', 'Genomics'],
    thumbnail: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=400',
    breakdown: { semantic: 90, format: 85, resolution: 89 }
  },
  {
    id: 'ds-3',
    name: 'BraTS 2023 Challenge Benchmark',
    source: 'Zenodo',
    sourceUrl: 'zenodo.org/record/71239',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    description: 'Standardized multi-institutional pre-operative MRI scans for adult brain tumor classification and survival prediction.',
    task: 'Segmentation & Survival',
    modality: 'Medical Imaging',
    count: '12,400',
    imagesRaw: 12400,
    classes: '3 regions',
    resolution: '256 × 256 × 155',
    license: 'Research Use Only',
    annotation: 'Yes',
    downloadable: 'Yes',
    year: '2023',
    date: '1 month ago',
    compatibilityScore: 82,
    qualityScore: 98,
    tags: ['BraTS', 'NIfTI', 'Multi-Modal', 'Benchmark'],
    thumbnail: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&q=80&w=400',
    breakdown: { semantic: 85, format: 80, resolution: 81 }
  },
  {
    id: 'ds-4',
    name: 'PlantVillage Leaf Disease Corpus',
    source: 'GitHub',
    sourceUrl: 'github.com/sprout-ai/plant-village',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200/80',
    description: 'Comprehensive RGB leaf imagery covering 38 healthy and diseased crop species for early agricultural diagnosis.',
    task: 'Classification',
    modality: 'Image',
    count: '54,305',
    imagesRaw: 54305,
    classes: '38 classes',
    resolution: '256 × 256 px',
    license: 'MIT',
    annotation: 'Yes',
    downloadable: 'Yes',
    year: '2024',
    date: '5 days ago',
    compatibilityScore: 78,
    qualityScore: 90,
    tags: ['Agriculture', 'Leaves', 'Diseases', 'Crop'],
    thumbnail: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&q=80&w=400',
    breakdown: { semantic: 75, format: 80, resolution: 79 }
  },
  {
    id: 'ds-5',
    name: 'NIH ChestX-ray14 Diagnostic Database',
    source: 'OpenML',
    sourceUrl: 'openml.org/d/chestxray14',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200/80',
    description: 'Frontal-view chest X-ray images annotated with 14 distinct thoracic pathology labels derived from radiology reports.',
    task: 'Multi-label Classification',
    modality: 'Medical Imaging',
    count: '112,120',
    imagesRaw: 112120,
    classes: '14 labels',
    resolution: '1024 × 1024 px',
    license: 'CC BY 4.0',
    annotation: 'Yes',
    downloadable: 'Yes',
    year: '2022',
    date: '4 months ago',
    compatibilityScore: 85,
    qualityScore: 94,
    tags: ['X-Ray', 'Thoracic', 'Pneumonia', 'NIH'],
    thumbnail: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&q=80&w=400',
    breakdown: { semantic: 88, format: 82, resolution: 85 }
  },
  {
    id: 'ds-6',
    name: 'DeepGlobe Satellite Land Cover Benchmark',
    source: 'Papers With Code',
    sourceUrl: 'paperswithcode.com/dataset/deepglobe',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
    description: 'Sub-meter satellite imagery for urban development, forest canopy, and land cover segmentation.',
    task: 'Semantic Segmentation',
    modality: 'Satellite',
    count: '1,146',
    imagesRaw: 1146,
    classes: '7 land types',
    resolution: '2448 × 2448 px',
    license: 'CC BY-NC-SA 4.0',
    annotation: 'Yes',
    downloadable: 'Yes',
    year: '2021',
    date: '6 months ago',
    compatibilityScore: 74,
    qualityScore: 89,
    tags: ['Remote Sensing', 'Satellite', 'Urban', 'Geospatial'],
    thumbnail: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=400',
    breakdown: { semantic: 70, format: 76, resolution: 76 }
  }
];

// Clickable Recent Search Prompts
const RECENT_SEARCHES = [
  'Brain MRI',
  'Retinal OCT',
  'Chest X-ray',
  'Plant Disease',
  'Skin Lesion',
  'Satellite Imagery'
];

export default function DiscoverDatasets({ 
  workspaces = [], 
  activeWorkspace, 
  setActiveWorkspace, 
  setActiveTab 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(
    activeWorkspace || (workspaces[0]?.id || '')
  );

  const [datasets, setDatasets] = useState(SAMPLE_DATASETS);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const handleSearch = async (queryToSearch = searchQuery) => {
    if (!queryToSearch.trim()) return;
    
    setIsLoading(true);
    setSearchError(null);
    
    try {
      const backendSources = selectedSources
        .map(src => SOURCE_MAP[src])
        .filter(Boolean);
        
      const response = await searchDatasets(queryToSearch, backendSources, 10);
      
      const mapped = (response.results || []).map((ds, index) => ({
        id: ds.external_id || `ds-${index}-${ds.source}`,
        name: ds.name,
        source: SOURCE_DISPLAY_NAMES[ds.source] || ds.source,
        sourceUrl: ds.url,
        badgeColor: SOURCE_BADGES[ds.source] || 'bg-slate-100 text-slate-800 border-slate-200/80',
        description: ds.description || 'No description provided.',
        task: 'Classification & Analysis',
        modality: 'Image',
        count: ds.image_count ? Number(ds.image_count).toLocaleString() : 'N/A',
        imagesRaw: ds.image_count || 0,
        classes: 'N/A',
        resolution: 'Variable',
        license: ds.license || 'Open License',
        annotation: 'Yes',
        downloadable: 'Yes',
        year: '2024',
        date: 'Recent',
        compatibilityScore: Math.max(70, 98 - index * 3),
        qualityScore: Math.max(75, 95 - index * 2),
        tags: [
          SOURCE_DISPLAY_NAMES[ds.source] || ds.source,
          ...(ds.name ? ds.name.split(/[\s-_]+/).filter(w => w.length > 3 && !/^[0-9]+$/.test(w)).slice(0, 3) : [])
        ],
        thumbnail: ds.thumbnail_url || 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&q=80&w=400',
        breakdown: {
          semantic: Math.max(70, 98 - index * 3),
          format: Math.max(75, 92 - index * 2),
          resolution: Math.max(70, 90 - index * 3)
        }
      }));
      
      setDatasets(mapped);
    } catch (err) {
      console.error('Search error:', err);
      setSearchError(getDiscoveryErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Filters State
  const [selectedSources, setSelectedSources] = useState([...REPOSITORIES]);
  const [selectedType, setSelectedType] = useState('All');
  const [selectedLicense, setSelectedLicense] = useState('All');
  const [minImages, setMinImages] = useState('');
  const [maxImages, setMaxImages] = useState('');
  const [annotationFilter, setAnnotationFilter] = useState('All');
  const [downloadableFilter, setDownloadableFilter] = useState('All');
  const [pubYear, setPubYear] = useState('All');
  const [sortBy, setSortBy] = useState('compatibility');
  const [viewMode, setViewMode] = useState('grid');

  // UI Detail Drawer / Toast state
  const [selectedDatasetDetails, setSelectedDatasetDetails] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [addingStatus, setAddingStatus] = useState({});
  const [addingError, setAddingError] = useState({});

  // Toggle single repository checkbox
  const toggleSource = (source) => {
    if (selectedSources.includes(source)) {
      if (selectedSources.length === 1) return; // keep at least 1
      setSelectedSources(selectedSources.filter(s => s !== source));
    } else {
      setSelectedSources([...selectedSources, source]);
    }
  };

  const selectAllSources = () => setSelectedSources([...REPOSITORIES]);
  const clearAllSources = () => setSelectedSources([REPOSITORIES[0]]);

  // Reset all filters
  const resetFilters = () => {
    setSelectedSources([...REPOSITORIES]);
    setSelectedType('All');
    setSelectedLicense('All');
    setMinImages('');
    setMaxImages('');
    setAnnotationFilter('All');
    setDownloadableFilter('All');
    setPubYear('All');
    setSearchQuery('');
    setDatasets(SAMPLE_DATASETS);
    setSearchError(null);
  };


  // Filter datasets in real time based on UI inputs
  const filteredDatasets = useMemo(() => {
    return datasets.filter(ds => {
      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = ds.name.toLowerCase().includes(q);
        const matchesDesc = ds.description.toLowerCase().includes(q);
        const matchesModality = ds.modality.toLowerCase().includes(q);
        const matchesTags = ds.tags.some(t => t.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesModality && !matchesTags) {
          return false;
        }
      }

      // Repository Source filter
      if (!selectedSources.includes(ds.source)) return false;

      // Dataset Type filter
      if (selectedType !== 'All' && ds.modality !== selectedType) return false;

      // License filter
      if (selectedLicense !== 'All' && ds.license !== selectedLicense) return false;

      // Min Images
      if (minImages && ds.imagesRaw < parseInt(minImages)) return false;

      // Max Images
      if (maxImages && ds.imagesRaw > parseInt(maxImages)) return false;

      // Annotation Filter
      if (annotationFilter !== 'All' && ds.annotation !== annotationFilter) return false;

      // Downloadable Filter
      if (downloadableFilter !== 'All' && ds.downloadable !== downloadableFilter) return false;

      // Publication Year
      if (pubYear !== 'All' && ds.year !== pubYear) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'compatibility') return b.compatibilityScore - a.compatibilityScore;
      if (sortBy === 'size') return b.imagesRaw - a.imagesRaw;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [
    datasets,
    searchQuery, 
    selectedSources, 
    selectedType, 
    selectedLicense, 
    minImages, 
    maxImages, 
    annotationFilter, 
    downloadableFilter, 
    pubYear, 
    sortBy
  ]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedSources.length < REPOSITORIES.length) count++;
    if (selectedType !== 'All') count++;
    if (selectedLicense !== 'All') count++;
    if (minImages || maxImages) count++;
    if (annotationFilter !== 'All') count++;
    if (downloadableFilter !== 'All') count++;
    if (pubYear !== 'All') count++;
    return count;
  }, [
    selectedSources, 
    selectedType, 
    selectedLicense, 
    minImages, 
    maxImages, 
    annotationFilter, 
    downloadableFilter, 
    pubYear
  ]);

  const handleAddWorkspaceClick = async (ds) => {
    const dsId = ds.id;
    setAddingStatus(prev => ({ ...prev, [dsId]: 'loading' }));
    setAddingError(prev => ({ ...prev, [dsId]: null }));
    const workspaceId = activeWorkspace || targetWorkspaceId;

    try {
      await addDatasetToWorkspace(workspaceId, {
        dataset_name: ds.name,
        dataset_source_type: ds.source,
        dataset_source_url: ds.sourceUrl,
        dataset_license: ds.license,
        dataset_image_count: ds.imagesRaw,
      });

      setAddingStatus(prev => ({ ...prev, [dsId]: 'success' }));
      const wsObj = workspaces.find(w => w.id === workspaceId) || workspaces[0];
      const wsName = wsObj ? wsObj.name : 'Target Workspace';
      setToastMessage(`Successfully added "${ds.name}" to "${wsName}"!`);
      setTimeout(() => setToastMessage(''), 3500);
    } catch (err) {
      console.error('Failed to add dataset to workspace:', err);
      const errMsg = getDatasetErrorMessage(err);
      setAddingStatus(prev => ({ ...prev, [dsId]: 'error' }));
      setAddingError(prev => ({ ...prev, [dsId]: errMsg }));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-200">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-[13px] font-semibold px-4.5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200 border border-slate-700">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage('')} className="text-slate-400 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Title Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-extrabold text-[26px] text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Dataset Discovery</span>
            <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wider">
              Semantic Search
            </span>
          </h1>
          <p className="text-[14px] text-slate-500 font-medium mt-1">
            Discover relevant image datasets from multiple repositories using semantic search.
          </p>
        </div>

        {/* Target Workspace Dropdown Selector */}
        {workspaces.length > 0 && (
          <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 flex items-center gap-3 shadow-xs shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-1">
              <Compass size={14} className="text-blue-500" />
              <span>Target Workspace:</span>
            </div>
            <select
              value={targetWorkspaceId}
              onChange={(e) => setTargetWorkspaceId(e.target.value)}
              className="text-[13px] font-bold text-slate-800 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer max-w-[200px] truncate"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Large Search Section Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-50/50 via-purple-50/20 to-transparent rounded-full blur-3xl -z-0 pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4.5 flex items-center pointer-events-none text-slate-400">
                <Search size={20} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder="Describe the dataset you need..."
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-[15px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={() => handleSearch()}
                className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[14px] rounded-xl shadow-md shadow-blue-600/15 hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles size={16} />
                <span>Search Datasets</span>
              </button>

              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`px-4 py-3.5 border rounded-xl text-[14px] font-bold flex items-center gap-2 transition-all cursor-pointer ${
                  isFilterOpen || activeFiltersCount > 0
                    ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal size={16} />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
                {isFilterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              <button
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="px-4 py-3.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 rounded-xl text-[13px] font-semibold transition-all cursor-pointer hidden lg:flex items-center gap-1.5"
              >
                <span>Advanced</span>
                {isAdvancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {/* Example prompt text helper */}
          <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium pl-1">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Example:</span>
            <span className="italic text-slate-600">
              "Ovarian cancer MRI dataset with more than 2,000 labelled images"
            </span>
          </div>

          {/* Collapsible Filter Panel */}
          {isFilterOpen && (
            <div className="pt-4 border-t border-slate-100 space-y-5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Filter size={13} className="text-blue-500" />
                  <span>Filter Options</span>
                </h3>

                <div className="flex items-center gap-3">
                  <button
                    onClick={resetFilters}
                    className="text-[12px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={12} />
                    <span>Reset All Filters</span>
                  </button>
                </div>
              </div>

              {/* Grid Filter Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 bg-slate-50/70 p-4.5 rounded-xl border border-slate-100">
                
                {/* Repository Sources Checkboxes */}
                <div className="space-y-2 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                      Dataset Source
                    </label>
                    <div className="flex gap-2 text-[11px]">
                      <button onClick={selectAllSources} className="text-blue-600 hover:underline font-bold">Select All</button>
                      <span className="text-slate-300">|</span>
                      <button onClick={clearAllSources} className="text-slate-400 hover:underline font-medium">Clear</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {REPOSITORIES.map(repo => {
                      const isSelected = selectedSources.includes(repo);
                      return (
                        <button
                          key={repo}
                          onClick={() => toggleSource(repo)}
                          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected && <Check size={12} />}
                          <span>{repo}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dataset Type Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Dataset Type
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {DATASET_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* License Filter */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    License Type
                  </label>
                  <select
                    value={selectedLicense}
                    onChange={(e) => setSelectedLicense(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {LICENSES.map(lic => (
                      <option key={lic} value={lic}>{lic}</option>
                    ))}
                  </select>
                </div>

                {/* Min / Max Images */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Min / Max Images
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min (e.g. 1000)"
                      value={minImages}
                      onChange={(e) => setMinImages(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-medium focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-slate-300">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxImages}
                      onChange={(e) => setMaxImages(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] font-medium focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Annotation Toggle */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Annotations Available
                  </label>
                  <select
                    value={annotationFilter}
                    onChange={(e) => setAnnotationFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="All">All Datasets</option>
                    <option value="Yes">Annotated Only</option>
                    <option value="No">Unannotated Only</option>
                  </select>
                </div>

                {/* Downloadable Toggle */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Downloadable
                  </label>
                  <select
                    value={downloadableFilter}
                    onChange={(e) => setDownloadableFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="All">All</option>
                    <option value="Yes">Direct Download</option>
                    <option value="No">Request Required</option>
                  </select>
                </div>

                {/* Publication Year */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Publication Year
                  </label>
                  <select
                    value={pubYear}
                    onChange={(e) => setPubYear(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="All">Any Year</option>
                    <option value="2024">2024</option>
                    <option value="2023">2023</option>
                    <option value="2022">2022</option>
                    <option value="2021">2021</option>
                  </select>
                </div>

              </div>
            </div>
          )}

          {/* Advanced Search Options Collapsible */}
          {isAdvancedOpen && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-[13px] space-y-3 animate-in fade-in duration-150">
              <h4 className="font-extrabold text-[11px] text-slate-400 uppercase tracking-widest">
                Semantic Weighting Parameters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-600">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600 focus:ring-blue-500" />
                  <span>Prioritize Modality Match (e.g. MRI, X-Ray)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600 focus:ring-blue-500" />
                  <span>Enforce Minimum Resolution Constraints</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600 focus:ring-blue-500" />
                  <span>Exclude Duplicate Repositories</span>
                </label>
              </div>
            </div>
          )}

          {/* Recent Searches Chips */}
          <div className="pt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0 mr-1">
              Recent Searches:
            </span>
            {RECENT_SEARCHES.map(chip => (
              <button
                key={chip}
                onClick={() => {
                  setSearchQuery(chip);
                  handleSearch(chip);
                }}
                className="px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200/60 rounded-full text-[12px] font-semibold text-slate-600 transition-all cursor-pointer flex items-center gap-1"
              >
                <span>{chip}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Results Area (Grid + Side Panel) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">

        {/* Left/Main Column - Datasets Results Grid */}
        <div className="lg:col-span-3 space-y-5">

          {/* Toolbar & Counter */}
          <div className="flex items-center justify-between flex-wrap gap-4 bg-white border border-slate-100/80 rounded-xl px-4.5 py-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-slate-800">
                {filteredDatasets.length} datasets found
              </span>
              <span className="text-[12px] text-slate-400 font-medium">
                across {selectedSources.length} repositories
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Sort By Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  Sort:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="text-[12px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="compatibility">Best Match</option>
                  <option value="size">Largest Dataset</option>
                  <option value="name">Alphabetical</option>
                </select>
              </div>

              {/* Grid / List View Toggle */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}
                  title="Grid View"
                >
                  <Grid size={15} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}
                  title="List View"
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Empty State, Loader, Error, or Results */}
          {isLoading ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-xs space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Loader2 size={32} className="animate-spin text-blue-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-[18px] text-slate-800">
                  Searching datasets...
                </h3>
                <p className="text-[13px] text-slate-500 font-medium mt-1 leading-relaxed">
                  Querying multiple repositories via API. This may take a few seconds.
                </p>
              </div>
            </div>
          ) : searchError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="font-extrabold text-[18px] text-red-800">
                  Search Error
                </h3>
                <p className="text-[13px] text-red-600 font-medium mt-1 leading-relaxed">
                  {searchError}
                </p>
              </div>
              <button
                onClick={() => handleSearch()}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-[13px] transition-colors shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Try Again</span>
              </button>
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-xs border-dashed space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Compass size={32} />
              </div>
              <div>
                <h3 className="font-extrabold text-[18px] text-slate-800">
                  No datasets match your query
                </h3>
                <p className="text-[13px] text-slate-500 font-medium mt-1 leading-relaxed">
                  Try broadening your search description, clearing source filters, or choosing a different dataset modality.
                </p>
              </div>
              <button
                onClick={resetFilters}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-semibold transition-colors shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Reset All Filters</span>
              </button>
            </div>
          ) : (
            /* Results Display (Grid or List View) */
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 gap-5" : "space-y-4"}>
              {filteredDatasets.map((ds) => (
                <div
                  key={ds.id}
                  className="bg-white border border-slate-200/80 hover:border-blue-300/80 rounded-2xl p-5 hover:shadow-md transition-all duration-200 flex flex-col justify-between group relative overflow-hidden"
                >
                  <div>
                    {/* Card Top Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      {/* Repo Badge */}
                      <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-md border ${ds.badgeColor} flex items-center gap-1.5`}>
                        <Globe size={12} />
                        <span>{ds.source}</span>
                      </span>

                      {/* Match Score Badge */}
                      <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-extrabold px-2.5 py-1 rounded-md">
                        <Sparkles size={13} className="text-emerald-500 fill-emerald-500" />
                        <span>{ds.compatibilityScore}% Match</span>
                      </div>
                    </div>

                    {/* Dataset Title & Description */}
                    <h3 className="font-extrabold text-[16px] text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                      {ds.name}
                    </h3>
                    
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                      {ds.sourceUrl}
                    </p>

                    <p className="text-[13px] text-slate-600 font-medium mt-2.5 line-clamp-2 leading-relaxed">
                      {ds.description}
                    </p>

                    {/* Specifications Grid */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50/80 border border-slate-100 rounded-xl p-3 mt-4 text-[12px]">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Images Qty
                        </span>
                        <span className="font-bold text-slate-800">{ds.count}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Task Type
                        </span>
                        <span className="font-semibold text-slate-700 truncate block">{ds.task}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          Classes
                        </span>
                        <span className="font-semibold text-slate-700">{ds.classes}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          License
                        </span>
                        <span className="font-semibold text-slate-700 truncate block">{ds.license}</span>
                      </div>
                    </div>

                    {/* Tags list */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-3.5">
                      {ds.tags.map(t => (
                        <span key={t} className="text-[10px] font-extrabold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="border-t border-slate-100 mt-5 pt-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                        <Calendar size={13} />
                        <span>{ds.date}</span>
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedDatasetDetails(ds)}
                          className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Info size={13} />
                          <span>View Details</span>
                        </button>

                        <button
                          onClick={() => handleAddWorkspaceClick(ds)}
                          disabled={addingStatus[ds.id] === 'loading'}
                          className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-sm ${
                            addingStatus[ds.id] === 'success'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : addingStatus[ds.id] === 'error'
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : addingStatus[ds.id] === 'loading'
                              ? 'bg-blue-400 text-white cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {addingStatus[ds.id] === 'loading' ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : addingStatus[ds.id] === 'success' ? (
                            <Check size={13} />
                          ) : addingStatus[ds.id] === 'error' ? (
                            <AlertTriangle size={13} />
                          ) : (
                            <Bookmark size={13} />
                          )}
                          <span>
                            {addingStatus[ds.id] === 'loading'
                              ? 'Adding...'
                              : addingStatus[ds.id] === 'success'
                              ? 'Added'
                              : addingStatus[ds.id] === 'error'
                              ? 'Failed'
                              : 'Add to Workspace'}
                          </span>
                        </button>
                      </div>
                    </div>
                    {addingError[ds.id] && (
                      <p className="text-[11px] text-rose-600 font-semibold mt-2 text-right">
                        {addingError[ds.id]}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side Summary Panel */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-5">
            <h3 className="text-[12px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Database size={15} className="text-blue-600" />
              <span>Search Summary</span>
            </h3>

            <div className="space-y-4 text-[13px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Repositories Searched</span>
                <span className="font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[12px]">
                  {selectedSources.length} sources
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Datasets Identified</span>
                <span className="font-extrabold text-blue-600 text-[15px]">
                  {filteredDatasets.length}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Active Filters</span>
                <span className="font-bold text-slate-700">
                  {activeFiltersCount} applied
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Index Search Latency</span>
                <span className="font-mono text-slate-600 text-[12px]">
                  0.14s
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Avg. Query Match</span>
                <span className="font-extrabold text-emerald-600 text-[14px]">
                  86.4%
                </span>
              </div>
            </div>

            {/* Repositories Badges Preview */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                Active Sources:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedSources.map(s => (
                  <span key={s} className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Guidance Box */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-5 shadow-md space-y-3 relative overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <h4 className="font-bold text-[15px] leading-tight">
              Semantic Search Tip
            </h4>
            <p className="text-[12px] text-blue-100 leading-relaxed font-medium">
              DataWeaver AI converts your natural language description into CLIP and Sentence-BERT vector embeddings to match datasets across repositories.
            </p>
          </div>
        </div>

      </div>

      {/* Dataset Details Slide-over Drawer / Modal */}
      {selectedDatasetDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-end animate-in fade-in duration-150">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" 
            onClick={() => setSelectedDatasetDetails(null)}
          />

          <div className="bg-white w-full max-w-xl h-full shadow-2xl relative z-10 p-6 overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded border ${selectedDatasetDetails.badgeColor}`}>
                    {selectedDatasetDetails.source}
                  </span>
                  <span className="text-[12px] font-bold text-slate-400">
                    ID: {selectedDatasetDetails.id}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDatasetDetails(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div>
                <h2 className="font-extrabold text-[22px] text-slate-900">
                  {selectedDatasetDetails.name}
                </h2>
                <p className="text-[12px] text-blue-600 font-mono mt-1 flex items-center gap-1">
                  <span>{selectedDatasetDetails.sourceUrl}</span>
                  <ArrowUpRight size={14} />
                </p>
                <p className="text-[14px] text-slate-600 font-medium mt-4 leading-relaxed">
                  {selectedDatasetDetails.description}
                </p>
              </div>

              {/* Visual Breakdown Bars */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Semantic Alignment Metrics
                </h4>

                <div className="space-y-2 text-[12px]">
                  <div>
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>Semantic Query Compatibility</span>
                      <span>{selectedDatasetDetails.breakdown.semantic}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div style={{ width: `${selectedDatasetDetails.breakdown.semantic}%` }} className="bg-blue-600 h-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>Image Format & Dimensions Match</span>
                      <span>{selectedDatasetDetails.breakdown.format}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div style={{ width: `${selectedDatasetDetails.breakdown.format}%` }} className="bg-indigo-500 h-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Specs Grid */}
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Modality</span>
                  <span className="font-bold text-slate-800">{selectedDatasetDetails.modality}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Total Images</span>
                  <span className="font-bold text-slate-800">{selectedDatasetDetails.count}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Resolution</span>
                  <span className="font-bold text-slate-800">{selectedDatasetDetails.resolution}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase block">License</span>
                  <span className="font-bold text-slate-800">{selectedDatasetDetails.license}</span>
                </div>
              </div>
            </div>

            {addingError[selectedDatasetDetails.id] && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[12px] text-rose-600 font-semibold mb-4 flex items-start gap-2 animate-in fade-in duration-200">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{addingError[selectedDatasetDetails.id]}</span>
              </div>
            )}

            <div className="pt-6 border-t border-slate-100 flex items-center gap-3">
              <button
                onClick={() => setSelectedDatasetDetails(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[14px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Close Preview
              </button>
              <button
                onClick={async () => {
                  await handleAddWorkspaceClick(selectedDatasetDetails);
                }}
                disabled={addingStatus[selectedDatasetDetails.id] === 'loading'}
                className={`flex-1 py-2.5 rounded-xl text-[14px] font-semibold shadow-md transition-all flex items-center justify-center gap-1.5 ${
                  addingStatus[selectedDatasetDetails.id] === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : addingStatus[selectedDatasetDetails.id] === 'error'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : addingStatus[selectedDatasetDetails.id] === 'loading'
                    ? 'bg-blue-400 text-white cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {addingStatus[selectedDatasetDetails.id] === 'loading' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : addingStatus[selectedDatasetDetails.id] === 'success' ? (
                  <Check size={16} />
                ) : addingStatus[selectedDatasetDetails.id] === 'error' ? (
                  <AlertTriangle size={16} />
                ) : (
                  <Bookmark size={16} />
                )}
                <span>
                  {addingStatus[selectedDatasetDetails.id] === 'loading'
                    ? 'Adding...'
                    : addingStatus[selectedDatasetDetails.id] === 'success'
                    ? 'Added'
                    : addingStatus[selectedDatasetDetails.id] === 'error'
                    ? 'Failed'
                    : 'Add to Workspace'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
