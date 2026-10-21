import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  FileDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Database,
  Layers,
  Sparkles,
  BarChart3,
  Copy,
  Check,
  ShieldCheck,
  Target,
  Compass,
  FileText,
  Clock,
  Info,
  Calendar,
  FolderArchive,
  Hash,
  Cpu,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Sliders,
  AlertCircle,
  Maximize2,
  Zap,
  Award,
  BookOpen,
  Code,
  Share2,
  CheckCircle,
  Eye,
  Activity,
  PieChart
} from 'lucide-react';
import { getDatasetCard, downloadDatasetCardPdf } from '../api/datasetCardApi';

/* -------------------------------------------------------------
 * SVG Visual Components & Radial Score Visualizers
 * ------------------------------------------------------------- */

/**
 * Circular Radial Research Readiness Score Gauge
 */
function RadialScoreGauge({ score = 75, tier = 'Research Ready', completeness = 100 }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const scoreColor =
    score >= 80 ? '#10b981' : // emerald
    score >= 60 ? '#6366f1' : // indigo
    score >= 40 ? '#f59e0b' : // amber
    '#f43f5e'; // rose

  const tierBg =
    score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    score >= 60 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
    score >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-rose-50 text-rose-700 border-rose-200';

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
        <svg className="w-24 h-24 transform -rotate-90">
          {/* Background Track */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="#e2e8f0"
            strokeWidth="8"
            fill="transparent"
          />
          {/* Progress Ring with Smooth Transition */}
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke={scoreColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[22px] font-black tracking-tight text-slate-800 leading-none">
            {score}
          </span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            / 100
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Research Readiness
        </div>
        <div className="text-[17px] font-black text-slate-800 tracking-tight leading-tight">
          {tier}
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border uppercase tracking-wider ${tierBg}`}>
            {completeness}% Profiled
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Clean Horizontal Bar Chart for Class Distribution
 */
function ClassDistributionBarChart({ classCounts = {}, totalImages = 0 }) {
  const entries = useMemo(() => {
    return Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
  }, [classCounts]);

  const maxCount = entries.length > 0 ? entries[0][1] : 1;
  const [showAll, setShowAll] = useState(false);
  const displayEntries = showAll ? entries : entries.slice(0, 10);

  if (entries.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 text-center space-y-1.5">
        <p className="text-[13px] font-bold text-slate-700">No folder-based class taxonomy detected</p>
        <p className="text-[12px] text-slate-400 max-w-sm mx-auto">
          Dataset uses a flat directory structure without explicit classification labels. Class distribution could not be assessed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px] text-slate-500 font-medium">
        <span>Showing {displayEntries.length} of {entries.length} classes</span>
        <span>Denominator: {totalImages.toLocaleString()} total images</span>
      </div>

      <div className="space-y-2.5">
        {displayEntries.map(([cls, count]) => {
          const pct = totalImages > 0 ? ((count / totalImages) * 100).toFixed(1) : 0;
          const barWidth = Math.max(4, (count / maxCount) * 100);

          return (
            <div key={cls} className="group">
              <div className="flex items-center justify-between text-[12.5px] mb-1">
                <span className="font-bold text-slate-800 truncate max-w-[200px]" title={cls}>
                  {cls}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-mono text-[12px] font-semibold">{count.toLocaleString()} imgs</span>
                  <span className="text-slate-400 font-mono text-[11px] w-12 text-right">({pct}%)</span>
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-600 to-violet-600 rounded-full transition-all duration-500 shadow-xs"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {entries.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[12px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors pt-1 cursor-pointer flex items-center gap-1"
        >
          {showAll ? 'Show top 10 only' : `Show all ${entries.length} classes`}
          <ChevronRight size={14} className={showAll ? 'rotate-90' : ''} />
        </button>
      )}
    </div>
  );
}

/**
 * Format & Color Mode Proportions Chart
 */
function FormatProportionsBar({ formats = {}, totalImages = 0 }) {
  const entries = Object.entries(formats || {});
  if (entries.length === 0) return null;

  const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  return (
    <div className="space-y-2.5">
      <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 shadow-inner">
        {entries.map(([fmt, count], idx) => {
          const pct = totalImages > 0 ? (count / totalImages) * 100 : 0;
          return (
            <div
              key={fmt}
              style={{ width: `${pct}%`, backgroundColor: colors[idx % colors.length] }}
              className="h-full transition-all hover:opacity-90 cursor-default"
              title={`${fmt.toUpperCase()}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
        {entries.map(([fmt, count], idx) => {
          const pct = totalImages > 0 ? ((count / totalImages) * 100).toFixed(1) : 0;
          return (
            <div key={fmt} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shadow-xs"
                style={{ backgroundColor: colors[idx % colors.length] }}
              />
              <span className="font-bold text-slate-700">{fmt.toUpperCase()}</span>
              <span className="text-slate-400 font-mono text-[11px]">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Duplicate Detection Visual Breakdown
 */
function DuplicateBreakdownChart({ examined = 0, exact = 0, near = 0, clean = 0 }) {
  const total = examined || 1;
  const exactPct = ((exact / total) * 100).toFixed(1);
  const nearPct = ((near / total) * 100).toFixed(1);
  const cleanPct = Math.max(0, 100 - parseFloat(exactPct) - parseFloat(nearPct)).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="h-6 w-full rounded-xl overflow-hidden flex bg-slate-100 shadow-inner p-0.5">
        <div
          style={{ width: `${cleanPct}%` }}
          className="h-full bg-emerald-500 rounded-l-lg transition-all hover:opacity-90"
          title={`Clean Unique Images: ${clean.toLocaleString()} (${cleanPct}%)`}
        />
        <div
          style={{ width: `${nearPct}%` }}
          className="h-full bg-amber-500 transition-all hover:opacity-90"
          title={`Near-Duplicate Clusters: ${near.toLocaleString()} (${nearPct}%)`}
        />
        <div
          style={{ width: `${exactPct}%` }}
          className="h-full bg-rose-500 rounded-r-lg transition-all hover:opacity-90"
          title={`Exact Copies: ${exact.toLocaleString()} (${exactPct}%)`}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Unique Images</span>
          </div>
          <div className="text-[20px] font-black text-slate-800 mt-1">{clean.toLocaleString()}</div>
          <div className="text-[11.5px] font-semibold text-emerald-600">{cleanPct}% of total</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Near-Duplicates</span>
          </div>
          <div className="text-[20px] font-black text-slate-800 mt-1">{near.toLocaleString()}</div>
          <div className="text-[11.5px] font-semibold text-amber-600">{nearPct}% of total</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-100 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-800 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Exact Copies</span>
          </div>
          <div className="text-[20px] font-black text-slate-800 mt-1">{exact.toLocaleString()}</div>
          <div className="text-[11.5px] font-semibold text-rose-600">{exactPct}% of total</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Domain Gap Target Coverage Vector Bar
 */
function DomainCoverageBar({ covered = 0, total = 0, pct = 0, cutoff = 0 }) {
  const safePct = Math.min(100, Math.max(0, pct || 0));
  const color =
    safePct >= 75 ? 'from-emerald-500 to-teal-600' :
    safePct >= 50 ? 'from-amber-500 to-amber-600' :
    'from-rose-500 to-rose-600';

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-[32px] font-black text-slate-800 leading-none">{safePct.toFixed(1)}%</span>
          <span className="text-[13px] font-bold text-slate-500 ml-2">Target Domain Coverage</span>
        </div>
        <div className="text-right text-[12px] text-slate-500">
          <span className="font-bold text-slate-700">{covered.toLocaleString()}</span> of{' '}
          <span className="font-bold text-slate-700">{total.toLocaleString()}</span> target photos covered
        </div>
      </div>

      <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner p-0.5">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700 shadow-xs`}
          style={{ width: `${safePct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11.5px] text-slate-400 font-medium">
        <span>0% (Severe Domain Shift)</span>
        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono">Cutoff: {Number(cutoff || 0).toFixed(3)}</span>
        <span>100% (Full Target Overlap)</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * Main Dataset Card View Component
 * ------------------------------------------------------------- */
export default function DatasetCardView({ dataset, onBack }) {
  const [cardData, setCardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('insights'); // 'insights', 'composition', 'duplicates', 'purpose', 'domain', 'provenance'
  const [viewMode, setViewMode] = useState('cockpit'); // 'cockpit' (tabbed, interactive) or 'full' (continuous technical report)
  const [selectedPurposeKey, setSelectedPurposeKey] = useState('classification');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);
  const [copiedBadge, setCopiedBadge] = useState(false);

  const datasetId = dataset?.dataset_id;

  const fetchCard = useCallback(async () => {
    if (!datasetId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getDatasetCard(datasetId);
      setCardData(data);
      if (data?.purpose_fitting?.purposes_evaluated?.[0]?.purpose_key) {
        setSelectedPurposeKey(data.purpose_fitting.purposes_evaluated[0].purpose_key);
      }
    } catch (err) {
      console.error('Failed to load dataset card:', err);
      setError(err.response?.data?.detail || 'Failed to assemble dataset card.');
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    fetchCard();
  }, [fetchCard]);

  const handleDownloadPdf = async () => {
    if (!cardData || exportingPdf) return;
    try {
      setExportingPdf(true);
      setExportSuccess(false);
      await downloadDatasetCardPdf(cardData.identity.dataset_id, cardData.identity.dataset_name);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  const copyToClipboard = (text, type = 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else if (type === 'bibtex') {
      setCopiedBibtex(true);
      setTimeout(() => setCopiedBibtex(false), 2000);
    } else if (type === 'badge') {
      setCopiedBadge(true);
      setTimeout(() => setCopiedBadge(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center animate-pulse shadow-lg shadow-indigo-500/25">
          <Loader2 size={32} className="animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="font-extrabold text-[19px] text-slate-800">Synthesizing Dataset Research Card</h3>
          <p className="text-[13px] text-slate-500 max-w-sm">
            Consolidating identity, composition, duplicate detection, purpose suitability, and target domain coverage...
          </p>
        </div>
      </div>
    );
  }

  if (error || !cardData) {
    return (
      <div className="p-8 bg-white rounded-3xl border border-rose-200 text-center max-w-xl mx-auto my-12 space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={28} />
        </div>
        <h3 className="font-extrabold text-[19px] text-slate-800">Unable to Load Dataset Card</h3>
        <p className="text-[13.5px] text-slate-600">{error || 'Unknown error occurred while fetching card data.'}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[13px] font-bold transition-all cursor-pointer"
            >
              Back to Profiling
            </button>
          )}
          <button
            onClick={fetchCard}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-indigo-600/15 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const { identity, composition, duplicate_detection, purpose_fitting, domain_check, integrated_findings, provenance } = cardData;

  // Safe normalized variables
  const completenessScore = integrated_findings?.completeness_score ?? 0;
  const duplicates = duplicate_detection || {};
  const totalImgs = composition?.total_images || identity?.dataset_image_count || 0;
  const validImgs = Math.max(0, totalImgs - (composition?.corrupted_images || 0));

  // Dimensions
  const meanW = composition?.dimensions?.mean_width ?? composition?.dimensions?.width?.mean ?? 0;
  const meanH = composition?.dimensions?.mean_height ?? composition?.dimensions?.height?.mean ?? 0;
  const minW = composition?.dimensions?.min_width ?? composition?.dimensions?.width?.min ?? 0;
  const minH = composition?.dimensions?.min_height ?? composition?.dimensions?.height?.min ?? 0;

  // Quality
  const goodQuality = composition?.quality?.counts?.normal ?? validImgs;
  const flaggedQuality = composition?.quality?.counts?.flagged_total ?? Math.max(0, validImgs - goodQuality);

  // Labels & Classes
  const classCounts = composition?.labels?.class_counts || composition?.labels?.distribution || {};
  const classesCount = Object.keys(classCounts).length;

  // Aspect ratios
  const aspectRatios = composition?.aspect_ratios?.categories || composition?.aspect_ratios || {};

  // Duplicates breakdown
  const dupExamined = duplicates.total_examined || totalImgs;
  const dupExact = duplicates.exact_duplicates_count || 0;
  const dupNear = duplicates.near_duplicates_count || duplicates.affected_images_count || 0;
  const dupClean = Math.max(0, dupExamined - dupExact - dupNear);
  const dupAffectedPct = dupExamined > 0 ? ((dupNear + dupExact) / dupExamined * 100).toFixed(1) : 0;

  // Purpose Fitting
  const purposesList = purpose_fitting?.purposes_evaluated || [];
  const selectedPurpose = purposesList.find(p => p.purpose_key === selectedPurposeKey) || purposesList[0];

  // Domain Check
  const dcCovered = domain_check?.counts?.covered ?? Math.round(((domain_check?.coverage_pct || 0) / 100) * (domain_check?.sample_count || 0));
  const dcTotal = domain_check?.sample_count || (domain_check?.counts?.covered || 0) + (domain_check?.counts?.uncovered || 0);
  const dcCutoff = domain_check?.baseline_threshold ?? 0;
  const dcPct = domain_check?.coverage_pct != null ? domain_check.coverage_pct.toFixed(0) : null;

  // Helper: Format bytes
  const formatBytes = (bytes) => {
    if (!bytes || bytes <= 0) return 'N/A';
    const mb = bytes / (1024 * 1024);
    if (mb < 1000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  // Synthesize research readiness score (0-100)
  const qualityScore = validImgs > 0 ? (goodQuality / validImgs) * 30 : 25;
  const redundancyScore = dupExamined > 0 ? Math.max(0, 1 - (dupNear + dupExact) / dupExamined) * 25 : 20;
  const domainScore = domain_check?.coverage_pct != null ? (domain_check.coverage_pct / 100) * 25 : 15;
  const completenessBonus = (completenessScore / 100) * 20;
  const researchReadinessScore = Math.min(100, Math.round(qualityScore + redundancyScore + domainScore + completenessBonus));

  const readinessTier =
    researchReadinessScore >= 80 ? 'Research Ready' :
    researchReadinessScore >= 60 ? 'Usable with Caution' :
    'Significant Limitations';

  // BibTeX Citation text generator
  const cleanId = (identity.dataset_name || 'dataset').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const bibtexCitation = `@misc{dataweaver_${cleanId}_${new Date().getFullYear()},
  title = {${identity.dataset_name}: Research-Grade Dataset Specification},
  author = {DataWeaver AI Profiler},
  year = {${new Date().getFullYear()}},
  howpublished = {\\url{${identity.dataset_source_url || 'https://dataweaver.ai'}}},
  note = {Dataset UUID: ${identity.dataset_id}, Storage Checksum: ${identity.file_list_checksum || 'computed'}}
}`;

  const markdownBadge = `[![DataWeaver: ${identity.dataset_name}](https://img.shields.io/badge/DataWeaver-Card--${completenessScore}%25-indigo)](https://dataweaver.ai)`;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* -------------------------------------------------------------
       * Top Control & View-Switcher Bar
       * ------------------------------------------------------------- */}
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-xs sticky top-3 z-30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1.5 text-[13px] font-bold"
              title="Return to Profiling"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Profiling</span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-black text-[20px] text-slate-800 tracking-tight">
                {identity.dataset_name}
              </h2>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                {identity.dataset_source_type}
              </span>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                ID: {identity.dataset_id?.slice(0, 8)}...
                <button
                  onClick={() => copyToClipboard(identity.dataset_id, 'id')}
                  className="hover:text-slate-700 cursor-pointer"
                  title="Copy UUID"
                >
                  {copiedId ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                </button>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-slate-500 font-medium mt-0.5">
              <span>Workspace: <strong className="text-slate-700">{identity.workspace_name}</strong></span>
              <span>•</span>
              <span>Updated: {new Date(identity.card_generated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* View Switcher & PDF Action */}
        <div className="flex items-center gap-2.5 self-end md:self-auto flex-wrap">
          {/* Mode Switcher */}
          <div className="p-1 rounded-xl bg-slate-100 border border-slate-200 flex items-center text-[12px] font-bold">
            <button
              onClick={() => setViewMode('cockpit')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'cockpit'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap size={14} />
              <span>Interactive Cockpit</span>
            </button>
            <button
              onClick={() => setViewMode('full')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'full'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText size={14} />
              <span>Full Report View</span>
            </button>
          </div>

          {/* Download Vector PDF */}
          <button
            onClick={handleDownloadPdf}
            disabled={exportingPdf}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-violet-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {exportingPdf ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Compiling Vector PDF...</span>
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-200" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <FileDown size={16} />
                <span>Download PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * High-Impact Hero: Research Dataset Passport
       * ------------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-indigo-900/40">
        {/* Subtle background glow circle */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Column 1: Readiness Score Gauge (4 cols) */}
          <div className="lg:col-span-4 bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-300 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <Award size={14} className="text-indigo-400" />
                Dataset Passport
              </span>
              <span>{completenessScore}% Completeness</span>
            </div>

            <div className="py-2">
              <RadialScoreGauge
                score={researchReadinessScore}
                tier={readinessTier}
                completeness={completenessScore}
              />
            </div>

            <p className="text-[12px] text-slate-300 font-medium leading-relaxed pt-2 border-t border-white/10 mt-2">
              {integrated_findings?.suitability_summary ||
                `Synthesized across image health, duplication levels, and target coverage. ${readinessTier}.`}
            </p>
          </div>

          {/* Column 2: 4-Key Insight Micro-Tiles (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            {/* Tile 1: Volume */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Volume</span>
                <Database size={14} className="text-indigo-400" />
              </div>
              <div className="text-[22px] font-black text-white mt-1">
                {totalImgs.toLocaleString()}
              </div>
              <div className="text-[11.5px] text-indigo-200 mt-0.5 truncate">
                {formatBytes(identity.total_size_bytes)} • {classesCount > 0 ? `${classesCount} Classes` : 'Flat taxonomy'}
              </div>
            </div>

            {/* Tile 2: Health */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Health</span>
                <ShieldCheck size={14} className="text-emerald-400" />
              </div>
              <div className="text-[22px] font-black text-white mt-1">
                {validImgs > 0 ? `${Math.round((goodQuality / validImgs) * 100)}%` : '100%'}
              </div>
              <div className="text-[11.5px] text-emerald-300 mt-0.5 truncate">
                {goodQuality} normal • {flaggedQuality} flagged
              </div>
            </div>

            {/* Tile 3: Redundancy */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Duplicates</span>
                <Layers size={14} className="text-amber-400" />
              </div>
              <div className="text-[22px] font-black text-white mt-1">
                {dupExact} exact
              </div>
              <div className={`text-[11.5px] font-semibold mt-0.5 truncate ${dupNear > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                {dupNear > 0 ? `⚠️ ${dupNear} near-dupes (${dupAffectedPct}%)` : 'Clean dataset (0 dupes)'}
              </div>
            </div>

            {/* Tile 4: Domain Check */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Target Coverage</span>
                <Compass size={14} className="text-cyan-400" />
              </div>
              <div className="text-[22px] font-black text-white mt-1">
                {dcPct != null ? `${dcPct}%` : 'Pending'}
              </div>
              <div className="text-[11.5px] text-cyan-200 mt-0.5 truncate">
                {domain_check?.verdict || (dcPct != null ? `${dcCovered}/${dcTotal} target photos` : 'No target set run')}
              </div>
            </div>
          </div>

          {/* Column 3: Quick Verdict & Citations Action (3 cols) */}
          <div className="lg:col-span-3 flex flex-col justify-between gap-3 h-full">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
              <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={13} />
                <span>Primary Recommendation</span>
              </div>
              <div className="text-[13px] font-extrabold text-white leading-tight">
                {purposesList.find(p => p.overall_status === 'Good Fit')?.purpose_display_name || 'Duplicate Detection / Dedup'}
              </div>
              <div className="text-[11px] text-slate-300">
                Highest rule-based fit with minimal penalty.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(bibtexCitation, 'bibtex')}
                className="flex-1 py-2 px-3 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-[11.5px] font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Copy BibTeX Citation for Overleaf or Papers"
              >
                {copiedBibtex ? <Check size={13} className="text-emerald-400" /> : <BookOpen size={13} />}
                <span>{copiedBibtex ? 'BibTeX Copied!' : 'BibTeX'}</span>
              </button>

              <button
                onClick={() => copyToClipboard(markdownBadge, 'badge')}
                className="py-2 px-3 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-[11.5px] font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Copy Markdown Badge for GitHub README"
              >
                {copiedBadge ? <Check size={13} className="text-emerald-400" /> : <Code size={13} />}
                <span>{copiedBadge ? 'Badge Copied!' : 'Badge'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * INTERACTIVE VIEW TABS (Default Cockpit Mode)
       * ------------------------------------------------------------- */}
      {viewMode === 'cockpit' && (
        <div className="space-y-6">
          {/* Glassmorphic Tab Selector Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
            {[
              { id: 'insights', label: '⚡ Executive Verdict', icon: Zap },
              { id: 'composition', label: '🔬 Composition & Health', icon: PieChart },
              { id: 'duplicates', label: '🧬 Redundancy Audit', icon: Layers },
              { id: 'purpose', label: '🎯 Purpose Suitability', icon: Target },
              { id: 'domain', label: '🌐 Target Domain Gap', icon: Compass },
              { id: 'provenance', label: '📜 Provenance & BibTeX', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 rounded-xl text-[13px] font-extrabold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/80 hover:text-indigo-600'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: EXECUTIVE VERDICT */}
          {activeTab === 'insights' && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* 5-Pillar Research Readiness Scorecard */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-[16px] text-slate-800 flex items-center gap-2">
                    <Activity size={18} className="text-indigo-600" />
                    <span>5-Pillar Research Readiness Assessment</span>
                  </h3>
                  <span className="text-[11.5px] font-bold text-slate-400">AUTOMATED AUDIT</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {/* Pillar 1 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">1. File Integrity</div>
                    <div className="text-[18px] font-black text-slate-800 mt-1">
                      {(composition?.corrupted_images || 0) === 0 ? '100%' : 'Corrupted'}
                    </div>
                    <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                      {validImgs} readable files
                    </div>
                  </div>

                  {/* Pillar 2 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">2. Visual Quality</div>
                    <div className="text-[18px] font-black text-slate-800 mt-1">
                      {validImgs > 0 ? `${Math.round((goodQuality / validImgs) * 100)}%` : '100%'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {goodQuality} crisp / normal
                    </div>
                  </div>

                  {/* Pillar 3 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">3. Uniqueness</div>
                    <div className="text-[18px] font-black text-slate-800 mt-1">
                      {dupExamined > 0 ? `${(100 - parseFloat(dupAffectedPct)).toFixed(0)}%` : '100%'}
                    </div>
                    <div className={`text-[11px] font-semibold mt-0.5 ${dupNear > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {dupNear > 0 ? `⚠️ ${dupNear} near-dupes` : '0 duplicates'}
                    </div>
                  </div>

                  {/* Pillar 4 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">4. Target Alignment</div>
                    <div className="text-[18px] font-black text-slate-800 mt-1">
                      {dcPct != null ? `${dcPct}%` : 'Unassessed'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {domain_check?.verdict || 'Run deployment set'}
                    </div>
                  </div>

                  {/* Pillar 5 */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">5. Completeness</div>
                    <div className="text-[18px] font-black text-slate-800 mt-1">
                      {completenessScore}%
                    </div>
                    <div className="text-[11px] text-indigo-600 font-semibold mt-0.5">
                      {integrated_findings?.completeness_level || 'Substantial'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Strengths vs Risks High-Contrast Split Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Strengths */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-white border border-emerald-200/80 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-[14px] font-extrabold text-emerald-900">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 size={18} />
                    </div>
                    <span>Supported Dataset Strengths</span>
                  </div>
                  <ul className="space-y-2 text-[13px] text-slate-700">
                    {integrated_findings?.strengths?.map((s, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                        <span className="leading-relaxed">{s}</span>
                      </li>
                    ))}
                    {(!integrated_findings?.strengths || integrated_findings.strengths.length === 0) && (
                      <li className="text-slate-400 italic">No specific strengths recorded.</li>
                    )}
                  </ul>
                </div>

                {/* Quality Risks */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-50/50 to-white border border-rose-200/80 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-[14px] font-extrabold text-rose-900">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                      <AlertTriangle size={18} />
                    </div>
                    <span>Identified Quality Risks & Limitations</span>
                  </div>
                  <ul className="space-y-2 text-[13px] text-slate-700">
                    {integrated_findings?.risks_and_concerns?.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-2 shrink-0" />
                        <span className="leading-relaxed">{c}</span>
                      </li>
                    ))}
                    {(!integrated_findings?.risks_and_concerns || integrated_findings.risks_and_concerns.length === 0) && (
                      <li className="text-slate-400 italic">No critical quality risks identified.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Quick Actions & Citation Teaser */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-0.5 text-center sm:text-left">
                  <div className="font-extrabold text-[15px]">Need this documented for your research paper?</div>
                  <div className="text-[12px] text-slate-400">
                    Export a publication-grade vector PDF or inspect criterion breakdowns in the Purpose Suitability tab.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('purpose')}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[12.5px] font-bold transition-all cursor-pointer"
                  >
                    Inspect Purpose Criteria
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[12.5px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <FileDown size={14} />
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPOSITION & HEALTH */}
          {activeTab === 'composition' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* Numerical Overview Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Valid Image Count</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">{validImgs.toLocaleString()}</div>
                  <div className="text-[11.5px] text-slate-500">{totalImgs} total files discovered</div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Mean Resolution</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">
                    {Math.round(meanW)} × {Math.round(meanH)}
                  </div>
                  <div className="text-[11.5px] text-slate-500">Min: {minW}×{minH} px</div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Corrupt / Unreadable</div>
                  <div className={`text-[24px] font-black mt-1 ${(composition?.corrupted_images || 0) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {composition?.corrupted_images || 0}
                  </div>
                  <div className="text-[11.5px] text-slate-500">Files skipped during ingestion</div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Encodings / Formats</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">
                    {Object.keys(composition?.formats || {}).length}
                  </div>
                  <div className="text-[11.5px] text-slate-500 truncate">
                    {Object.keys(composition?.formats || {}).join(', ').toUpperCase() || 'JPEG'}
                  </div>
                </div>
              </div>

              {/* Visual Breakdown Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Class Distribution Chart */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-[15px] text-slate-800 flex items-center gap-2">
                      <BarChart3 size={17} className="text-indigo-600" />
                      <span>Class Label Taxonomy</span>
                    </h4>
                    {classesCount > 0 && (
                      <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {classesCount} Classes
                      </span>
                    )}
                  </div>
                  <ClassDistributionBarChart classCounts={classCounts} totalImages={validImgs} />
                </div>

                {/* Formats & Health Screen */}
                <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                    <h4 className="font-extrabold text-[15px] text-slate-800">File Format Proportions</h4>
                    <FormatProportionsBar formats={composition?.formats} totalImages={validImgs} />
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                    <h4 className="font-extrabold text-[15px] text-slate-800">Aspect Ratios & Quality Screen</h4>
                    <div className="grid grid-cols-2 gap-3 text-[12px]">
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100">
                        <div className="text-emerald-700 font-bold">Good Quality Images</div>
                        <div className="text-[18px] font-black text-slate-800 mt-1">{goodQuality.toLocaleString()}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="text-slate-600 font-bold">Flagged for Review</div>
                        <div className="text-[18px] font-black text-slate-800 mt-1">{flaggedQuality.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="text-[12px] text-slate-500 pt-1">
                      Aspect Ratios:{' '}
                      <span className="font-semibold text-slate-700">
                        {Object.entries(aspectRatios)
                          .map(([k, v]) => `${k} (${typeof v === 'object' ? JSON.stringify(v) : v})`)
                          .join(' • ') || 'Standard distribution'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DEDUPLICATION AUDIT */}
          {activeTab === 'duplicates' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-[16px] text-slate-800 flex items-center gap-2">
                    <Layers size={18} className="text-amber-500" />
                    <span>Redundancy Proportion Overview</span>
                  </h4>
                  <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {(duplicates.status || 'NOT RUN').toUpperCase()}
                  </span>
                </div>

                <DuplicateBreakdownChart
                  examined={dupExamined}
                  exact={dupExact}
                  near={dupNear}
                  clean={dupClean}
                />
              </div>

              {/* Data Leakage Warning Box */}
              {dupNear > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900 flex items-start gap-3">
                  <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-extrabold text-[13px]">
                      Research Warning: Train / Test Leakage Risk
                    </div>
                    <p className="leading-relaxed text-amber-800">
                      With {dupNear} near-duplicate images ({dupAffectedPct}% of dataset), standard random splitting will place near-identical images into both training and validation folds. This produces artificially inflated validation accuracy and catastrophic real-world performance drops.
                    </p>
                  </div>
                </div>
              )}

              {/* Methodology & Clusters Table */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <h4 className="font-extrabold text-[15px] text-slate-800 flex items-center gap-2">
                  <Cpu size={16} className="text-indigo-600" />
                  <span>Detection Parameters</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px] text-slate-600">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <strong className="text-slate-800">Stage 1 (Exact Copies):</strong> SHA-256 cryptographic hashing (0 false positives).
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <strong className="text-slate-800">Stage 2 (Near-Duplicates):</strong> Perceptual hashing (dHash) & DINOv2 visual similarity clustering.
                  </div>
                </div>

                {duplicates.sample_groups?.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <div className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">
                      Identified Duplicate Clusters (Top {duplicates.sample_groups.length})
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-[12.5px]">
                      {duplicates.sample_groups.map((grp, idx) => (
                        <div key={idx} className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-slate-800">Cluster #{String(grp.group_id || idx + 1).slice(0, 8)}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              {grp.image_count || grp.count || 2} Copies
                            </span>
                          </div>
                          <span className="text-[11.5px] font-mono text-slate-400">
                            Confidence: {grp.confidence_score != null ? `${(grp.confidence_score * 100).toFixed(0)}%` : 'High'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PURPOSE SUITABILITY */}
          {activeTab === 'purpose' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* 8-Task Interactive Cards */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12.5px] text-slate-500 font-medium">
                  <span>Select a computer vision regime to inspect rule-based evaluation criteria:</span>
                  <span className="text-[11px] text-indigo-600 font-bold">Click any task below</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {purposesList.map((p) => {
                    const isSelected = p.purpose_key === selectedPurposeKey;
                    const badgeStyle =
                      p.overall_status === 'Good Fit' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      p.overall_status === 'Review Recommended' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-rose-50 text-rose-700 border-rose-200';

                    return (
                      <button
                        key={p.purpose_key}
                        onClick={() => setSelectedPurposeKey(p.purpose_key)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/60 shadow-md ring-2 ring-indigo-600/30'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-extrabold text-[13px] text-slate-800 truncate">
                          {p.purpose_display_name || p.purpose_key}
                        </div>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider ${badgeStyle}`}>
                            {p.overall_status || 'Assessed'}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {p.warning_count} warns
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Task Criterion Breakdown */}
              {selectedPurpose && (
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-black text-[16px] text-slate-800">
                        {selectedPurpose.purpose_display_name || selectedPurpose.purpose_key} — Criterion Audit
                      </h4>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        {selectedPurpose.favorable_count} favorable criteria • {selectedPurpose.warning_count} warnings • {selectedPurpose.critical_count} critical issues
                      </p>
                    </div>
                    <span className={`text-[11.5px] font-black px-3 py-1 rounded-xl border uppercase tracking-wider ${
                      selectedPurpose.overall_status === 'Good Fit' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                      selectedPurpose.overall_status === 'Review Recommended' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                      'bg-rose-50 text-rose-800 border-rose-300'
                    }`}>
                      Verdict: {selectedPurpose.overall_status}
                    </span>
                  </div>

                  {selectedPurpose.top_findings?.length > 0 ? (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-[12.5px]">
                      {selectedPurpose.top_findings.map((c, idx) => {
                        const icon =
                          c.status === 'pass' || c.severity === 'favorable' ? <CheckCircle2 size={17} className="text-emerald-500 shrink-0" /> :
                          c.status === 'warning' || c.severity === 'warning' ? <AlertTriangle size={17} className="text-amber-500 shrink-0" /> :
                          <XCircle size={17} className="text-rose-500 shrink-0" />;

                        return (
                          <div key={idx} className="p-3.5 flex items-start justify-between gap-4 hover:bg-slate-50">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5">{icon}</div>
                              <div>
                                <div className="font-bold text-slate-800">{c.metric_name || c.name || `Finding #${idx + 1}`}</div>
                                <div className="text-[12px] text-slate-600 mt-0.5 leading-relaxed">
                                  {c.message || c.interpretation || c.explanation}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                              {c.measured_value != null ? String(c.measured_value) : c.value_formatted || 'Assessed'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-[13px]">
                      No specific criterion warnings recorded for this purpose.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DOMAIN GAP & TARGET FIT */}
          {activeTab === 'domain' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-[16px] text-slate-800 flex items-center gap-2">
                    <Compass size={18} className="text-cyan-500" />
                    <span>Target Deployment Coverage Assessment</span>
                  </h4>
                  <span className="text-[11.5px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {(domain_check?.status || 'NOT RUN').toUpperCase()}
                  </span>
                </div>

                {domain_check?.status === 'not_assessed' ? (
                  <div className="p-8 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <Compass size={32} className="mx-auto text-slate-400" />
                    <div className="font-bold text-slate-700">Domain Gap Check Not Yet Assessed</div>
                    <p className="text-[13px] text-slate-500 max-w-md mx-auto">
                      Upload 10–30 deployment photos in the Domain Gap Check module to calculate coverage percentage and visual proximity.
                    </p>
                  </div>
                ) : (
                  <>
                    <DomainCoverageBar
                      covered={dcCovered}
                      total={dcTotal}
                      pct={domain_check?.coverage_pct}
                      cutoff={dcCutoff}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[12.5px]">
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                        <div className="text-[11px] font-bold text-slate-400 uppercase">Embedding Backbone</div>
                        <div className="font-bold text-slate-800 mt-1 truncate">
                          {domain_check?.embedding_model || 'DINOv2 ViT-B/14 (768-dim)'}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                        <div className="text-[11px] font-bold text-slate-400 uppercase">Centroid Cosine Sim</div>
                        <div className="font-bold text-slate-800 mt-1">
                          {domain_check?.centroid_similarity != null ? `${(domain_check.centroid_similarity * 100).toFixed(1)}%` : 'N/A'}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
                        <div className="text-[11px] font-bold text-slate-400 uppercase">Baseline Cutoff</div>
                        <div className="font-bold text-slate-800 mt-1">
                          {Number(dcCutoff).toFixed(3)}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: PROVENANCE & BIBTEX */}
          {activeTab === 'provenance' && (
            <div className="space-y-5 animate-in fade-in-50 duration-200">
              {/* BibTeX Citation Box */}
              <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-black text-[15px] flex items-center gap-2 text-indigo-300">
                    <BookOpen size={16} />
                    <span>Publication BibTeX Citation</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(bibtexCitation, 'bibtex')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedBibtex ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedBibtex ? 'Copied to Clipboard!' : 'Copy BibTeX'}</span>
                  </button>
                </div>

                <pre className="p-4 rounded-xl bg-slate-950 font-mono text-[12px] text-indigo-200 overflow-x-auto border border-white/10 leading-relaxed">
                  {bibtexCitation}
                </pre>
              </div>

              {/* Technical Parameters Table */}
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <h4 className="font-black text-[16px] text-slate-800">
                  Technical Parameters & Reproducibility Record
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-[12.5px]">
                  <div className="grid grid-cols-3 p-3 bg-slate-50 font-bold text-slate-700">
                    <div>Field / Metric</div>
                    <div className="col-span-2">Value</div>
                  </div>
                  <div className="grid grid-cols-3 p-3">
                    <span className="font-bold text-slate-700">Dataset UUID</span>
                    <span className="col-span-2 font-mono text-slate-600 truncate">{identity.dataset_id}</span>
                  </div>
                  <div className="grid grid-cols-3 p-3">
                    <span className="font-bold text-slate-700">Content Checksum</span>
                    <span className="col-span-2 font-mono text-slate-600 truncate">{identity.file_list_checksum || 'Pending computation'}</span>
                  </div>
                  <div className="grid grid-cols-3 p-3">
                    <span className="font-bold text-slate-700">Duplicate Methods</span>
                    <span className="col-span-2 text-slate-600">SHA-256 + Perceptual Hash (dHash)</span>
                  </div>
                  <div className="grid grid-cols-3 p-3">
                    <span className="font-bold text-slate-700">Domain Extractor</span>
                    <span className="col-span-2 text-slate-600">DINOv2 ViT-B/14 (768-dim)</span>
                  </div>
                  <div className="grid grid-cols-3 p-3">
                    <span className="font-bold text-slate-700">Card Generated At</span>
                    <span className="col-span-2 font-mono text-slate-600">{new Date(identity.card_generated_at).toISOString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
       * FULL REPORT VIEW (If toggled by user)
       * ------------------------------------------------------------- */}
      {viewMode === 'full' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Section A */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">A. Dataset Identity and Provenance</h3>
              <span className="text-[11px] font-mono text-slate-400">Section A</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12.5px]">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Dataset Name</div>
                <div className="font-bold text-slate-800 mt-1">{identity.dataset_name}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Source</div>
                <div className="font-bold text-slate-800 mt-1 capitalize">{identity.dataset_source_type}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Created Date</div>
                <div className="font-bold text-slate-800 mt-1">{new Date(identity.dataset_created_at || Date.now()).toLocaleDateString()}</div>
              </div>
            </div>
          </section>

          {/* Section B */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">B. Composition & Profiling</h3>
              <span className="text-[11px] font-mono text-slate-400">Section B</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-[14px] text-slate-800 mb-3">Class Distribution</h4>
                <ClassDistributionBarChart classCounts={classCounts} totalImages={validImgs} />
              </div>
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="font-bold text-[14px] text-slate-800">Formats</h4>
                <FormatProportionsBar formats={composition?.formats} totalImages={validImgs} />
              </div>
            </div>
          </section>

          {/* Section C */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">C. Duplicate Detection & Redundancy</h3>
              <span className="text-[11px] font-mono text-slate-400">Section C</span>
            </div>
            <DuplicateBreakdownChart
              examined={dupExamined}
              exact={dupExact}
              near={dupNear}
              clean={dupClean}
            />
          </section>

          {/* Section D */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">D. Purpose Fitting</h3>
              <span className="text-[11px] font-mono text-slate-400">Section D</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {purposesList.map((p) => (
                <div key={p.purpose_key} className="p-3 rounded-xl border border-slate-200 text-left bg-slate-50">
                  <div className="font-bold text-[12.5px] text-slate-800 truncate">{p.purpose_display_name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{p.overall_status}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Section E */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">E. Domain Gap Check</h3>
              <span className="text-[11px] font-mono text-slate-400">Section E</span>
            </div>
            <DomainCoverageBar
              covered={dcCovered}
              total={dcTotal}
              pct={domain_check?.coverage_pct}
              cutoff={dcCutoff}
            />
          </section>

          {/* Section F */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">F. Evidence Synthesis</h3>
              <span className="text-[11px] font-mono text-slate-400">Section F</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12.5px]">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                <div className="font-bold text-emerald-800 mb-2">Strengths</div>
                <ul className="space-y-1">
                  {integrated_findings?.strengths?.map((s, idx) => (
                    <li key={idx}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40">
                <div className="font-bold text-rose-800 mb-2">Risks & Concerns</div>
                <ul className="space-y-1">
                  {integrated_findings?.risks_and_concerns?.map((c, idx) => (
                    <li key={idx}>• {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Section G */}
          <section className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-[17px] text-slate-800">G. Reproducibility Parameters</h3>
              <span className="text-[11px] font-mono text-slate-400">Section G</span>
            </div>
            <pre className="p-4 rounded-xl bg-slate-900 text-indigo-200 font-mono text-[12px] overflow-x-auto">
              {bibtexCitation}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
}
