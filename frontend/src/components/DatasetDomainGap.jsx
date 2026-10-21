import React, { useState, useEffect, useRef, useMemo, Component } from 'react';
import {
  ArrowLeft,
  UploadCloud,
  X,
  Compass,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Eye,
  RefreshCw,
  Info,
  Layers,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import client from '../api/client';
import SourceTargetDomainGapMap from './SourceTargetDomainGapMap';
import DomainGapTargetChart from './DomainGapTargetChart';
import SimilarityDistributionChart from './SimilarityDistributionChart';
import DomainGapWorkspaceComparison from './DomainGapWorkspaceComparison';

// Feature Flag: Toggle between the new Coverage Target Bullseye chart and legacy UMAP scatter
const USE_TARGET_CHART = true;

// Safe number-to-percentage formatter
const formatPct = (val, fallback = '0.0') => {
  if (typeof val === 'number' && !isNaN(val)) {
    return (val * 100).toFixed(1);
  }
  return fallback;
};

// Error Boundary to prevent blank white screens
class DomainGapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('DomainGap assessment render error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white border border-rose-200 rounded-2xl p-8 max-w-xl mx-auto my-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertOctagon size={24} />
          </div>
          <h3 className="font-extrabold text-[18px] text-slate-800">
            Assessment View Encountered an Issue
          </h3>
          <p className="text-[12.5px] text-slate-500">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[12.5px] font-bold cursor-pointer transition-colors"
            >
              Try Again
            </button>
            {this.props.onBack && (
              <button
                onClick={this.props.onBack}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[12.5px] font-bold cursor-pointer transition-colors"
              >
                Back to Profiling
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DatasetDomainGapContent({ dataset, onBack }) {
  const datasetId = dataset?.dataset_id;
  const workspaceId = dataset?.workspace_id;

  // Upload & selection state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [filePreviews, setFilePreviews] = useState([]);
  const [existingSampleSets, setExistingSampleSets] = useState([]);
  const [selectedSampleSetId, setSelectedSampleSetId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [computeError, setComputeError] = useState(null);
  const [showUploadZone, setShowUploadZone] = useState(true);
  const [showComparison, setShowComparison] = useState(false);

  // Analysis result
  const [gapResult, setGapResult] = useState(null);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(null);
  const [pairFilter, setPairFilter] = useState('all'); // 'all' | 'uncovered' | 'covered'
  const [showBaselineExplainer, setShowBaselineExplainer] = useState(false);

  const fileInputRef = useRef(null);
  const mapSectionRef = useRef(null);

  // Load existing sample sets for this workspace
  useEffect(() => {
    if (!workspaceId) return;
    const fetchExistingSets = async () => {
      try {
        const res = await client.get(`/workspaces/${workspaceId}/domain-samples`);
        const sets = res.data || [];
        setExistingSampleSets(sets);

        // Auto-select latest sample set if available
        if (sets.length > 0 && !selectedSampleSetId) {
          setSelectedSampleSetId(sets[0].sample_set_id);
          // Auto-load cached result if available
          try {
            const cachedRes = await client.get(
              `/datasets/${datasetId}/domain-gap?sample_set_id=${sets[0].sample_set_id}`
            );
            if (cachedRes.data) {
              setGapResult(cachedRes.data);
              setShowUploadZone(false);
            }
          } catch {
            // Not yet computed, user can click Run
          }
        }
      } catch (err) {
        console.warn('Could not load existing domain sample sets:', err);
      }
    };
    fetchExistingSets();
  }, [workspaceId, datasetId]);

  // Handle file selection & client-side validation
  const handleFilesChosen = (files) => {
    setUploadError(null);
    const newFiles = Array.from(files);
    const totalPotential = selectedFiles.length + newFiles.length;

    if (totalPotential > 30) {
      setUploadError('Maximum 30 photos can be evaluated in one set.');
      return;
    }

    const validNewFiles = [];
    const validPreviews = [];

    for (const f of newFiles) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
        setUploadError(`Skipped ${f.name}: Only JPEG, PNG, and WebP are allowed.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        setUploadError(`Skipped ${f.name}: File size exceeds 10MB limit.`);
        continue;
      }
      validNewFiles.push(f);
      validPreviews.push(URL.createObjectURL(f));
    }

    setSelectedFiles((prev) => [...prev, ...validNewFiles]);
    setFilePreviews((prev) => [...prev, ...validPreviews]);
    setSelectedSampleSetId(''); // Reset reused set selection
  };

  const removeFile = (idx) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
    setFilePreviews((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const clearAllFiles = () => {
    filePreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setFilePreviews([]);
    setUploadError(null);
  };

  // Run upload and gap computation
  const handleRunCheck = async () => {
    setUploadError(null);
    setComputeError(null);

    let activeSetId = selectedSampleSetId;

    // 1. If uploading new files
    if (selectedFiles.length > 0) {
      setIsUploading(true);
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      try {
        const uploadRes = await client.post(
          `/workspaces/${workspaceId}/domain-samples`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
          }
        );
        activeSetId = uploadRes.data.sample_set_id;
        setSelectedSampleSetId(activeSetId);
        setExistingSampleSets((prev) => [
          {
            sample_set_id: activeSetId,
            sample_count: uploadRes.data.accepted_count,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        clearAllFiles();
      } catch (err) {
        setIsUploading(false);
        setUploadError(err.response?.data?.detail || 'Failed to upload and embed sample images.');
        return;
      } finally {
        setIsUploading(false);
      }
    }

    if (!activeSetId) {
      setUploadError('Please select or upload between 10 and 30 real-world setting photos.');
      return;
    }

    // 2. Compute domain gap
    setIsComputing(true);
    try {
      const res = await client.post(`/datasets/${datasetId}/domain-gap`, {
        sample_set_id: activeSetId,
        force_recompute: false,
      });
      setGapResult(res.data);
      setSelectedSampleIndex(null);
      setShowUploadZone(false);
    } catch (err) {
      setComputeError(err.response?.data?.detail || 'Failed to compute domain gap assessment.');
    } finally {
      setIsComputing(false);
    }
  };

  // When user clicks a photo from the gallery, highlight it on map and scroll to map view
  const handleSelectAndScrollToMap = (sampleIndex) => {
    setSelectedSampleIndex(sampleIndex);
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Pairs gallery sorted: worst-covered first
  const sortedPairs = useMemo(() => {
    if (!gapResult || !gapResult.samples) return [];
    let list = [...gapResult.samples];
    if (pairFilter === 'covered') {
      list = list.filter((s) => s.covered);
    } else if (pairFilter === 'uncovered') {
      list = list.filter((s) => !s.covered);
    }
    // Sort ascending by nearest similarity (worst covered first)
    return list.sort((a, b) => (a.nearest_similarity ?? 0) - (b.nearest_similarity ?? 0));
  }, [gapResult, pairFilter]);

  // Translate verdict into plain language (Section 4B requirement)
  const getPlainLanguageVerdict = (verdict) => {
    if (verdict === 'Low gap') {
      return {
        label: 'Good visual coverage of your sample',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dotClass: 'bg-emerald-600',
        icon: CheckCircle2,
      };
    }
    if (verdict === 'Moderate gap') {
      return {
        label: 'Some real-world conditions may be underrepresented',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dotClass: 'bg-amber-600',
        icon: AlertTriangle,
      };
    }
    return {
      label: 'Several uploaded images have weak matches in the dataset',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
      dotClass: 'bg-rose-600',
      icon: AlertOctagon,
    };
  };

  const verdictMeta = gapResult ? getPlainLanguageVerdict(gapResult.verdict) : {
    label: 'Assessment Pending',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-400',
    icon: Compass,
  };

  // Defensive metric extraction
  const counts = gapResult?.counts || {
    total_samples: gapResult?.samples?.length ?? 0,
    covered_samples: gapResult?.samples?.filter((s) => s.covered).length ?? 0,
    uncovered_samples: gapResult?.samples?.filter((s) => !s.covered).length ?? 0,
    dataset_images_evaluated: gapResult?.dataset_points?.length ?? 0,
  };
  const baseline = gapResult?.baseline || {
    threshold: 0.55,
    median: 0.65,
  };
  const coveragePct = gapResult?.coverage_pct ?? (
    counts.total_samples > 0
      ? Math.round((counts.covered_samples / counts.total_samples) * 100)
      : 0
  );

  // Render workspace comparison view when active
  if (showComparison) {
    const activeSetId = selectedSampleSetId || (existingSampleSets.length > 0 ? existingSampleSets[0].sample_set_id : null);
    return (
      <DomainGapWorkspaceComparison
        workspaceId={workspaceId}
        sampleSetId={activeSetId}
        initialReferenceDatasetId={datasetId}
        onBack={() => setShowComparison(false)}
        onSelectDataset={() => {
          setShowComparison(false);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-14 text-slate-800">
      {/* -------------------------------------------------------------
       * SECTION 4A: Page Heading & Context
       * ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
            title="Back to Dataset Profiling"
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/60">
                Scientific Assessment
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[12px] font-semibold text-slate-600">
                {dataset?.dataset_name}
              </span>
            </div>
            <h2 className="font-extrabold text-[20px] text-slate-900 tracking-tight mt-0.5">
              Dataset Coverage Assessment
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Compare your real-world images with the dataset to understand how well it represents the conditions your model may encounter.
            </p>
          </div>
        </div>

        {gapResult && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowComparison(true)}
              disabled={!selectedSampleSetId && !existingSampleSets.length}
              className="px-3.5 py-1.5 rounded-xl text-[12px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="Compare this deployment photo set across all eligible datasets in the workspace"
            >
              <Layers size={13} className="text-indigo-600" />
              <span>Compare Datasets</span>
            </button>
            <button
              onClick={() => setShowUploadZone(!showUploadZone)}
              className="px-3 py-1.5 rounded-xl text-[12px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders size={13} />
              <span>{showUploadZone ? 'Hide Photo Set' : 'Change Photo Set'}</span>
            </button>
            <button
              onClick={handleRunCheck}
              disabled={isComputing}
              className="px-3.5 py-1.5 rounded-xl text-[12px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={isComputing ? 'animate-spin' : ''} />
              <span>{isComputing ? 'Evaluating...' : 'Re-run Assessment'}</span>
            </button>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
       * Photo Set Selection & Upload Zone
       * ------------------------------------------------------------- */}
      {showUploadZone && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-[14.5px] text-slate-900 tracking-tight">
                Target Real-World Sample Photos
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Upload 10 to 30 photos representing the deployment environment where your model will operate.
              </p>
            </div>

            {/* Re-use Previous Sample Sets Dropdown */}
            {existingSampleSets.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] font-semibold text-slate-500">Saved set:</span>
                <select
                  value={selectedSampleSetId}
                  onChange={(e) => {
                    setSelectedSampleSetId(e.target.value);
                    clearAllFiles();
                  }}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-400 cursor-pointer"
                >
                  <option value="">Upload new photos</option>
                  {existingSampleSets.map((s) => (
                    <option key={s.sample_set_id} value={s.sample_set_id}>
                      Set ({s.sample_count} photos) - {new Date(s.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Drag & Drop Zone */}
          {!selectedSampleSetId && (
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleFilesChosen(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/20 rounded-2xl p-6 text-center transition-all cursor-pointer space-y-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleFilesChosen(e.target.files);
                  }}
                />
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <UploadCloud size={22} />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-800">
                    Click to select real-world photos or drag and drop here
                  </p>
                  <p className="text-[11.5px] text-slate-500 mt-0.5">
                    10 to 30 photos recommended • JPEG, PNG, WebP up to 10MB each
                  </p>
                </div>
              </div>

              {/* Selected Photos Thumbnails Strip */}
              {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-slate-700">
                      Selected Photos ({selectedFiles.length} of 30)
                    </span>
                    <button
                      onClick={clearAllFiles}
                      className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1">
                    {filePreviews.map((previewUrl, idx) => (
                      <div
                        key={idx}
                        className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden shrink-0 group bg-slate-100 shadow-2xs"
                      >
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(idx);
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-slate-900/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove photo"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {selectedFiles.length < 10 && (
                    <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5 flex items-center gap-2">
                      <Info size={14} className="shrink-0 text-amber-600" />
                      <span>
                        You have selected {selectedFiles.length} photos. At least 10 photos are recommended for statistically meaningful domain coverage.
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action Button & Errors */}
          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[12px] text-rose-800 flex items-center gap-2">
              <AlertOctagon size={15} className="shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          {computeError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[12px] text-rose-800 flex items-center gap-2">
              <AlertOctagon size={15} className="shrink-0" />
              <span>{computeError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div>
              {(selectedSampleSetId || existingSampleSets.length > 0) && (
                <button
                  type="button"
                  onClick={() => setShowComparison(true)}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[12px] font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Compare active deployment photo set across all workspace datasets"
                >
                  <Layers size={14} className="text-indigo-600" />
                  <span>Compare Workspace Datasets</span>
                </button>
              )}
            </div>
            <button
              onClick={handleRunCheck}
              disabled={isUploading || isComputing || (!selectedSampleSetId && selectedFiles.length === 0)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[12.5px] font-bold shadow-xs hover:shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Uploading & Processing Photos...</span>
                </>
              ) : isComputing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Computing Coverage Assessment...</span>
                </>
              ) : (
                <>
                  <Compass size={15} />
                  <span>Run Coverage Assessment</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Assessment Results Content
       * ------------------------------------------------------------- */}
      {gapResult && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* -------------------------------------------------------------
           * SECTION 4B: Primary Result & Plain-Language Summary
           * ------------------------------------------------------------- */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Primary Assessment
              </span>
              <h3 className="font-extrabold text-[18px] text-slate-900 tracking-tight mt-0.5">
                How well does this dataset cover your real-world images?
              </h3>
              <p className="text-[12.5px] text-slate-600 mt-1">
                Coverage estimates how many uploaded images have sufficiently similar examples in the dataset, based on the existing similarity criteria.
              </p>
            </div>

            {/* Prominent Coverage Display with Progress Bar */}
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-[26px] font-black text-slate-900 tracking-tight">
                    {counts.covered_samples} of your {counts.total_samples} images are covered ({coveragePct}%)
                  </div>
                  <p className="text-[12px] text-slate-500 font-medium">
                    {counts.uncovered_samples > 0
                      ? `${counts.uncovered_samples} images fall below the reference similarity threshold.`
                      : 'All evaluated photos have representative matches in the dataset.'}
                  </p>
                </div>

                {/* Plain-Language Verdict Pill */}
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[12px] font-bold self-start sm:self-auto ${verdictMeta?.badgeClass ?? ''}`}
                >
                  <span className={`w-2 h-2 rounded-full ${verdictMeta?.dotClass ?? 'bg-slate-400'}`} />
                  <span>{verdictMeta?.label ?? ''}</span>
                </div>
              </div>

              {/* Horizontal Progress Bar */}
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-600 h-full transition-all duration-500"
                  style={{ width: `${coveragePct}%` }}
                  title={`Covered images: ${counts.covered_samples}`}
                />
                <div
                  className="bg-rose-500 h-full transition-all duration-500"
                  style={{ width: `${Math.max(0, 100 - coveragePct)}%` }}
                  title={`Potential domain gaps: ${counts.uncovered_samples}`}
                />
              </div>
            </div>

            {/* -------------------------------------------------------------
             * SECTION 4C & 7: Cohesive 3-Column Explanation Grid
             * ------------------------------------------------------------- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              {/* Metric 1: Coverage */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Visual Coverage
                </span>
                <div className="text-[20px] font-extrabold text-slate-900 tracking-tight">
                  {counts.covered_samples} / {counts.total_samples} ({coveragePct}%)
                </div>
                <p className="text-[12px] text-slate-600 leading-snug">
                  Target images meeting the nearest-neighbor similarity criterion in the dataset.
                </p>
              </div>

              {/* Metric 2: Potential Domain Gap */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Potential Domain Gap
                </span>
                <div className={`text-[20px] font-extrabold tracking-tight ${
                  counts.uncovered_samples > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}>
                  {counts.uncovered_samples} photos
                </div>
                <p className="text-[12px] text-slate-600 leading-snug">
                  Target images with nearest match below the reference similarity cutoff ({formatPct(baseline.threshold)}%).
                </p>
              </div>

              {/* Metric 3: Distribution Distance (MMD) */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Distribution Divergence
                  </span>
                  <span
                    className="text-slate-400 hover:text-slate-600 cursor-help"
                    title="Maximum Mean Discrepancy (MMD) with RBF kernel and median bandwidth heuristic, calculated directly from original 768-D DINOv2 embeddings (not 2D coordinates). Measures overall feature-space distribution separation."
                  >
                    <HelpCircle size={13} />
                  </span>
                </div>
                <div className="text-[20px] font-extrabold text-slate-900 tracking-tight">
                  {typeof gapResult.distribution_distance?.value === 'number'
                    ? gapResult.distribution_distance.value.toFixed(4)
                    : 'N/A'}
                  <span className="text-[11px] font-semibold text-slate-400 ml-1.5 font-mono">MMD</span>
                </div>
                <p className="text-[12px] text-slate-600 leading-snug">
                  Overall statistical divergence between source and target sets in 768-D feature space.
                </p>
              </div>

              {/* Metric 4: Similarity Baseline */}
              <div className="p-4 rounded-xl border border-slate-200/80 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Similarity Baseline
                  </span>
                  <button
                    onClick={() => setShowBaselineExplainer(!showBaselineExplainer)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Details</span>
                    {showBaselineExplainer ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
                <div className="text-[20px] font-extrabold text-slate-900 tracking-tight">
                  {formatPct(baseline.threshold)}% cutoff
                </div>
                <p className="text-[12px] text-slate-600 leading-snug">
                  10th-percentile nearest-neighbor similarity within the dataset, used as a reference threshold.
                </p>
              </div>
            </div>

            {/* Expandable Technical Baseline Drawer */}
            {showBaselineExplainer && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[12px] text-slate-700 space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Info size={14} className="text-indigo-600" />
                  <span>How the reference baseline is calculated</span>
                </div>
                <p className="leading-relaxed text-slate-600">
                  The reference level is established by sampling distinct images from the dataset and measuring their closest internal matches (excluding near-identical duplicates above 97% similarity). The 10th percentile of this internal distribution ({formatPct(baseline.threshold)}%) serves as the threshold. Images at or above this score are represented as well as typical in-dataset instances.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block font-medium">Dataset Median</span>
                    <span className="font-bold text-slate-800">{formatPct(baseline.median)}%</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block font-medium">Target Sample Median</span>
                    <span className="font-bold text-slate-800">{formatPct(gapResult.median_nearest_similarity)}%</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block font-medium">Centroid Proximity</span>
                    <span className="font-bold text-slate-800">{formatPct(gapResult.centroid_similarity)}%</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-slate-200">
                    <span className="text-slate-400 block font-medium">Evaluated Images</span>
                    <span className="font-bold text-slate-800">{counts.dataset_images_evaluated ?? 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
             * SECTION 4D: Clear Limitations Callout Note
             * ------------------------------------------------------------- */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 px-3.5 flex items-start gap-2.5 text-[11.5px] text-slate-600">
              <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
              <span>
                <strong>Methodological note:</strong> This assessment measures visual representation, not model accuracy. A strong visual match does not guarantee a correct prediction, and a weak match does not prove that a model will fail.
              </span>
            </div>
          </div>

          {/* -------------------------------------------------------------
           * MAIN CENTERPIECE: Coverage Target Map (Bullseye Chart)
           * Replaces UMAP scatter; guarded by USE_TARGET_CHART constant
           * ------------------------------------------------------------- */}
          <div ref={mapSectionRef}>
            {USE_TARGET_CHART ? (
              <DomainGapTargetChart
                datasetPoints={gapResult.dataset_points || []}
                samples={gapResult.samples || []}
                selectedSampleIndex={selectedSampleIndex}
                onSelectSample={setSelectedSampleIndex}
                baselineThreshold={baseline.threshold}
                baselinePoints={gapResult.baseline_points || []}
                onRecompute={handleRunCheck}
                isComputing={isComputing}
              />
            ) : (
              <SourceTargetDomainGapMap
                datasetPoints={gapResult.dataset_points || []}
                samples={gapResult.samples || []}
                selectedSampleIndex={selectedSampleIndex}
                onSelectSample={setSelectedSampleIndex}
                projectionMethod={gapResult.projection_method || 'umap'}
                baselineThreshold={baseline.threshold}
                distributionDistance={gapResult.distribution_distance || null}
              />
            )}
          </div>

          {/* -------------------------------------------------------------
           * SUPPLEMENTARY EVIDENCE: 1D Similarity Distribution vs Baseline Cutoff
           * ------------------------------------------------------------- */}
          <div>
            <SimilarityDistributionChart
              samples={gapResult.samples || []}
              baseline={baseline}
              selectedSampleIndex={selectedSampleIndex}
              onSelectSample={setSelectedSampleIndex}
            />
          </div>

          {/* -------------------------------------------------------------
           * SECTION 6: Photo-by-Photo Evidence Section
           * ------------------------------------------------------------- */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h4 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
                  Which of your images may be missing from the dataset's coverage?
                </h4>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Review each uploaded image against the dataset's similarity baseline. Images falling below the threshold represent potential domain gaps and are shown first.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
                <button
                  onClick={() => setPairFilter('all')}
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
                    pairFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({counts.total_samples})
                </button>
                <button
                  onClick={() => setPairFilter('uncovered')}
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
                    pairFilter === 'uncovered'
                      ? 'bg-white text-rose-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Potential Gaps ({counts.uncovered_samples})
                </button>
                <button
                  onClick={() => setPairFilter('covered')}
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
                    pairFilter === 'covered'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Covered ({counts.covered_samples})
                </button>
              </div>
            </div>

            {/* Pairs Grid: Preserving Natural Aspect Ratios & Providing Clear Evidence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedPairs.map((sample) => {
                const nearestMatch = sample.nearest && sample.nearest.length > 0 ? sample.nearest[0] : null;
                const isSelected = selectedSampleIndex === sample.index;
                const threshold = typeof baseline.threshold === 'number' ? baseline.threshold : 0.55;
                const sim = typeof sample.nearest_similarity === 'number' ? sample.nearest_similarity : 0;
                const delta = sim - threshold;

                return (
                  <div
                    key={sample.index}
                    className={`border rounded-2xl p-4 transition-all bg-white ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                        : sample.covered
                        ? 'border-slate-200/80 hover:border-slate-300'
                        : 'border-rose-200/90 hover:border-rose-300 bg-rose-50/10'
                    }`}
                  >
                    {/* Item Top Bar */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-slate-800">
                          Photo #{sample.index + 1}
                        </span>
                        <span
                          className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full border ${
                            sample.covered
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                              : 'bg-rose-50 text-rose-800 border-rose-200/80'
                          }`}
                        >
                          {sample.covered ? '✓ Covered' : '⚠ Potential Domain Gap'}
                        </span>
                      </div>

                      <button
                        onClick={() => handleSelectAndScrollToMap(sample.index)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                        title="Focus on scatter map"
                      >
                        <span>View on Map</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>

                    {/* Side-by-side Images with Proper Containment */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Left: Uploaded Photo */}
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block truncate">
                          Your Real-World Photo
                        </span>
                        <div className="aspect-square rounded-xl bg-slate-50 border border-slate-200/80 overflow-hidden flex items-center justify-center p-1.5 shadow-2xs">
                          {sample.thumbnail_url ? (
                            <img
                              src={sample.thumbnail_url}
                              alt={`Sample #${sample.index + 1}`}
                              className="w-full h-full object-contain rounded-lg"
                            />
                          ) : (
                            <Eye size={20} className="text-slate-300" />
                          )}
                        </div>
                      </div>

                      {/* Right: Closest Dataset Match */}
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block truncate">
                          Closest Dataset Match
                        </span>
                        <div className="aspect-square rounded-xl bg-slate-50 border border-slate-200/80 overflow-hidden flex items-center justify-center p-1.5 shadow-2xs">
                          {nearestMatch?.image_url ? (
                            <img
                              src={nearestMatch.image_url}
                              alt="Closest match in dataset"
                              className="w-full h-full object-contain rounded-lg"
                            />
                          ) : (
                            <Eye size={20} className="text-slate-300" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Proximity Stat Strip */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="text-slate-600">
                        Top similarity: <span className="font-bold text-slate-900">{formatPct(sample.nearest_similarity)}%</span>
                        <span className="text-slate-400 ml-1.5 font-normal">
                          (cutoff: {formatPct(threshold)}%)
                        </span>
                      </div>
                      <span className={`font-semibold ${delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {delta >= 0 ? `+${formatPct(delta)}% above cutoff` : `${formatPct(Math.abs(delta))}% below cutoff`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* -------------------------------------------------------------
           * SECTION 8: Actionable Next Steps
           * ------------------------------------------------------------- */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-[14px]">
              <Sparkles size={16} className="text-indigo-600" />
              <span>Recommended Next Steps for Model Preparation</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-[12px] text-slate-700">
              {counts.uncovered_samples > 0 ? (
                <>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                    <strong className="text-slate-900 block font-bold">
                      1. Inspect Specific Feature Discrepancies
                    </strong>
                    <p className="leading-relaxed text-slate-600">
                      Review the {counts.uncovered_samples} flagged images above to observe differences in lighting, camera angles, backgrounds, or subject variations compared to the closest training examples.
                    </p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                    <strong className="text-slate-900 block font-bold">
                      2. Target Data Augmentation or Collection
                    </strong>
                    <p className="leading-relaxed text-slate-600">
                      Consider augmenting the training dataset with targeted instances representing these specific real-world conditions prior to model deployment.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                    <strong className="text-slate-900 block font-bold">
                      1. Confirm Split Balance & Label Quality
                    </strong>
                    <p className="leading-relaxed text-slate-600">
                      While visual feature coverage is strong, ensure label balance, image resolution, and category distributions are verified using the Purpose Fitting tools.
                    </p>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
                    <strong className="text-slate-900 block font-bold">
                      2. Proceed with Held-Out Test Evaluation
                    </strong>
                    <p className="leading-relaxed text-slate-600">
                      Train a baseline model and evaluate predictions against an independent test split representative of your deployment setting.
                    </p>
                  </div>
                </>
              )}
            </div>

            <p className="text-[11px] text-slate-500 italic pt-1">
              Recommendations are evidence-based guidance derived from DINOv2 visual feature proximity. They do not guarantee downstream model performance.
            </p>
          </div>

          {/* Caveats Box (If returned by API) */}
          {gapResult.caveats && gapResult.caveats.length > 0 && (
            <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-4.5 space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-[12.5px]">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>Evaluation Caveats</span>
              </div>
              <ul className="space-y-1 pl-5 list-disc text-[11.5px] text-amber-900">
                {gapResult.caveats.map((cav, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {cav}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DatasetDomainGap(props) {
  return (
    <DomainGapErrorBoundary onBack={props.onBack}>
      <DatasetDomainGapContent {...props} />
    </DomainGapErrorBoundary>
  );
}
