import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Layers,
  Eye,
  Tag,
  ChevronDown,
  ChevronUp,
  Loader2,
  XCircle,
  ArrowLeft,
  PieChart,
  Activity,
  ShieldCheck,
  Zap,
  Info,
  Sliders,
  Check,
  HelpCircle,
  Copy,
  ExternalLink,
  Sun,
  Moon,
  Camera,
  Maximize2,
  Target,
} from 'lucide-react';
import DatasetPurposeFit from './DatasetPurposeFit';
import {
  startProfiling,
  getProfilingStatus,
  getProfilingResults,
  cancelProfiling,
} from '../api/profilingApi';

const PIPELINE_STAGES = [
  { key: 'initializing', label: 'Initializing' },
  { key: 'calculating_basic_stats', label: 'Image Properties' },
  { key: 'calculating_quality', label: 'Quality & Sharpness' },
  { key: 'calculating_duplicates', label: 'Duplicate Analysis' },
  { key: 'generating_embeddings', label: 'Visual Representations' },
  { key: 'clustering', label: 'Visual Grouping' },
  { key: 'extracting_metadata', label: 'Dataset Insights' },
];

/* -------------------------------------------------------------
 * Reusable Power BI Style Charts (Zero-Dependency Pure SVG)
 * ------------------------------------------------------------- */

/**
 * Interactive SVG Donut Chart with center label and legend
 */
