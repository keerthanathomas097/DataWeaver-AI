import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  SlidersHorizontal,
  Layers,
  Award,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Info,
  Tag,
  Target,
  Maximize2,
  Search,
  Copy,
  Sparkles,
  Brain,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  RefreshCw,
  X,
  Eye,
  Database,
  BarChart2,
  Sliders,
} from 'lucide-react';
import { getWorkspacePurposeFitComparison } from '../api/purposeFittingApi';

// Plain-language purpose options
const PURPOSES = [
  {
    key: 'classification',
    display_name: 'Image Classification',
    short_description: 'Group images into predefined categories.',
    icon: Tag,
  },
  {
    key: 'object_detection',
    display_name: 'Object Detection',
    short_description: 'Find and locate objects inside images.',
    icon: Target,
  },
  {
    key: 'segmentation',
    display_name: 'Segmentation',
    short_description: 'Separate objects or regions within images.',
    icon: Maximize2,
  },
  {
    key: 'retrieval',
    display_name: 'Image Retrieval',
    short_description: 'Find images that look or mean something similar.',
    icon: Search,
  },
  {
    key: 'dedup_research',
    display_name: 'Dedup Research',
    short_description: 'Find repeated or near-identical images.',
    icon: Copy,
  },
  {
    key: 'generative',
    display_name: 'Generative Modeling',
    short_description: 'Create new images from the dataset.',
    icon: Sparkles,
  },
  {
    key: 'self_supervised',
    display_name: 'Self-Supervised Learning',
    short_description: 'Learn visual representations without human labels.',
    icon: Brain,
  },
  {
    key: 'benchmarking',
    display_name: 'Benchmarking',
    short_description: 'Evaluate models consistently on a test dataset.',
    icon: Award,
  },
];

// Helper to format criterion values with human-friendly units
function formatCriterionValue(metricKey, val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    if (metricKey === 'duplicate_ratio' || metricKey === 'high_blur_ratio') {
      return `${(val > 1 ? val : val * 100).toFixed(1)}%`;
    }
    if (metricKey === 'long_tail_imbalance') {
      return `${val.toFixed(1)}x`;
    }
    if (metricKey === 'low_silhouette_score') {
      return val.toFixed(2);
    }
    if (metricKey === 'zero_resolution_variance' || metricKey === 'single_aspect_ratio') {
      return val === 0 ? 'Uniform (std=0)' : `Varied (std=${val.toFixed(1)})`;
    }
    if (metricKey === 'low_visual_diversity') {
      return `${val} clusters`;
    }
    if (val < 1 && val > 0) {
      return val.toFixed(3);
    }
    return val.toLocaleString();
  }
  return String(val);
}

// Cell styling based on verdict
function getVerdictStyle(verdict, applicable = true) {
  if (!applicable) {
    return {
      label: 'N/A',
      badgeClass: 'bg-slate-100 text-slate-400 border-slate-200/60',
      dotClass: 'bg-slate-300',
      textColor: 'text-slate-400',
    };
  }
  switch (verdict) {
    case 'favorable':
      return {
        label: 'Favorable',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dotClass: 'bg-emerald-500',
        textColor: 'text-emerald-700',
      };
    case 'neutral':
      return {
        label: 'Neutral',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200/80',
        dotClass: 'bg-blue-500',
        textColor: 'text-blue-700',
      };
    case 'warning':
      return {
        label: 'Warning',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dotClass: 'bg-amber-500',
        textColor: 'text-amber-700',
      };
    case 'critical':
      return {
        label: 'Critical',
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200/80',
        dotClass: 'bg-rose-500',
        textColor: 'text-rose-700',
      };
    default:
      return {
        label: 'Unavailable',
        badgeClass: 'bg-slate-50 text-slate-500 border-slate-200/80',
        dotClass: 'bg-slate-400',
        textColor: 'text-slate-500',
      };
  }
}