function DonutChart({
  data = [],
  size = 150,
  strokeWidth = 22,
  centerLabel = '',
  centerSublabel = '',
}) {
  const total = data.reduce((acc, d) => acc + (d.value || 0), 0);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-slate-400 text-[12px]">
        <span>No data available</span>
      </div>
    );
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const activeItem = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5 justify-center">
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {data.map((item, idx) => {
            const val = item.value || 0;
            const fraction = val / total;
            const strokeDashoffset = circumference * (1 - fraction);
            const rotation = accumulated * 360;
            accumulated += fraction;

            const isHovered = hoveredIdx === idx;

            return (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          {activeItem ? (
            <>
              <span className="text-[16px] font-extrabold text-slate-800 leading-none">
                {activeItem.value}
              </span>
              <span className="text-[10px] font-bold text-slate-500 mt-0.5 truncate max-w-[90px]">
                {activeItem.label}
              </span>
            </>
          ) : (
            <>
              <span className="text-[16px] font-extrabold text-slate-800 leading-none">
                {centerLabel || total}
              </span>
              {centerSublabel && (
                <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {centerSublabel}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-1.5 min-w-[130px]">
        {data.map((item, idx) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between text-[12px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                isHovered ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-700 font-medium capitalize">{item.label}</span>
              </div>
              <span className="font-bold text-slate-900 ml-3">
                {item.value} <span className="text-slate-400 font-normal text-[11px]">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal metric distribution bar
 */
function HorizontalDistributionBar({ label, value, total, countLabel, color = 'bg-blue-500', badge, sublabel }) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-[12.5px]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700">{label}</span>
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-600">
              {badge}
            </span>
          )}
        </div>
        <div className="font-bold text-slate-800">
          {countLabel || value}{' '}
          <span className="text-slate-400 font-medium text-[11px]">({pct}%)</span>
        </div>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, Number(pct)))}%` }}
        />
      </div>
      {sublabel && <p className="text-[10.5px] text-slate-400">{sublabel}</p>}
    </div>
  );
}

/**
 * Top KPI Metric Card with Power BI styling
 */
function KpiCard({ title, value, subtext, icon: Icon, tone = 'blue', onClick }) {
  const toneClasses = {
    blue: {
      bg: 'bg-blue-50/70',
      text: 'text-blue-600',
      border: 'border-blue-100',
      valColor: 'text-slate-800',
    },
    green: {
      bg: 'bg-emerald-50/70',
      text: 'text-emerald-600',
      border: 'border-emerald-100',
      valColor: 'text-emerald-700',
    },
    amber: {
      bg: 'bg-amber-50/70',
      text: 'text-amber-600',
      border: 'border-amber-100',
      valColor: 'text-amber-700',
    },
    red: {
      bg: 'bg-rose-50/70',
      text: 'text-rose-600',
      border: 'border-rose-100',
      valColor: 'text-rose-700',
    },
    purple: {
      bg: 'bg-purple-50/70',
      text: 'text-purple-600',
      border: 'border-purple-100',
      valColor: 'text-purple-700',
    },
  }[tone] || {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-100',
    valColor: 'text-slate-800',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs transition-all ${
        onClick ? 'cursor-pointer hover:border-blue-300 hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
          {title}
        </span>
        <div className={`w-8 h-8 rounded-xl ${toneClasses.bg} ${toneClasses.text} flex items-center justify-center shrink-0`}>
          <Icon size={16} />
        </div>
      </div>
      <div className={`text-[24px] font-extrabold mt-1.5 leading-tight ${toneClasses.valColor}`}>
        {value}
      </div>
      {subtext && (
        <p className="text-[11.5px] text-slate-500 font-medium mt-1 truncate">
          {subtext}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------
 * Deterministic Natural Language Insights Generator
 * ------------------------------------------------------------- */
function generateDatasetInsights(profileData) {
  if (!profileData) return [];

  const insights = [];
  const basic = profileData.basic_statistics || {};
  const quality = profileData.quality || {};
  const duplicates = profileData.duplicates || {};
  const diversity = profileData.diversity || {};
  const labels = profileData.labels || {};
  const metadata = profileData.metadata_insights || {};

  // 1. Quality insight
  const normalPct = quality.percentages?.normal_pct ?? 100;
  const flaggedCount = quality.counts?.flagged_total ?? 0;
  if (normalPct >= 95) {
    insights.push({
      type: 'success',
      text: `High overall quality: ${normalPct}% of images meet sharpness, exposure, and integrity standards.`,
    });
  } else if (flaggedCount > 0) {
    const reasons = [];
    if (quality.counts?.blurred > 0) reasons.push(`${quality.counts.blurred} blurry`);
    if (quality.counts?.under_exposed > 0) reasons.push(`${quality.counts.under_exposed} underexposed`);
    if (quality.counts?.over_exposed > 0) reasons.push(`${quality.counts.over_exposed} overexposed`);
    insights.push({
      type: 'warning',
      text: `${flaggedCount} image${flaggedCount > 1 ? 's' : ''} need quality review (${reasons.join(', ')}).`,
    });
  }

  // 2. Format & Dimensions
  const formats = Object.entries(basic.formats || {});
  if (formats.length === 1) {
    insights.push({
      type: 'success',
      text: `Consistent file format: 100% of images are encoded in standard ${formats[0][0]}.`,
    });
  } else if (formats.length > 1) {
    insights.push({
      type: 'info',
      text: `Multi-format dataset: contains ${formats.length} distinct image formats (${formats.map(([f, c]) => `${f}: ${c}`).join(', ')}).`,
    });
  }

  // 3. Aspect Ratio
  const aspectCats = basic.aspect_ratios?.categories || {};
  const squareCount = aspectCats.square || 0;
  const totalImgs = basic.total_images || 1;
  const squarePct = Math.round((squareCount / totalImgs) * 100);
  if (squarePct >= 60) {
    insights.push({
      type: 'success',
      text: `Consistent geometry: ${squarePct}% of images use a uniform square (1:1) aspect ratio.`,
    });
  } else if (Object.keys(aspectCats).length > 1) {
    insights.push({
      type: 'info',
      text: `Mixed orientations: images vary across square (${aspectCats.square || 0}), landscape (${aspectCats.landscape || 0}), and portrait (${aspectCats.portrait || 0}).`,
    });
  }

  // 4. Duplicate Findings
  if (duplicates.status === 'completed') {
    const dupRatio = duplicates.duplicate_ratio ?? 0;
    const dupPct = (dupRatio * 100).toFixed(1);
    if (dupRatio >= 0.2) {
      insights.push({
        type: 'warning',
        text: `High duplicate presence: ${dupPct}% of images (${duplicates.affected_images_count}) belong to ${duplicates.duplicate_groups_count} duplicate groups. Review to prevent data leakage.`,
      });
    } else if (duplicates.duplicate_groups_count > 0) {
      insights.push({
        type: 'info',
        text: `Mild duplication: ${duplicates.duplicate_groups_count} duplicate groups identified (${duplicates.affected_images_count} affected images).`,
      });
    } else {
      insights.push({
        type: 'success',
        text: 'Zero duplicates: all images in this dataset appear visually distinct.',
      });
    }
  }

  // 5. Visual Variety
  if (diversity.status === 'completed') {
    const groups = diversity.cluster_count ?? 0;
    const outliers = diversity.noise_count ?? 0;
    if (groups > 0) {
      insights.push({
        type: 'info',
        text: `Visual variety: contains ${groups} distinct visual groupings with ${outliers} standalone individual images.`,
      });
    }
  }

  // 6. Categories
  if (labels.status === 'available') {
    insights.push({
      type: labels.metrics?.balance_indicator === 'well_balanced' ? 'success' : 'info',
      text: `Category distribution: ${labels.num_classes} distinct classes found with a ${labels.metrics?.balance_indicator?.replace(/_/g, ' ') || 'standard'} proportion.`,
    });
  }

  // 7. Stated Purpose from Documentation
  if (metadata.status === 'completed' && metadata.stated_purpose) {
    insights.push({
      type: 'info',
      text: `Stated Purpose: "${metadata.stated_purpose}"`,
    });
  }

  return insights;
}

/* -------------------------------------------------------------
 * Main Dataset Profiling View Component
 * ------------------------------------------------------------- */
export default function DatasetProfilingView({
  dataset,
  workspaceDatasets = [],
  onSelectDataset,
  onBack,
  onNavigateToDuplicates,
}) {
  const [activeDataset, setActiveDataset] = useState(dataset || workspaceDatasets[0] || null);
  const [status, setStatus] = useState('loading'); // 'loading', 'not_profiled', 'profiling', 'completed', 'failed', 'cancelled'
  const [stage, setStage] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFlaggedImages, setShowFlaggedImages] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [activeSection, setActiveSection] = useState('all'); // 'all', 'overview', 'quality', 'variety', 'categories', 'duplicates', 'insights'
  const [showPurposeFit, setShowPurposeFit] = useState(false);

  // Sync active dataset if prop changes
  useEffect(() => {
    if (dataset && dataset.dataset_id !== activeDataset?.dataset_id) {
      setActiveDataset(dataset);
    }
  }, [dataset]);

  const datasetId = activeDataset?.dataset_id;

  const loadProfilingData = useCallback(async (isPolling = false) => {
    if (!datasetId) {
      setStatus('not_profiled');
      return;
    }

    try {
      if (!isPolling) {
        setIsRefreshing(true);
      }
      const statusRes = await getProfilingStatus(datasetId);
      setStatus(statusRes.status);
      setStage(statusRes.stage);

      if (statusRes.status === 'completed') {
        const resultsRes = await getProfilingResults(datasetId);
        setProfileData(resultsRes.profile_payload);
      }
    } catch (err) {
      if (err.response?.status === 404 && status === 'not_profiled') {
        // Not yet profiled
      } else {
        console.error('Failed to fetch profiling data:', err);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [datasetId, status]);

  // Initial load
  useEffect(() => {
    loadProfilingData();
  }, [datasetId]);

  // Polling loop when in 'profiling' status
  useEffect(() => {
    if (status !== 'profiling' || !datasetId) return;

    const interval = setInterval(async () => {
      try {
        const statusRes = await getProfilingStatus(datasetId);
        setStatus(statusRes.status);
        setStage(statusRes.stage);

        if (statusRes.status === 'completed') {
          clearInterval(interval);
          const resultsRes = await getProfilingResults(datasetId);
          setProfileData(resultsRes.profile_payload);
        } else if (statusRes.status === 'failed' || statusRes.status === 'cancelled') {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Error polling profiling status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status, datasetId]);

  const handleStartProfiling = async (forceRecompute = false) => {
    if (!datasetId) return;
    try {
      setIsRefreshing(true);
      setErrorMsg(null);
      const res = await startProfiling(datasetId, { force_recompute: forceRecompute });

      if (res.is_cached && res.status === 'completed') {
        setStatus('completed');
        const resultsRes = await getProfilingResults(datasetId);
        setProfileData(resultsRes.profile_payload);
      } else {
        setStatus('profiling');
        setStage('initializing');
      }
    } catch (err) {
      console.error('Failed to trigger profiling:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to start profiling pipeline.');
      setStatus('failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCancelProfiling = async () => {
    if (!datasetId) return;
    try {
      await cancelProfiling(datasetId);
      setStatus('cancelled');
    } catch (err) {
      console.error('Failed to cancel profiling:', err);
    }
  };

  // Extract structured metrics safely
  const basicStats = profileData?.basic_statistics;
  const quality = profileData?.quality;
  const duplicates = profileData?.duplicates;
  const labels = profileData?.labels;
  const diversity = profileData?.diversity;
  const metadata = profileData?.metadata_insights;
  const datasetMeta = profileData?.dataset;

  const currentStageIdx = PIPELINE_STAGES.findIndex((s) => s.key === stage);

  // Derived natural language insights
  const insightsList = useMemo(() => generateDatasetInsights(profileData), [profileData]);

  // Render: Purpose Fitting View
  if (showPurposeFit && activeDataset) {
    return (
      <DatasetPurposeFit
        dataset={activeDataset}
        profileData={profileData}
        onBack={() => setShowPurposeFit(false)}
      />
    );
  }

  // Render: No dataset selected at all
  if (!activeDataset) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm my-8">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <Database size={28} />
        </div>
        <h3 className="font-extrabold text-[20px] text-slate-800">Select a Dataset to Profile</h3>
        <p className="text-[13.5px] text-slate-500 max-w-md mx-auto">
          Choose an acquired dataset from your workspace to view complete image quality audits, format distributions, and visual variety.
        </p>
        {workspaceDatasets.length > 0 && (
          <div className="pt-2 flex flex-wrap justify-center gap-2">
            {workspaceDatasets.map((ds) => (
              <button
                key={ds.dataset_id}
                onClick={() => {
                  setActiveDataset(ds);
                  if (onSelectDataset) onSelectDataset(ds);
                }}
                className="px-4 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 text-slate-700 hover:text-blue-600 rounded-xl text-[13px] font-semibold transition-all cursor-pointer"
              >
                {ds.dataset_name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Prepare chart data structures
  const aspectData = Object.entries(basicStats?.aspect_ratios?.categories || {}).map(([cat, val]) => ({
    label: cat,
    value: val,
    color: cat === 'square' ? '#3b82f6' : cat === 'landscape' ? '#6366f1' : '#a855f7',
  }));

  const formatData = Object.entries(basicStats?.formats || {}).map(([fmt, val], idx) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    return {
      label: fmt,
      value: val,
      color: colors[idx % colors.length],
    };
  });

  const qualityDistributionData = [
    { label: 'Good Quality', value: quality?.counts?.normal ?? (basicStats?.total_images || 0), color: '#10b981' },
    { label: 'Needs Attention', value: quality?.counts?.flagged_total ?? 0, color: '#f43f5e' },
  ];

  const duplicateSplitData = duplicates?.status === 'completed' ? [
    { label: 'Unique Images', value: Math.max(0, (basicStats?.total_images || 0) - (duplicates.affected_images_count || 0)), color: '#3b82f6' },
    { label: 'Duplicate Images', value: duplicates.affected_images_count || 0, color: '#f59e0b' },
  ] : [];

  const mostCommonFormat = formatData.length > 0 ? formatData.reduce((prev, curr) => (curr.value > prev.value ? curr : prev)).label : 'N/A';
  const totalFlagged = quality?.counts?.flagged_total ?? 0;
  const goodQualityCount = quality?.counts?.normal ?? (basicStats?.total_images || 0);
  const totalImgs = basicStats?.total_images || 0;
  const qualityScorePct = totalImgs > 0 ? Math.round((goodQualityCount / totalImgs) * 100) : 100;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* -------------------------------------------------------------
       * Top Header Card
       * ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Return to Workspace"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/15 shrink-0">
            <BarChart3 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-extrabold text-[20px] text-slate-800 tracking-tight">
                {activeDataset.dataset_name}
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200/60">
                {activeDataset.dataset_source_type || 'Custom'}
              </span>
              {status === 'completed' && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Profile Ready</span>
                </span>
              )}
              {status === 'profiling' && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center gap-1 animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Profiling in Progress</span>
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-slate-500 font-medium mt-1">
              A comprehensive visual summary of contents, image health, and variety.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          {workspaceDatasets.length > 1 && (
            <select
              value={activeDataset.dataset_id}
              onChange={(e) => {
                const found = workspaceDatasets.find((d) => d.dataset_id === e.target.value);
                if (found) {
                  setActiveDataset(found);
                  if (onSelectDataset) onSelectDataset(found);
                }
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-semibold text-slate-700 outline-none focus:border-blue-400"
            >
              {workspaceDatasets.map((d) => (
                <option key={d.dataset_id} value={d.dataset_id}>
                  {d.dataset_name}
                </option>
              ))}
            </select>
          )}

          {/* Purpose Fitting CTA */}
          <button
            onClick={() => setShowPurposeFit(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-blue-500/15 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Target size={15} />
            <span>Purpose Fitting</span>
          </button>

          {status === 'completed' ? (
            <button
              onClick={() => handleStartProfiling(true)}
              disabled={isRefreshing}
              className="px-4 py-2 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Re-run Profile</span>
            </button>
          ) : status === 'profiling' ? (
            <button
              onClick={handleCancelProfiling}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[13px] font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => handleStartProfiling(false)}
              disabled={isRefreshing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-blue-600/15 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isRefreshing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>Generate Profile</span>
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
       * In-Progress Pipeline UI
       * ------------------------------------------------------------- */}
      {status === 'profiling' && (
        <div className="bg-white border border-blue-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-blue-600" />
              <h3 className="font-extrabold text-[15px] text-slate-800">
                Profiling Dataset in Progress...
              </h3>
            </div>
            <span className="text-[12px] font-bold text-blue-600 uppercase tracking-wider">
              {stage ? stage.replace(/_/g, ' ') : 'Processing'}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 rounded-full"
              style={{
                width: `${Math.max(12, Math.min(95, ((currentStageIdx + 1) / PIPELINE_STAGES.length) * 100))}%`,
              }}
            />
          </div>

          {/* Stages List */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
            {PIPELINE_STAGES.map((s, idx) => {
              const isDone = idx < currentStageIdx;
              const isCurrent = idx === currentStageIdx;
              return (
                <div
                  key={s.key}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    isDone
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-700'
                      : isCurrent
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs animate-pulse'
                      : 'bg-slate-50/50 border-slate-200/60 text-slate-400'
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider">Step {idx + 1}</p>
                  <p className="text-[11.5px] font-extrabold mt-0.5 leading-tight truncate">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Error or Cancelled Banner
       * ------------------------------------------------------------- */}
      {status === 'failed' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-rose-500 shrink-0" size={24} />
            <div>
              <h4 className="font-extrabold text-[14px] text-rose-800">Profiling Failed</h4>
              <p className="text-[13px] text-rose-600 mt-0.5">
                {errorMsg || 'An error occurred while generating the dataset profile.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleStartProfiling(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[13px] font-bold shadow-sm transition-colors shrink-0 cursor-pointer"
          >
            Retry Profiling
          </button>
        </div>
      )}

      {status === 'cancelled' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <XCircle className="text-amber-600 shrink-0" size={24} />
            <div>
              <h4 className="font-extrabold text-[14px] text-amber-800">Profiling Cancelled</h4>
              <p className="text-[13px] text-amber-700 mt-0.5">
                The profiling job was cancelled. You can restart it at any time.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleStartProfiling(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[13px] font-bold shadow-sm transition-colors shrink-0 cursor-pointer"
          >
            Restart
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Not Yet Profiled Banner
       * ------------------------------------------------------------- */}
      {status === 'not_profiled' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4 shadow-sm my-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Sparkles size={28} />
          </div>
          <h3 className="font-extrabold text-[20px] text-slate-800">
            No Profile Generated Yet
          </h3>
          <p className="text-[13.5px] text-slate-500 max-w-md mx-auto leading-relaxed">
            Generate an analytics profile to evaluate image quality, check duplicate groups, discover visual variety, and inspect aspect ratios.
          </p>
          <button
            onClick={() => handleStartProfiling(false)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-blue-600/15 transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles size={16} />
            <span>Generate Dataset Profile</span>
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Main Completed Analytics Dashboard (Power BI Style Flow)
       * ------------------------------------------------------------- */}
      {status === 'completed' && profileData && (
        <div className="space-y-7">
          {/* SECTION 1: DATASET OVERVIEW - KPI RIBBON */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[18px] font-extrabold text-slate-900 tracking-tight">
                  Dataset Overview
                </h3>
                <p className="text-[13px] text-slate-500">
                  A quick look at the contents and quality of your dataset.
                </p>
              </div>

              {/* Quick Filter / Jump Pills */}
              <div className="hidden lg:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-[12px] font-bold">
                {[
                  { id: 'all', label: 'All Sections' },
                  { id: 'overview', label: 'Images' },
                  { id: 'quality', label: 'Quality' },
                  { id: 'variety', label: 'Visual Variety' },
                  { id: 'duplicates', label: 'Duplicates' },
                  { id: 'insights', label: 'Insights' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      activeSection === s.id
                        ? 'bg-white text-blue-600 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <KpiCard
                title="Total Images"
                value={basicStats?.total_images?.toLocaleString() || '0'}
                subtext={basicStats?.corrupt_images > 0 ? `${basicStats.corrupt_images} corrupt` : '100% readable'}
                icon={Camera}
                tone="blue"
              />
              <KpiCard
                title="Image Formats"
                value={`${formatData.length} ${formatData.length === 1 ? 'Format' : 'Formats'}`}
                subtext={`Primary: ${mostCommonFormat}`}
                icon={Layers}
                tone="blue"
              />
              <KpiCard
                title="Image Size"
                value={
                  basicStats?.file_sizes_bytes?.total_bytes
                    ? `${(basicStats.file_sizes_bytes.total_bytes / (1024 * 1024)).toFixed(1)} MB`
                    : '0 MB'
                }
                subtext={`Avg: ${
                  basicStats?.file_sizes_bytes?.stats?.mean
                    ? `${Math.round(basicStats.file_sizes_bytes.stats.mean / 1024)} KB`
                    : '0 KB'
                }`}
                icon={Maximize2}
                tone="blue"
              />
              <KpiCard
                title="Images Needing Attention"
                value={totalFlagged}
                subtext={totalFlagged === 0 ? 'All images passed' : `${totalFlagged} quality issue${totalFlagged > 1 ? 's' : ''}`}
                icon={ShieldCheck}
                tone={totalFlagged === 0 ? 'green' : 'amber'}
              />
              <KpiCard
                title="Duplicate Images"
                value={
                  duplicates?.status === 'completed'
                    ? `${duplicates.affected_images_count || 0}`
                    : 'Not checked'
                }
                subtext={
                  duplicates?.status === 'completed'
                    ? `${((duplicates.duplicate_ratio || 0) * 100).toFixed(1)}% of dataset`
                    : 'Run deduplication'
                }
                icon={Copy}
                tone={duplicates?.affected_images_count > 0 ? 'amber' : 'green'}
              />
              <KpiCard
                title="Visual Groups"
                value={diversity?.cluster_count ?? 0}
                subtext={`${diversity?.noise_count ?? 0} individual images`}
                icon={Activity}
                tone="purple"
              />
            </div>
          </div>

          {/* SECTION 2: IMAGE OVERVIEW */}
          {(activeSection === 'all' || activeSection === 'overview') && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    <span>Image Overview</span>
                  </h4>
                  <p className="text-[12.5px] text-slate-500">
                    Dimensions, framing aspect ratios, and format encodings across your dataset.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 2A: Aspect Ratio Distribution */}
                <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-slate-800">
                      Aspect Ratio Distribution
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Framing</span>
                  </div>
                  <DonutChart
                    data={aspectData}
                    size={140}
                    strokeWidth={20}
                    centerLabel={basicStats?.total_images || '0'}
                    centerSublabel="Images"
                  />
                </div>

                {/* 2B: File Format Distribution */}
                <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-slate-800">
                      Image Formats
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Encoding</span>
                  </div>
                  <div className="space-y-2.5 pt-1">
                    {formatData.map((item) => (
                      <HorizontalDistributionBar
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        total={basicStats?.total_images || 1}
                        color="bg-indigo-500"
                      />
                    ))}
                  </div>

                  {/* Color Modes */}
                  <div className="pt-3 border-t border-slate-200/60">
                    <span className="text-[12px] font-bold text-slate-600 block mb-2">Color Modes</span>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(basicStats?.color_modes || {}).map(([mode, count]) => (
                        <div
                          key={mode}
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[12px] font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs"
                        >
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          <span>{mode}</span>
                          <span className="text-slate-400 font-normal">({count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2C: Image Size & Dimensions Summary */}
                <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-slate-800">
                      Image Dimensions
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Resolution</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="p-3 bg-white border border-slate-200/80 rounded-xl text-center shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Average Width</p>
                      <p className="text-[18px] font-extrabold text-slate-800 mt-0.5">
                        {Math.round(basicStats?.dimensions?.width?.mean || 0)} px
                      </p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">
                        Range: {basicStats?.dimensions?.width?.min} – {basicStats?.dimensions?.width?.max}
                      </p>
                    </div>

                    <div className="p-3 bg-white border border-slate-200/80 rounded-xl text-center shadow-2xs">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Average Height</p>
                      <p className="text-[18px] font-extrabold text-slate-800 mt-0.5">
                        {Math.round(basicStats?.dimensions?.height?.mean || 0)} px
                      </p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">
                        Range: {basicStats?.dimensions?.height?.min} – {basicStats?.dimensions?.height?.max}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between shadow-2xs text-[12px]">
                    <div>
                      <span className="font-bold text-slate-700 block">Average Resolution</span>
                      <span className="text-slate-400 text-[11px]">Megapixels per sample</span>
                    </div>
                    <span className="text-[15px] font-extrabold text-blue-600">
                      {basicStats?.dimensions?.megapixels?.mean ? `${basicStats.dimensions.megapixels.mean} MP` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: IMAGE QUALITY */}
          {(activeSection === 'all' || activeSection === 'quality') && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-emerald-600" />
                    <span>Image Quality</span>
                  </h4>
                  <p className="text-[12.5px] text-slate-500">
                    Evaluates clarity, sharpness, under-exposure, and over-exposure.
                  </p>
                </div>

                {/* Prominent Summary Banner */}
                <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 text-[12.5px] font-bold ${
                  qualityScorePct >= 90
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <CheckCircle2 size={15} />
                  <span>
                    {goodQualityCount} of {totalImgs} images have good quality ({qualityScorePct}%)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 3A: Quality Distribution Donut */}
                <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-slate-800">
                      Quality Distribution
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Health Breakdown</span>
                  </div>
                  <DonutChart
                    data={qualityDistributionData}
                    size={140}
                    strokeWidth={20}
                    centerLabel={`${qualityScorePct}%`}
                    centerSublabel="Healthy"
                  />
                </div>

                {/* 3B: Specific Quality Issues */}
                <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-slate-800">
                      Detected Issues
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Attention Areas</span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <HorizontalDistributionBar
                      label="Blurry"
                      value={quality?.counts?.blurred ?? 0}
                      total={totalImgs}
                      color="bg-rose-500"
                      sublabel="Images lacking high-frequency edge sharpness"
                    />
                    <HorizontalDistributionBar
                      label="Too Dark (Under-exposed)"
                      value={quality?.counts?.under_exposed ?? 0}
                      total={totalImgs}
                      color="bg-amber-500"
                      sublabel="Images with extensive shadowed or crushed blacks"
                    />
                    <HorizontalDistributionBar
                      label="Too Bright (Over-exposed)"
                      value={quality?.counts?.over_exposed ?? 0}
                      total={totalImgs}
                      color="bg-orange-500"
                      sublabel="Images with clipped highlights or blown-out whites"
                    />
                  </div>
                </div>
              </div>

              {/* 3C: Inspect Flagged Quality Samples */}
              {quality?.flagged_samples && quality.flagged_samples.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <button
                    onClick={() => setShowFlaggedImages(!showFlaggedImages)}
                    className="text-[13px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{showFlaggedImages ? 'Hide' : 'Inspect'} Flagged Quality Samples ({quality.flagged_samples.length})</span>
                    {showFlaggedImages ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {showFlaggedImages && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-[12px]">
                      {quality.flagged_samples.map((item, idx) => (
                        <div key={idx} className="p-3 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <span className="font-mono text-slate-700 truncate max-w-md">{item.image_path}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.issues.map((iss, i) => (
                              <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md font-bold text-[10px]">
                                {iss}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION 4: VISUAL VARIETY */}
          {(activeSection === 'all' || activeSection === 'variety') && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                    <Activity size={18} className="text-purple-600" />
                    <span>Visual Variety</span>
                  </h4>
                  <p className="text-[12.5px] text-slate-500">
                    How visually varied is this dataset? Discovers natural visual groupings and standalone images.
                  </p>
                </div>

                <div className="p-2 bg-purple-50 border border-purple-100 rounded-xl text-[11.5px] font-bold text-purple-700 flex items-center gap-1.5">
                  <Info size={14} />
                  <span>
                    Separation:{' '}
                    {diversity?.silhouette_score !== null && diversity?.silhouette_score !== undefined
                      ? diversity.silhouette_score >= 0.4
                        ? 'Good Separation'
                        : diversity.silhouette_score >= 0.2
                        ? 'Moderate Separation'
                        : 'Low Separation'
                      : 'Standard'}
                  </span>
                </div>
              </div>

              {/* Visual Variety Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                  <p className="text-[10.5px] font-bold text-slate-400 uppercase">Visual Groups</p>
                  <p className="text-[24px] font-extrabold text-purple-600 mt-1">
                    {diversity?.cluster_count ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Clusters of similar images</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                  <p className="text-[10.5px] font-bold text-slate-400 uppercase">Individual Images</p>
                  <p className="text-[24px] font-extrabold text-slate-800 mt-1">
                    {diversity?.noise_count ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {diversity?.noise_ratio ? `${(diversity.noise_ratio * 100).toFixed(1)}% isolated images` : '0%'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                  <p className="text-[10.5px] font-bold text-slate-400 uppercase">Separation Score</p>
                  <p className="text-[24px] font-extrabold text-slate-800 mt-1">
                    {diversity?.silhouette_score !== null && diversity?.silhouette_score !== undefined
                      ? diversity.silhouette_score
                      : 'N/A'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {diversity?.silhouette_score ? 'Cluster separation metric' : 'Insufficient clusters'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                  <p className="text-[10.5px] font-bold text-slate-400 uppercase">Images Analyzed</p>
                  <p className="text-[24px] font-extrabold text-slate-800 mt-1">
                    {diversity?.total_samples ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Processed for visual grouping</p>
                </div>
              </div>

              {/* Visual Group Size Chart */}
              {diversity?.cluster_size_distribution && diversity.cluster_size_distribution.length > 0 && (
                <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-slate-800">
                      Visual Group Sizes
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Images per Group</span>
                  </div>

                  <div className="space-y-2 pt-1">
                    {diversity.cluster_size_distribution.slice(0, 10).map((size, idx) => {
                      const maxGroupSize = Math.max(...diversity.cluster_size_distribution);
                      const pct = Math.round((size / maxGroupSize) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between items-center text-[12px]">
                            <span className="font-bold text-slate-700">Group {idx + 1}</span>
                            <span className="font-extrabold text-purple-700">{size} images</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Explainer Note */}
              <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl text-[12px] text-blue-800 flex items-start gap-2">
                <Info size={16} className="shrink-0 mt-0.5 text-blue-600" />
                <span>
                  Images are grouped according to visual similarity. Images that do not closely resemble other images appear as individual images.
                </span>
              </div>
            </div>
          )}

          {/* SECTION 5: DATASET CATEGORIES */}
          {(activeSection === 'all' || activeSection === 'categories') && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                    <Tag size={18} className="text-emerald-600" />
                    <span>Dataset Categories</span>
                  </h4>
                  <p className="text-[12.5px] text-slate-500">
                    Does the dataset contain a balanced representation of its categories?
                  </p>
                </div>
                {labels?.status === 'available' && (
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      labels.metrics?.balance_indicator === 'well_balanced'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {labels.metrics?.balance_indicator?.replace(/_/g, ' ') || 'Assessed'}
                  </span>
                )}
              </div>

              {labels?.status === 'available' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Number of Classes</p>
                      <p className="text-[20px] font-extrabold text-slate-800 mt-1">{labels.num_classes}</p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Max/Min Class Ratio</p>
                      <p className="text-[20px] font-extrabold text-slate-800 mt-1">
                        {labels.metrics?.max_to_min_ratio ?? 1.0}x
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Labeled Images</p>
                      <p className="text-[20px] font-extrabold text-slate-800 mt-1">{labels.total_labeled_images}</p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <p className="text-[12.5px] font-bold text-slate-700">Category Proportions</p>
                    <div className="space-y-2.5">
                      {Object.entries(labels.class_percentages || {}).map(([cls, pct]) => {
                        const count = labels.class_counts[cls];
                        return (
                          <HorizontalDistributionBar
                            key={cls}
                            label={cls}
                            value={count}
                            total={labels.total_labeled_images || 1}
                            color="bg-emerald-500"
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-2">
                  <Tag size={24} className="text-slate-400 mx-auto" />
                  <p className="font-extrabold text-[14px] text-slate-700">
                    Category information is not available for this dataset.
                  </p>
                  <p className="text-[12.5px] text-slate-500 max-w-md mx-auto">
                    Categories are automatically extracted when image files are organized in labeled subfolders (e.g., <code className="font-mono text-slate-600">cats/img1.jpg</code>).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SECTION 6: DUPLICATE FINDINGS */}
          {(activeSection === 'all' || activeSection === 'duplicates') && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                    <Copy size={18} className="text-blue-600" />
                    <span>Duplicate Findings</span>
                  </h4>
                  <p className="text-[12.5px] text-slate-500">
                    Are there repeated or highly similar images in this dataset?
                  </p>
                </div>

                {onNavigateToDuplicates && duplicates?.status === 'completed' && (
                  <button
                    onClick={onNavigateToDuplicates}
                    className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-[12.5px] font-bold transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                  >
                    <Eye size={14} />
                    <span>Open Detailed Duplicates Dashboard</span>
                  </button>
                )}
              </div>

              {duplicates?.status === 'completed' ? (
                <div className="space-y-6">
                  {/* Duplicate KPI Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase">Duplicate Groups</p>
                      <p className="text-[24px] font-extrabold text-slate-800 mt-1">
                        {duplicates.duplicate_groups_count}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Discovered clusters</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase">Images Affected</p>
                      <p className="text-[24px] font-extrabold text-slate-800 mt-1">
                        {duplicates.affected_images_count}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Redundant samples</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase">Dataset Share</p>
                      <p className="text-[24px] font-extrabold text-amber-600 mt-1">
                        {((duplicates.duplicate_ratio || 0) * 100).toFixed(1)}%
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Of total volume</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-xl">
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase">Match Types</p>
                      <p className="text-[18px] font-extrabold text-slate-800 mt-1">
                        {duplicates.exact_duplicate_groups} exact / {duplicates.near_duplicate_groups} similar
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Exact matches vs Near copies</p>
                    </div>
                  </div>

                  {/* Visual Split: Unique vs Duplicates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-extrabold text-slate-800">
                          Unique vs Duplicate Volume
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">Share</span>
                      </div>
                      <DonutChart
                        data={duplicateSplitData}
                        size={140}
                        strokeWidth={20}
                        centerLabel={`${((duplicates.duplicate_ratio || 0) * 100).toFixed(0)}%`}
                        centerSublabel="Duplicates"
                      />
                    </div>

                    <div className="p-4.5 bg-slate-50/50 border border-slate-200/70 rounded-xl space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-extrabold text-slate-800">
                          Duplicate Classification
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">Method</span>
                      </div>
                      <div className="space-y-3 pt-1">
                        <HorizontalDistributionBar
                          label="Exact Matches"
                          value={duplicates.exact_duplicate_groups || 0}
                          total={duplicates.duplicate_groups_count || 1}
                          color="bg-rose-500"
                          sublabel="Pixel-for-pixel byte identical files"
                        />
                        <HorizontalDistributionBar
                          label="Similar Copies"
                          value={duplicates.near_duplicate_groups || 0}
                          total={duplicates.duplicate_groups_count || 1}
                          color="bg-amber-500"
                          sublabel="Visually identical or slightly compressed copies"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                  <PieChart size={24} className="text-slate-400 mx-auto" />
                  <p className="font-extrabold text-[14px] text-slate-700">
                    Duplicate detection has not yet been executed for this dataset.
                  </p>
                  <p className="text-[12.5px] text-slate-500 max-w-md mx-auto">
                    Execute the duplicate detection pipeline from your workspace to isolate exact SHA-256 and near-duplicate images.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SECTION 7: DATASET INSIGHTS */}
          {(activeSection === 'all' || activeSection === 'insights') && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-600" />
                    <span>Dataset Insights</span>
                  </h4>
                  <p className="text-[12.5px] text-slate-500">
                    Automated natural-language evaluation derived from your profiling results.
                  </p>
                </div>
                {metadata?.status === 'completed' && (
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[11px] font-bold flex items-center gap-1">
                    <Zap size={12} />
                    <span>Documentation Enriched</span>
                  </span>
                )}
              </div>

              {/* Natural Language Insights Cards */}
              <div className="space-y-2.5">
                {insightsList.map((ins, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                      ins.type === 'success'
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                        : ins.type === 'warning'
                        ? 'bg-amber-50/50 border-amber-200 text-amber-900'
                        : 'bg-blue-50/50 border-blue-200 text-blue-900'
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {ins.type === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : ins.type === 'warning' ? (
                        <AlertTriangle size={16} className="text-amber-600" />
                      ) : (
                        <Info size={16} className="text-blue-600" />
                      )}
                    </div>
                    <p className="text-[13px] font-medium leading-relaxed">{ins.text}</p>
                  </div>
                ))}
              </div>

              {/* Documentation Metadata (Stated Purpose / Collection Method / Limitations) */}
              {metadata?.status === 'completed' && (
                <div className="pt-4 border-t border-slate-100">
                  <h5 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                    <Sliders size={14} className="text-purple-600" />
                    <span>Documentation Findings</span>
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Stated Purpose</p>
                      <p className="text-[12.5px] text-slate-700 font-medium leading-relaxed">
                        {metadata.stated_purpose || 'No purpose stated.'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Collection Method</p>
                      <p className="text-[12.5px] text-slate-700 font-medium leading-relaxed">
                        {metadata.collection_method || 'No method documented.'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Known Limitations</p>
                      <p className="text-[12.5px] text-slate-700 font-medium leading-relaxed">
                        {metadata.known_limitations || 'None reported.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------
           * Collapsible Technical Details (For ML Researchers)
           * ------------------------------------------------------------- */}
          <div className="border border-slate-200/70 rounded-2xl bg-slate-50/50 overflow-hidden">
            <button
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-slate-500" />
                <span className="font-extrabold text-[13.5px] text-slate-700">
                  Technical Details & Calculation Methodology
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-600">
                  Advanced
                </span>
              </div>
              <div className="text-slate-400">
                {showTechnicalDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </button>

            {showTechnicalDetails && (
              <div className="px-6 pb-6 pt-2 border-t border-slate-200/60 space-y-4 text-[12px] bg-white">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                    <p className="font-bold text-slate-800">Quality Measurement</p>
                    <p className="text-slate-500 leading-relaxed">
                      Blur is detected via discrete 3×3 Laplacian kernel variance (threshold: &lt; {quality?.thresholds?.blur_laplacian_threshold || 100}). Mean sharpness: {quality?.laplacian_variance?.mean || 0}.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                    <p className="font-bold text-slate-800">Visual Clustering</p>
                    <p className="text-slate-500 leading-relaxed">
                      768-dimensional L2-normalized DINOv2 representations evaluated with DBSCAN (eps: {diversity?.parameters?.eps || 0.35}, min_samples: {diversity?.parameters?.min_samples || 2}, cosine distance).
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                    <p className="font-bold text-slate-800">Storage & Checksum</p>
                    <p className="text-slate-500 leading-relaxed">
                      Deterministic SHA-256 over MinIO object keys and sizes. Vector embeddings cached in ChromaDB collection <code className="font-mono text-purple-600 font-bold">profiling_embeddings</code>.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11.5px] text-slate-400 pt-2 border-t border-slate-100">
                  <span>Storage: {activeDataset.dataset_storage_path || 'N/A'}</span>
                  <span>Checksum: {datasetMeta?.file_list_checksum || 'N/A'}</span>
                  <span>Engine: Python 3.12 + SQLModel + ChromaDB</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