// Assessment Tier Pill Styling
function getTierStyle(overallStatus) {
  switch (overallStatus) {
    case 'Good Fit':
      return {
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotClass: 'bg-emerald-500',
        icon: CheckCircle2,
      };
    case 'Review Recommended':
      return {
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        dotClass: 'bg-amber-500',
        icon: AlertTriangle,
      };
    case 'Significant Concerns':
      return {
        badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
        dotClass: 'bg-rose-500',
        icon: AlertOctagon,
      };
    default:
      return {
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
        icon: Info,
      };
  }
}

export default function PurposeFitComparison({
  referenceDataset,
  activeWorkspaceId,
  initialPurposeKey = 'classification',
  onPurposeChange = () => {},
  onBack,
}) {
  const [selectedPurpose, setSelectedPurpose] = useState(initialPurposeKey);
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inspection Drawer State
  const [inspectedCandidateId, setInspectedCandidateId] = useState(
    referenceDataset?.dataset_id || null
  );
  const [highlightedMetricKey, setHighlightedMetricKey] = useState(null);

  // Sync purpose changes with parent
  const handleSelectPurpose = (key) => {
    setSelectedPurpose(key);
    onPurposeChange(key);
  };

  // Fetch comparison data whenever activeWorkspaceId or selectedPurpose changes
  useEffect(() => {
    if (!activeWorkspaceId) return;

    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getWorkspacePurposeFitComparison(
          activeWorkspaceId,
          selectedPurpose,
          referenceDataset?.dataset_id
        );
        if (isMounted) {
          setComparisonData(res);
          // If inspected candidate not set or no longer present, default to reference dataset
          if (
            !inspectedCandidateId ||
            !res.candidates?.some((c) => c.dataset_id === inspectedCandidateId)
          ) {
            setInspectedCandidateId(referenceDataset?.dataset_id || res.candidates?.[0]?.dataset_id);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load purpose-fit comparison:', err);
          setError(
            err.response?.data?.detail || 'Failed to retrieve workspace purpose-fitting comparison.'
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [activeWorkspaceId, selectedPurpose, referenceDataset?.dataset_id]);

  const currentPurposeMeta = useMemo(() => {
    return (
      PURPOSES.find((p) => p.key === selectedPurpose) || {
        key: selectedPurpose,
        display_name: comparisonData?.purpose_display_name || selectedPurpose,
        short_description: '',
        icon: Tag,
      }
    );
  }, [selectedPurpose, comparisonData]);

  // Evaluated vs Unevaluated Candidates
  const evaluatedCandidates = useMemo(() => {
    return comparisonData?.candidates?.filter((c) => c.eligibility_status === 'evaluated') || [];
  }, [comparisonData]);

  const unevaluatedCandidates = useMemo(() => {
    return comparisonData?.candidates?.filter((c) => c.eligibility_status !== 'evaluated') || [];
  }, [comparisonData]);

  // Selected candidate for deep inspection
  const inspectedCandidate = useMemo(() => {
    if (!comparisonData?.candidates) return null;
    return (
      comparisonData.candidates.find((c) => c.dataset_id === inspectedCandidateId) ||
      comparisonData.candidates[0] ||
      null
    );
  }, [comparisonData, inspectedCandidateId]);

  return (
    <div className="space-y-6 pb-16 text-slate-800">
      {/* -------------------------------------------------------------
       * SECTION 1: Top Navigation & Workspace Comparison Context
       * ------------------------------------------------------------- */}
      <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl border border-[#D5DCD1] flex items-center justify-center text-[#69746A] hover:text-[#202923] hover:bg-[#E7EAE4] transition-colors cursor-pointer shrink-0 mt-0.5"
              title="Return to Purpose Fitting View"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#24543D] bg-[#24543D]/10 px-2.5 py-0.5 rounded-full border border-[#24543D]/20 flex items-center gap-1.5">
                  <SlidersHorizontal size={12} />
                  <span>Workspace Comparison</span>
                </span>
                <span className="text-[#D5DCD1]">•</span>
                <span className="text-[12px] font-semibold text-[#69746A]">
                  Workspace: <strong className="text-[#202923]">{comparisonData?.workspace_name || 'Active Workspace'}</strong>
                </span>
                <span className="text-[#D5DCD1]">•</span>
                <span className="text-[12px] font-semibold text-[#69746A]">
                  Reference: <strong className="text-[#202923]">{referenceDataset?.dataset_name || 'Current Dataset'}</strong>
                </span>
              </div>
              <h2 className="font-serif font-bold text-[21px] text-[#202923] tracking-tight">
                Purpose Fitting Dataset Comparison
              </h2>
              <p className="text-[12.5px] text-[#69746A]">
                Compare candidate datasets in this workspace side-by-side to evaluate which dataset best fits your intended research purpose.
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-[#F7F5EE] border border-[#D5DCD1] text-[12px] text-[#69746A] flex items-center gap-3">
              <div>
                <span className="text-[#69746A] block text-[10.5px] font-medium">Eligible Candidates</span>
                <span className="font-extrabold text-[15px] text-[#202923]">
                  {evaluatedCandidates.length}
                  <span className="text-[11px] text-[#69746A] font-normal ml-1">
                    of {comparisonData?.total_datasets_in_workspace ?? 0}
                  </span>
                </span>
              </div>
              {unevaluatedCandidates.length > 0 && (
                <div className="pl-3 border-l border-[#D5DCD1]">
                  <span className="text-[#69746A] block text-[10.5px] font-medium">Awaiting Profile</span>
                  <span className="font-extrabold text-[15px] text-amber-700">
                    {unevaluatedCandidates.length}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
         * Interactive Purpose Selector Tabs (8 Purposes)
         * ------------------------------------------------------------- */}
        <div className="mt-5 pt-4 border-t border-[#D5DCD1] space-y-2">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="font-bold uppercase tracking-wider text-[#69746A]">
              Select Research Purpose to Compare:
            </span>
            <span className="text-[#69746A] italic">
              Each purpose applies its own verified criteria matrix
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
            {PURPOSES.map((purpose) => {
              const Icon = purpose.icon;
              const isSelected = selectedPurpose === purpose.key;

              return (
                <button
                  key={purpose.key}
                  onClick={() => handleSelectPurpose(purpose.key)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#24543D] bg-[#24543D]/10 shadow-2xs ring-1 ring-[#24543D]/20'
                      : 'border-[#D5DCD1] hover:border-[#52725D] hover:bg-[#E7EAE4]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Icon
                      size={14}
                      className={isSelected ? 'text-[#24543D]' : 'text-[#69746A]'}
                    />
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#24543D]" />
                    )}
                  </div>
                  <span
                    className={`font-bold text-[11px] leading-tight truncate ${
                      isSelected ? 'text-[#24543D] font-black' : 'text-[#202923]'
                    }`}
                  >
                    {purpose.display_name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Error State
       * ------------------------------------------------------------- */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertOctagon size={22} />
          </div>
          <h4 className="font-extrabold text-[15px] text-rose-900">
            Comparison Failed to Load
          </h4>
          <p className="text-[12.5px] text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[12px] font-bold transition-colors cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Loading State
       * ------------------------------------------------------------- */}
      {isLoading && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-12 text-center space-y-3 shadow-2xs">
          <RefreshCw size={28} className="animate-spin text-[#24543D] mx-auto" />
          <h4 className="font-serif font-bold text-[16px] text-[#202923]">
            Evaluating Workspace Candidates for {currentPurposeMeta.display_name}...
          </h4>
          <p className="text-[12px] text-[#69746A]">
            Running deterministic criteria checks across eligible workspace datasets.
          </p>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Main Comparison Interface (When Loaded)
       * ------------------------------------------------------------- */}
      {!isLoading && !error && comparisonData && (
        <div className="space-y-6">
          {/* -------------------------------------------------------------
           * SECTION 2: Ranked Horizontal Comparison Chart (Centerpiece)
           * ------------------------------------------------------------- */}
          <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                  Primary Comparison Centerpiece
                </span>
                <h3 className="font-serif font-bold text-[18px] text-[#202923] tracking-tight mt-0.5">
                  Which eligible dataset fits {currentPurposeMeta.display_name} best?
                </h3>
                <p className="text-[12.5px] text-[#69746A] mt-1">
                  Ranked by adherence to purpose criteria. Datasets in higher tiers meet all required quality baselines with fewer warnings and concerns.
                </p>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-3 text-[11px] font-semibold text-[#69746A] bg-[#F7F5EE] px-3 py-1.5 rounded-xl border border-[#D5DCD1] self-start sm:self-auto">
                <div className="flex items-center gap-1.5" title="Favorable characteristics meeting target thresholds">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
                  <span>Favorable</span>
                </div>
                <div className="flex items-center gap-1.5" title="Neutral observations with no concern">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                  <span>Neutral</span>
                </div>
                <div className="flex items-center gap-1.5" title="Advisory warnings to review">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span>Warning</span>
                </div>
                <div className="flex items-center gap-1.5" title="Significant concerns for this purpose">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                  <span>Critical</span>
                </div>
              </div>
            </div>

            {/* Evaluated Candidates Horizontal Bar Chart */}
            {evaluatedCandidates.length === 0 ? (
              <div className="bg-[#F7F5EE] border border-dashed border-[#D5DCD1] rounded-2xl p-10 text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-[#24543D]/10 text-[#24543D] flex items-center justify-center mx-auto">
                  <Database size={22} />
                </div>
                <h4 className="font-serif font-bold text-[14px] text-[#202923]">
                  No Profiled Datasets Found in this Workspace
                </h4>
                <p className="text-[12px] text-[#69746A] max-w-md mx-auto">
                  To compare datasets for {currentPurposeMeta.display_name}, profile at least one dataset in this workspace first.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {evaluatedCandidates.map((candidate) => {
                  const isRef = candidate.is_reference;
                  const isInspected = candidate.dataset_id === inspectedCandidateId;
                  const total =
                    candidate.total_applicable_rules > 0
                      ? candidate.total_applicable_rules
                      : (candidate.favorable_count + candidate.neutral_count + candidate.warning_count + candidate.critical_count) || 1;

                  const favPct = (candidate.favorable_count / total) * 100;
                  const neutPct = (candidate.neutral_count / total) * 100;
                  const warnPct = (candidate.warning_count / total) * 100;
                  const critPct = (candidate.critical_count / total) * 100;

                  const tierStyle = getTierStyle(candidate.overall_status);
                  const TierIcon = tierStyle.icon;

                  return (
                    <div
                      key={candidate.dataset_id}
                      onClick={() => setInspectedCandidateId(candidate.dataset_id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                        isInspected
                          ? 'border-[#24543D] ring-2 ring-[#24543D]/20 bg-[#24543D]/5 shadow-2xs'
                          : isRef
                          ? 'border-[#D5DCD1] bg-[#F7F5EE]/60 hover:bg-[#E7EAE4]/50'
                          : 'border-[#D5DCD1] bg-[#FCFAF6] hover:border-[#52725D] hover:bg-[#E7EAE4]/30'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Left: Rank & Dataset Identification */}
                        <div className="flex items-center gap-3 min-w-[240px] max-w-sm shrink-0">
                          <div
                            className={`w-8 h-8 rounded-xl font-black text-[13px] flex items-center justify-center shrink-0 border ${
                              candidate.rank === 1
                                ? 'bg-[#24543D] text-white border-[#24543D] shadow-2xs'
                                : candidate.rank === 2
                                ? 'bg-[#E7EAE4] text-[#202923] border-[#D5DCD1]'
                                : 'bg-[#F7F5EE] text-[#69746A] border-[#D5DCD1]'
                            }`}
                            title={`Rank #${candidate.rank}${candidate.is_tied ? ' (Tied)' : ''}`}
                          >
                            #{candidate.rank}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4
                                className="font-bold text-[13.5px] text-[#202923] truncate leading-snug"
                                title={candidate.dataset_name}
                              >
                                {candidate.dataset_name}
                              </h4>
                              {isRef && (
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-[#24543D]/10 text-[#24543D] border border-[#24543D]/20 shrink-0">
                                  Current Reference
                                </span>
                              )}
                              {candidate.is_tied && (
                                <span className="text-[10px] font-semibold text-[#69746A] bg-[#E7EAE4] px-1.5 py-0.5 rounded shrink-0">
                                  Tied
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[#69746A] font-medium">
                              {candidate.dataset_image_count.toLocaleString()} images
                            </span>
                          </div>
                        </div>

                        {/* Middle: Horizontal Stacked Bar */}
                        <div className="flex-1 px-2 space-y-1.5">
                          <div className="h-3 w-full bg-[#E7EAE4] rounded-full overflow-hidden flex shadow-inner">
                            {favPct > 0 && (
                              <div
                                style={{ width: `${favPct}%` }}
                                className="bg-emerald-600 h-full transition-all duration-300"
                                title={`Favorable: ${candidate.favorable_count} criteria`}
                              />
                            )}
                            {neutPct > 0 && (
                              <div
                                style={{ width: `${neutPct}%` }}
                                className="bg-blue-500 h-full transition-all duration-300"
                                title={`Neutral: ${candidate.neutral_count} criteria`}
                              />
                            )}
                            {warnPct > 0 && (
                              <div
                                style={{ width: `${warnPct}%` }}
                                className="bg-amber-500 h-full transition-all duration-300"
                                title={`Warning: ${candidate.warning_count} criteria`}
                              />
                            )}
                            {critPct > 0 && (
                              <div
                                style={{ width: `${critPct}%` }}
                                className="bg-rose-500 h-full transition-all duration-300"
                                title={`Critical: ${candidate.critical_count} criteria`}
                              />
                            )}
                          </div>

                          {/* Metric breakdown labels */}
                          <div className="flex items-center justify-between text-[11px] text-[#69746A] font-medium">
                            <span className="text-emerald-800 font-bold">
                              {candidate.favorable_count} favorable
                            </span>
                            <span className="text-blue-800 font-bold">
                              {candidate.neutral_count} neutral
                            </span>
                            <span className={candidate.warning_count > 0 ? 'text-amber-800 font-bold' : 'text-[#69746A]'}>
                              {candidate.warning_count} warnings
                            </span>
                            <span className={candidate.critical_count > 0 ? 'text-rose-800 font-bold' : 'text-[#69746A]'}>
                              {candidate.critical_count} critical
                            </span>
                          </div>
                        </div>

                        {/* Right: Assessment Pill & Selection Action */}
                        <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
                          <div
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11.5px] font-bold ${tierStyle.badgeClass}`}
                          >
                            <TierIcon size={13} />
                            <span>{candidate.overall_status}</span>
                          </div>

                          <span
                            className={`text-[11px] font-bold flex items-center gap-0.5 ${
                              isInspected ? 'text-[#24543D]' : 'text-[#69746A] group-hover:text-[#202923]'
                            }`}
                          >
                            <span>{isInspected ? 'Selected' : 'Inspect'}</span>
                            <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unprofiled Datasets Note (Honest representation of missing results) */}
            {unevaluatedCandidates.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-[12px] font-bold text-slate-700 pb-2">
                  <span className="flex items-center gap-1.5">
                    <Info size={14} className="text-amber-600" />
                    <span>Workspace Datasets Awaiting Profiling ({unevaluatedCandidates.length})</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-400">
                    These datasets must complete profiling before purpose assessment can run.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {unevaluatedCandidates.map((cand) => (
                    <div
                      key={cand.dataset_id}
                      className="p-3 bg-[#F7F5EE]/70 border border-[#D5DCD1] rounded-xl flex items-center justify-between gap-3 text-[12px]"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-[#202923] truncate block">
                          {cand.dataset_name}
                        </span>
                        <span className="text-[11px] text-[#69746A]">
                          {cand.status_message || 'Profiling not yet executed.'}
                        </span>
                      </div>
                      <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#E7EAE4] text-[#24543D] shrink-0 border border-[#D5DCD1]">
                        {cand.eligibility_status === 'profiling' ? 'Profiling...' : 'Unprofiled'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transparent Methodology Disclaimer */}
            <div className="bg-[#F7F5EE]/80 border border-[#D5DCD1] rounded-xl p-3 text-[11px] text-[#69746A] leading-relaxed">
              <strong className="text-[#202923]">Evaluation Methodology:</strong> {comparisonData.methodology_note}
            </div>
          </div>

          {/* -------------------------------------------------------------
           * SECTION 3: Supporting Criteria Comparison Matrix
           * ------------------------------------------------------------- */}
          <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#D5DCD1]/60">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                  Supporting Evidence
                </span>
                <h3 className="font-serif font-bold text-[18px] text-[#202923] tracking-tight mt-0.5">
                  Purpose Criteria Comparison Matrix
                </h3>
                <p className="text-[12px] text-[#69746A] mt-0.5">
                  Side-by-side metric comparison for {currentPurposeMeta.display_name}. Click any row or cell to view detailed rule explanations.
                </p>
              </div>

              {/* Compact Category Legend */}
              <div className="flex items-center gap-2 text-[10.5px] font-bold flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  ✓ Favorable
                </span>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                  • Neutral
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                  ⚠ Warning
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200">
                  ! Critical
                </span>
                <span className="px-2 py-0.5 rounded-md bg-[#E7EAE4] text-[#69746A] border border-[#D5DCD1]">
                  — N/A
                </span>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#D5DCD1] text-[#69746A] uppercase text-[10.5px] font-bold">
                    <th className="py-2.5 px-3 min-w-[200px] sticky left-0 bg-[#FCFAF6] z-10 shadow-2xs">
                      Criterion / Characteristic
                    </th>
                    {evaluatedCandidates.map((cand) => (
                      <th
                        key={cand.dataset_id}
                        className={`py-2.5 px-3 min-w-[150px] text-center ${
                          cand.is_reference
                            ? 'bg-[#24543D]/5 text-[#24543D] font-extrabold border-x border-[#D5DCD1]'
                            : 'text-[#202923]'
                        }`}
                      >
                        <div className="truncate max-w-[160px] mx-auto" title={cand.dataset_name}>
                          {cand.dataset_name}
                        </div>
                        {cand.is_reference && (
                          <span className="text-[9.5px] uppercase tracking-wider block text-[#24543D] font-bold">
                            (Reference)
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D5DCD1]/50 text-[#202923]">
                  {comparisonData.matrix_criteria.map((crit) => {
                    const isMetricHighlighted = highlightedMetricKey === crit.metric_key;

                    return (
                      <tr
                        key={crit.metric_key}
                        onClick={() =>
                          setHighlightedMetricKey(isMetricHighlighted ? null : crit.metric_key)
                        }
                        className={`hover:bg-[#F7F5EE]/80 transition-colors cursor-pointer ${
                          isMetricHighlighted ? 'bg-[#24543D]/5' : ''
                        }`}
                      >
                        {/* Criterion Label & Threshold */}
                        <td className="py-3 px-3 font-semibold sticky left-0 bg-[#FCFAF6] z-10 space-y-0.5 shadow-2xs">
                          <span className="text-[#202923] font-bold block">
                            {crit.plain_label}
                          </span>
                          <span className="text-[10.5px] text-[#69746A] block font-normal">
                            Target rule: {crit.operator || ''} {crit.threshold !== null ? crit.threshold : 'configured'} {crit.unit || ''}
                          </span>
                        </td>

                        {/* Candidate Data Cells */}
                        {evaluatedCandidates.map((cand) => {
                          const candidateRule = cand.fit_result?.all_rules?.find(
                            (r) => r.metric_key === crit.metric_key
                          );

                          const unavailableInfo = cand.fit_result?.unavailable_metrics?.find(
                            (u) => u.metric_key === crit.metric_key
                          );

                          const isApplicable = candidateRule ? candidateRule.applicable : crit.applicable;
                          const verdict = candidateRule ? candidateRule.verdict : unavailableInfo ? 'unavailable' : 'neutral';
                          const style = getVerdictStyle(verdict, isApplicable);

                          const formattedVal = candidateRule?.metric_value !== undefined && candidateRule?.metric_value !== null
                            ? formatCriterionValue(crit.metric_key, candidateRule.metric_value)
                            : unavailableInfo
                            ? 'Not computed'
                            : !isApplicable
                            ? 'N/A'
                            : '—';

                          return (
                            <td
                              key={cand.dataset_id}
                              className={`py-3 px-3 text-center align-middle ${
                                cand.is_reference
                                  ? 'bg-[#24543D]/5 border-x border-[#D5DCD1]/60'
                                  : ''
                              }`}
                            >
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span className="font-extrabold text-[12px] text-[#202923]">
                                  {formattedVal}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.badgeClass}`}
                                  title={candidateRule?.message || unavailableInfo?.reason || ''}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${style.dotClass}`} />
                                  <span>{style.label}</span>
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* -------------------------------------------------------------
           * SECTION 4: Detailed Candidate Inspection Panel
           * ------------------------------------------------------------- */}
          {inspectedCandidate && inspectedCandidate.fit_result && (
            <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D5DCD1]/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#24543D]/10 text-[#24543D] flex items-center justify-center font-bold text-[13px] border border-[#24543D]/20">
                    #{inspectedCandidate.rank || '—'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-serif font-bold text-[17px] text-[#202923]">
                        {inspectedCandidate.dataset_name}
                      </h4>
                      {inspectedCandidate.is_reference && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-[#24543D]/15 text-[#24543D] border border-[#24543D]/25">
                          Current Reference
                        </span>
                      )}
                      <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-[#D5DCD1] bg-[#F7F5EE] text-[#202923]">
                        {inspectedCandidate.overall_status}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#69746A] mt-0.5">
                      Detailed purpose-fitting findings and supporting evidence for {currentPurposeMeta.display_name}.
                    </p>
                  </div>
                </div>

                {/* Candidate Selector Pill */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-[11.5px] font-semibold text-[#69746A]">Inspect candidate:</span>
                  <select
                    value={inspectedCandidate.dataset_id}
                    onChange={(e) => setInspectedCandidateId(e.target.value)}
                    className="px-2.5 py-1.5 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl text-[12px] font-semibold text-[#202923] outline-none focus:border-[#24543D] cursor-pointer"
                  >
                    {evaluatedCandidates.map((c) => (
                      <option key={c.dataset_id} value={c.dataset_id}>
                        #{c.rank} {c.dataset_name} {c.is_reference ? '(Reference)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Flagged Findings List */}
              <div className="space-y-2.5">
                <h5 className="font-bold text-[13px] text-[#202923] flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600" />
                  <span>Flagged Findings for Review ({inspectedCandidate.fit_result.flagged_findings?.length ?? 0})</span>
                </h5>

                {inspectedCandidate.fit_result.flagged_findings?.length === 0 ? (
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/70 rounded-xl text-[12px] text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>No critical or advisory warnings identified for this purpose. All applicable criteria meet required baselines.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {inspectedCandidate.fit_result.flagged_findings.map((finding) => (
                      <div
                        key={finding.rule_id}
                        className={`p-3.5 rounded-xl border text-[12px] space-y-1 ${
                          finding.verdict === 'critical'
                            ? 'bg-rose-50/60 border-rose-200/90 text-rose-900'
                            : 'bg-amber-50/60 border-amber-200/90 text-amber-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[12.5px]">
                            {finding.metric_display_name}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full border ${
                              finding.verdict === 'critical'
                                ? 'bg-rose-100 text-rose-800 border-rose-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                            }`}
                          >
                            {finding.verdict}
                          </span>
                        </div>
                        <p className="font-semibold text-[#202923]">{finding.message}</p>
                        <p className="text-[11.5px] text-[#69746A] leading-snug">{finding.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Favorable Characteristics Summary */}
              {inspectedCandidate.fit_result.dataset_characteristics && inspectedCandidate.fit_result.dataset_characteristics.length > 0 && (
                <div className="pt-2 border-t border-[#D5DCD1]/60 space-y-2">
                  <h5 className="font-bold text-[13px] text-[#202923] flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>Favorable Characteristics ({inspectedCandidate.favorable_count})</span>
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11.5px]">
                    {inspectedCandidate.fit_result.dataset_characteristics
                      .filter((c) => c.verdict === 'favorable')
                      .map((char) => (
                        <div
                          key={char.rule_id}
                          className="p-2.5 bg-[#F7F5EE] border border-[#D5DCD1] rounded-lg space-y-0.5"
                        >
                          <span className="font-bold text-[#202923] block truncate">
                            {char.metric_display_name}
                          </span>
                          <span className="text-[#69746A] text-[11px] block leading-tight">
                            {char.message}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

