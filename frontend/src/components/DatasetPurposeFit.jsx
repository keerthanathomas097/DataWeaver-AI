import React, { useState, useEffect, useMemo } from 'react';
import {
  Tag,
  Target,
  Maximize2,
  Search,
  Copy,
  Sparkles,
  Brain,
  Award,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Loader2,
  Activity,
  Layers,
  HelpCircle,
  Check,
} from 'lucide-react';
import { evaluatePurposeFit } from '../api/purposeFittingApi';

// Plain-language, concise purpose definitions for compact selection cards
const DEFAULT_PURPOSES = [
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
    short_description: 'Learn visual representations without manual labels.',
    icon: Brain,
  },
  {
    key: 'benchmarking',
    display_name: 'Benchmarking',
    short_description: 'Evaluate models consistently on a test dataset.',
    icon: Award,
  },
];

// Plain-language mapping for technical metric labels on radar axes & cards
const PLAIN_METRIC_LABELS = {
  duplicate_ratio: 'Repeated Images',
  long_tail_imbalance: 'Uneven Category Sizes',
  zero_resolution_variance: 'Same Image Size',
  single_aspect_ratio: 'Same Image Shape',
  narrow_brightness_contrast: 'Limited Lighting Variety',
  high_blur_ratio: 'Blurry Images',
  low_visual_diversity: 'Limited Visual Variety',
  low_silhouette_score: 'Indistinct Visual Groups',
  high_visual_outlier_ratio: 'Many Isolated Images',
  mixed_domain: 'Mixed Image Types',
  visually_similar_ratio: 'Visually Similar Images',
  duplicate_concentration: 'Duplicate Concentration',
  suspiciously_uniform_class_balance: 'Uniform Class Distribution',
  single_source_domain: 'Single Image Source',
};

// Plain-language purpose context explanations for the right-hand panel
const PURPOSE_EXPLANATIONS = {
  classification:
    'Classification models learn to categorize images into target classes. A well-suited dataset generally benefits from minimal duplicate images, balanced category sizes, and clear image sharpness across all classes.',
  object_detection:
    'Object detection requires finding and localizing objects across backgrounds. Datasets generally benefit from diverse scene viewpoints, varied image dimensions, and sharp object outlines.',
  segmentation:
    'Segmentation networks trace precise pixel-level boundaries. High image clarity and consistent contrast are especially important so masks can separate objects cleanly from their surroundings.',
  retrieval:
    'Image retrieval systems match queries with similar indexed images. Collections generally benefit from broad visual variety across styles and topics to serve relevant search results.',
  dedup_research:
    'Deduplication research evaluates methods for identifying identical or modified images. Datasets with genuine repeated or near-duplicate images provide essential evaluation examples.',
  generative:
    'Generative models learn visual patterns to synthesize new images. Training generally benefits from wide visual variety, rich dynamic range in lighting, and minimal image repetition to avoid memorization.',
  self_supervised:
    'Self-supervised learning trains visual backbones without human labels. Models generally benefit from diverse real-world scenes, varied image sizes, and continuous visual variety.',
  benchmarking:
    'Benchmark datasets provide standardized tests for comparing models. They require high data integrity, zero duplicate leakage between splits, and representative test instances.',
};

/* -------------------------------------------------------------
 * Pure SVG Radar Chart for Dataset Fit Overview
 * Scale: 0: Critical, 1: Warning, 2: Neutral, 3: Favorable
 * ------------------------------------------------------------- */
function PurposeFitRadarChart({ data = [], size = 320 }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length < 3) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-slate-400 text-[12.5px] text-center">
        <Activity size={28} className="mb-2 text-slate-300" />
        <span>Insufficient applicable characteristics to construct radar chart.</span>
      </div>
    );
  }

  const center = size / 2;
  const radius = (size / 2) - 55;
  const numAxes = data.length;
  const angleStep = (Math.PI * 2) / numAxes;

  // Concentric levels: 1 (Warning), 2 (Neutral), 3 (Favorable)
  const levels = [
    { level: 1, label: 'Warning' },
    { level: 2, label: 'Neutral' },
    { level: 3, label: 'Favorable' },
  ];

  // Calculate polygon points for the dataset
  const polygonPoints = data.map((item, idx) => {
    const angle = idx * angleStep - Math.PI / 2;
    // Normalized distance from center (0 to 3 scaled to 0 to radius)
    const dist = Math.max(0.2, (item.ordinal_score || 0) / 3) * radius;
    const x = center + dist * Math.cos(angle);
    const y = center + dist * Math.sin(angle);
    const plainLabel = PLAIN_METRIC_LABELS[item.metric_key] || item.metric_display_name;
    return { x, y, item, idx, angle, plainLabel };
  });

  const polygonPath =
    polygonPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    ' Z';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="overflow-visible select-none">
          <defs>
            <radialGradient id="radarFillGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.10" />
            </radialGradient>
            <filter id="radarShadow" x="-10%" y="-10%" width="130%" height="130%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1e3a8a" floodOpacity="0.12" />
            </filter>
          </defs>

          {/* Background Concentric Grid Polygons */}
          {levels.map(({ level }) => {
            const r = (level / 3) * radius;
            const gridPoints = Array.from({ length: numAxes })
              .map((_, idx) => {
                const angle = idx * angleStep - Math.PI / 2;
                const x = center + r * Math.cos(angle);
                const y = center + r * Math.sin(angle);
                return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(' ') + ' Z';

            return (
              <path
                key={level}
                d={gridPoints}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth={level === 2 ? '1.5' : '1'}
                strokeDasharray={level === 2 ? 'none' : '3 3'}
              />
            );
          })}

          {/* Radial Spokes */}
          {Array.from({ length: numAxes }).map((_, idx) => {
            const angle = idx * angleStep - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            return (
              <line
                key={idx}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}

          {/* Data Polygon */}
          <path
            d={polygonPath}
            fill="url(#radarFillGradient)"
            stroke="#4f46e5"
            strokeWidth="2.2"
            filter="url(#radarShadow)"
            className="transition-all duration-300"
          />

          {/* Data Vertices */}
          {polygonPoints.map((p, idx) => {
            const isHovered = hoveredIndex === idx;
            const score = p.item.ordinal_score;
            const dotColor =
              score === 3 ? '#10b981' : score === 2 ? '#3b82f6' : score === 1 ? '#f59e0b' : '#ef4444';

            return (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r={isHovered ? 6 : 4}
                fill={dotColor}
                stroke="#ffffff"
                strokeWidth="2"
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}

          {/* Plain-Language Axis Labels */}
          {polygonPoints.map((p, idx) => {
            const angle = p.angle;
            const labelDist = radius + 18;
            const lx = center + labelDist * Math.cos(angle);
            const ly = center + labelDist * Math.sin(angle);

            const textAnchor =
              Math.abs(Math.cos(angle)) < 0.25 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
            const isHovered = hoveredIndex === idx;

            return (
              <text
                key={idx}
                x={lx}
                y={ly + 3.5}
                textAnchor={textAnchor}
                className={`text-[10.5px] font-semibold transition-colors cursor-pointer select-none ${
                  isHovered ? 'fill-blue-600 font-extrabold' : 'fill-slate-600'
                }`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {p.plainLabel}
              </text>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 bg-slate-900 text-white rounded-xl px-2.5 py-1.5 text-[11px] shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${polygonPoints[hoveredIndex].x}px`,
              top: `${polygonPoints[hoveredIndex].y - 8}px`,
            }}
          >
            <p className="font-bold text-slate-100">{polygonPoints[hoveredIndex].plainLabel}</p>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  data[hoveredIndex].verdict === 'favorable'
                    ? 'bg-emerald-400'
                    : data[hoveredIndex].verdict === 'neutral'
                    ? 'bg-blue-400'
                    : data[hoveredIndex].verdict === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              <span className="capitalize font-medium">
                {data[hoveredIndex].verdict === 'favorable'
                  ? 'Looks good'
                  : data[hoveredIndex].verdict === 'neutral'
                  ? 'No concern'
                  : data[hoveredIndex].verdict === 'warning'
                  ? 'Review'
                  : 'Important concern'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Overview Legend */}
      <div className="mt-2 text-center max-w-xs space-y-1">
        <div className="flex items-center justify-center gap-3 text-[10.5px] font-semibold text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Looks good
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Neutral
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Review
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Concern
          </span>
        </div>
        <p className="text-[10px] text-slate-400 leading-normal">
          Relative summary of rule checks. Does not represent raw continuous measurements.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * Main DatasetPurposeFit Component
 * ------------------------------------------------------------- */
export default function DatasetPurposeFit({ dataset, onBack }) {
  const [selectedPurpose, setSelectedPurpose] = useState('classification');
  const [fitData, setFitData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedExplanations, setExpandedExplanations] = useState({});
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showAboutAnalysis, setShowAboutAnalysis] = useState(false);

  const datasetId = dataset?.dataset_id;

  // Fetch purpose-fit results whenever datasetId or selectedPurpose changes
  useEffect(() => {
    if (!datasetId || !selectedPurpose) return;

    let isMounted = true;
    const fetchFit = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await evaluatePurposeFit(datasetId, selectedPurpose);
        if (isMounted) {
          setFitData(res);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to evaluate purpose fit:', err);
          const detail = err.response?.data?.detail || 'Failed to evaluate purpose-fitting rules.';
          setError(detail);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchFit();
    return () => {
      isMounted = false;
    };
  }, [datasetId, selectedPurpose]);

  const toggleExplanation = (ruleId) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [ruleId]: !prev[ruleId],
    }));
  };

  const currentPurposeMeta = useMemo(() => {
    return (
      DEFAULT_PURPOSES.find((p) => p.key === selectedPurpose) || {
        key: selectedPurpose,
        display_name: fitData?.purpose_display_name || selectedPurpose,
        short_description: '',
        icon: Tag,
      }
    );
  }, [selectedPurpose, fitData]);

  // Deterministically derive high-level human-readable interpretation from existing verdict counts
  const overallInterpretation = useMemo(() => {
    if (!fitData?.summary) return null;
    const { critical = 0, warning = 0 } = fitData.summary;

    if (critical > 0) {
      return {
        status: 'Significant Concerns',
        badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
        borderColor: 'border-rose-200',
        cardBg: 'bg-gradient-to-r from-rose-50/90 to-white',
        icon: AlertOctagon,
        iconBg: 'bg-rose-100 text-rose-600',
        tagline: 'Review Recommended Before Use',
        sentence:
          'The analysis found characteristics that may make this dataset challenging for this purpose. Review the highlighted areas below.',
      };
    }
    if (warning > 0) {
      return {
        status: 'Review Recommended',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        borderColor: 'border-amber-200',
        cardBg: 'bg-gradient-to-r from-amber-50/90 to-white',
        icon: AlertTriangle,
        iconBg: 'bg-amber-100 text-amber-600',
        tagline: 'Useful Baseline with Specific Areas to Review',
        sentence:
          'The dataset has several useful characteristics, but some areas should be reviewed before using it for this purpose.',
      };
    }
    return {
      status: 'Good Fit',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      borderColor: 'border-emerald-200',
      cardBg: 'bg-gradient-to-r from-emerald-50/90 to-white',
      icon: CheckCircle2,
      iconBg: 'bg-emerald-100 text-emerald-600',
      tagline: 'Characteristics Align with Purpose',
      sentence: "The dataset's current characteristics generally align with the selected purpose.",
    };
  }, [fitData]);

  // Separate favorable findings from neutral observations for clearer visual hierarchy
  const favorableFindings = useMemo(() => {
    return fitData?.dataset_characteristics?.filter((c) => c.verdict === 'favorable') || [];
  }, [fitData]);

  const neutralObservations = useMemo(() => {
    return fitData?.dataset_characteristics?.filter((c) => c.verdict === 'neutral') || [];
  }, [fitData]);

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* -------------------------------------------------------------
       * Compact Header Card with Back Navigation
       * ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Return to Dataset Profile"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Target size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-extrabold text-[18px] text-slate-900 tracking-tight">
                Purpose Fit Analysis
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
                {dataset?.dataset_name || 'Dataset'}
              </span>
            </div>
            <p className="text-[12px] text-slate-500 font-medium">
              Choose your intended research purpose to see how this dataset matches up.
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60 self-end sm:self-auto">
          Heuristic Rules Engine v1.0
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Compact Purpose Selection Grid (Substantially Reduced Height)
       * ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
            What do you want to use this dataset for?
          </span>
          <span className="text-[11px] text-slate-400">Click any purpose to update analysis</span>
        </div>

        {/* 4 cols x 2 rows on desktop with tight vertical footprint */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {DEFAULT_PURPOSES.map((purpose) => {
            const Icon = purpose.icon;
            const isSelected = selectedPurpose === purpose.key;

            return (
              <button
                key={purpose.key}
                onClick={() => setSelectedPurpose(purpose.key)}
                className={`text-left p-2.5 px-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 group relative ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/15 shadow-2xs'
                    : 'border-slate-200/70 hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600'
                  }`}
                >
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    className={`font-bold text-[12.5px] truncate leading-tight ${
                      isSelected ? 'text-blue-900' : 'text-slate-800'
                    }`}
                  >
                    {purpose.display_name}
                  </h4>
                  <p className="text-[10.5px] text-slate-500 truncate mt-0.5 leading-none">
                    {purpose.short_description}
                  </p>
                </div>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Error State
       * ------------------------------------------------------------- */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center space-y-2.5">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertOctagon size={20} />
          </div>
          <h4 className="font-bold text-[14.5px] text-rose-900">Analysis Unavailable</h4>
          <p className="text-[12.5px] text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            onClick={onBack}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[12px] font-semibold transition-colors cursor-pointer"
          >
            Return to Profiling
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Loading State
       * ------------------------------------------------------------- */}
      {isLoading && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center space-y-2.5 shadow-xs">
          <Loader2 size={26} className="animate-spin text-blue-600 mx-auto" />
          <h4 className="font-bold text-[14px] text-slate-800">
            Checking dataset for {currentPurposeMeta.display_name}...
          </h4>
          <p className="text-[12px] text-slate-500">
            Evaluating measured characteristics against rules.
          </p>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Loaded Purpose-Fit Dashboard Content
       * ------------------------------------------------------------- */}
      {!isLoading && !error && fitData && (
        <div className="space-y-4">
          {/* -------------------------------------------------------------
           * Human-Readable Result Banner (Clear Status + Plain-Language Summary)
           * ------------------------------------------------------------- */}
          {overallInterpretation && (
            <div
              className={`border ${overallInterpretation.borderColor} ${overallInterpretation.cardBg} rounded-2xl p-4.5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl ${overallInterpretation.iconBg} flex items-center justify-center shrink-0 mt-0.5`}
                >
                  <overallInterpretation.icon size={22} />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Overall Assessment
                    </span>
                    <span
                      className={`text-[11.5px] font-extrabold px-2.5 py-0.5 rounded-full border ${overallInterpretation.badgeColor}`}
                    >
                      {overallInterpretation.status}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-[12.5px] font-bold text-slate-800">
                      {currentPurposeMeta.display_name}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-700 font-medium leading-snug">
                    {overallInterpretation.sentence}
                  </p>
                </div>
              </div>

              {/* Simplified Verdict Counts Strip */}
              <div className="flex items-center gap-2 text-[12px] font-bold shrink-0 self-stretch sm:self-auto justify-between sm:justify-start bg-white/70 p-2 rounded-xl border border-slate-200/60">
                <div className="px-2 py-0.5 text-emerald-700 flex items-center gap-1" title="Favorable characteristics">
                  <span>✓ Looks good</span>
                  <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-md font-extrabold">
                    {fitData.summary?.favorable ?? 0}
                  </span>
                </div>
                <div className="px-2 py-0.5 text-blue-700 flex items-center gap-1" title="Neutral criteria">
                  <span>• No concern</span>
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-md font-extrabold">
                    {fitData.summary?.neutral ?? 0}
                  </span>
                </div>
                <div className="px-2 py-0.5 text-amber-700 flex items-center gap-1" title="Advisory warnings">
                  <span>⚠ Review</span>
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md font-extrabold">
                    {fitData.summary?.warning ?? 0}
                  </span>
                </div>
                <div className="px-2 py-0.5 text-rose-700 flex items-center gap-1" title="Critical concerns">
                  <span>! Concern</span>
                  <span className="bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-md font-extrabold">
                    {fitData.summary?.critical ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Purpose Mismatch Banner (Non-Alarmist Informational Notice) */}
          {fitData.purpose_mismatch && fitData.purpose_mismatch.mismatch === true && (
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 flex items-start gap-3 shadow-2xs">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                <Info size={16} />
              </div>
              <div className="space-y-0.5 text-[12.5px]">
                <h4 className="font-bold text-indigo-900">
                  Dataset Documentation Note
                </h4>
                <p className="text-indigo-800 leading-snug">
                  {fitData.purpose_mismatch.message}
                </p>
                <p className="text-[11px] text-indigo-600 font-medium">
                  Stated primary context: <span className="italic">"{fitData.purpose_mismatch.creator_purpose}"</span>
                </p>
              </div>
            </div>
          )}

          {/* Grid: Radar Chart + What this means panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Col: Radar Chart */}
            <div className="lg:col-span-6 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
                      Dataset Fit Overview
                    </h3>
                    <p className="text-[12px] text-slate-500">
                      A visual summary of how the dataset's characteristics align with your selected purpose.
                    </p>
                  </div>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    Radar
                  </span>
                </div>
              </div>

              <div className="py-2 flex items-center justify-center">
                <PurposeFitRadarChart data={fitData.radar_data} size={320} />
              </div>
            </div>

            {/* Right Col: What this means for your dataset + Analysis Summary */}
            <div className="lg:col-span-6 space-y-3.5">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <currentPurposeMeta.icon size={17} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[14px] text-slate-900">
                      What this means for your dataset
                    </h4>
                    <span className="text-[11.5px] text-slate-400 font-medium">
                      {currentPurposeMeta.display_name} requirements
                    </span>
                  </div>
                </div>

                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  {PURPOSE_EXPLANATIONS[selectedPurpose] || currentPurposeMeta.short_description}
                </p>

                {/* Collapsible Heuristic Disclaimer */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setShowAboutAnalysis(!showAboutAnalysis)}
                    className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    <HelpCircle size={13} className="text-slate-400" />
                    <span>About this analysis</span>
                    {showAboutAnalysis ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {showAboutAnalysis && (
                    <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {fitData.provenance?.description ||
                        'These findings are produced using configurable heuristic rules based on general machine-learning dataset-quality reasoning. They are intended as guidance rather than a guaranteed measure of dataset suitability.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Analysis Summary (Replaces technical "Rule Evaluation Distribution") */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-[13px] text-slate-900">
                    Analysis Summary
                  </h5>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {fitData.all_rules?.length || 0} characteristics analyzed
                  </span>
                </div>

                {/* Visual Status Bar */}
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  {fitData.summary?.favorable > 0 && (
                    <div
                      className="bg-emerald-500 h-full"
                      style={{
                        width: `${(fitData.summary.favorable / (fitData.all_rules?.length || 1)) * 100}%`,
                      }}
                      title={`Looks good: ${fitData.summary.favorable}`}
                    />
                  )}
                  {fitData.summary?.neutral > 0 && (
                    <div
                      className="bg-blue-500 h-full"
                      style={{
                        width: `${(fitData.summary.neutral / (fitData.all_rules?.length || 1)) * 100}%`,
                      }}
                      title={`Neutral: ${fitData.summary.neutral}`}
                    />
                  )}
                  {fitData.summary?.warning > 0 && (
                    <div
                      className="bg-amber-500 h-full"
                      style={{
                        width: `${(fitData.summary.warning / (fitData.all_rules?.length || 1)) * 100}%`,
                      }}
                      title={`Review needed: ${fitData.summary.warning}`}
                    />
                  )}
                  {fitData.summary?.critical > 0 && (
                    <div
                      className="bg-rose-500 h-full"
                      style={{
                        width: `${(fitData.summary.critical / (fitData.all_rules?.length || 1)) * 100}%`,
                      }}
                      title={`Major concerns: ${fitData.summary.critical}`}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-[11.5px]">
                  <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 text-slate-600">
                    <span>Looks good:</span>
                    <span className="font-bold text-emerald-700">{fitData.summary?.favorable ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 text-slate-600">
                    <span>No major concern:</span>
                    <span className="font-bold text-blue-700">{fitData.summary?.neutral ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 text-slate-600">
                    <span>Needs review:</span>
                    <span className="font-bold text-amber-700">{fitData.summary?.warning ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 text-slate-600">
                    <span>Major concerns:</span>
                    <span className="font-bold text-rose-700">{fitData.summary?.critical ?? 0}</span>
                  </div>
                </div>

                {fitData.unavailable_metrics?.length > 0 && (
                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
                    <span>{fitData.unavailable_metrics.length} characteristics could not be assessed</span>
                    <span
                      className="cursor-help text-slate-500 font-semibold"
                      title="Some checks require information that is not available in this dataset's profile."
                    >
                      Why? ℹ
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* -------------------------------------------------------------
           * SECTION 1: What needs attention? (Flagged Warnings & Critical Findings)
           * ------------------------------------------------------------- */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight flex items-center gap-2">
                  <span>What should I look at?</span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      fitData.flagged_findings?.length > 0
                        ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                    }`}
                  >
                    {fitData.flagged_findings?.length || 0} items
                  </span>
                </h3>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Characteristics that warrant review or remediation for {currentPurposeMeta.display_name}.
                </p>
              </div>
            </div>

            {fitData.flagged_findings && fitData.flagged_findings.length > 0 ? (
              <div className="space-y-2.5">
                {fitData.flagged_findings.map((item) => {
                  const isCritical = item.verdict === 'critical';
                  const isExpanded = expandedExplanations[item.rule_id];
                  const plainLabel = PLAIN_METRIC_LABELS[item.metric_key] || item.metric_display_name;

                  return (
                    <div
                      key={item.rule_id}
                      className={`border rounded-xl p-3.5 transition-all ${
                        isCritical
                          ? 'border-rose-200 bg-rose-50/40'
                          : 'border-amber-200 bg-amber-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              isCritical
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {isCritical ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-[13.5px] text-slate-900">
                                {plainLabel}
                              </h4>
                              <span
                                className={`text-[9.5px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                  isCritical
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {isCritical ? 'Important Concern' : 'Review'}
                              </span>
                            </div>
                            <p className="text-[12.5px] text-slate-700 mt-0.5 leading-relaxed">
                              {item.message}
                            </p>

                            {/* Measured value vs Threshold */}
                            <div className="flex items-center gap-2.5 mt-1.5 text-[11.5px]">
                              <span className="font-medium text-slate-600">
                                Observed:{' '}
                                <span className="font-bold text-slate-900">
                                  {typeof item.metric_value === 'number'
                                    ? item.metric_value.toFixed(3)
                                    : String(item.metric_value)}
                                </span>
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="font-medium text-slate-500">
                                Threshold:{' '}
                                <span className="font-mono text-slate-700">
                                  {item.operator} {item.threshold}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleExplanation(item.rule_id)}
                          className="text-[11.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0 px-2 py-1 rounded-md hover:bg-white/80 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide' : 'Why does this matter?'}</span>
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>

                      {/* Expandable Explanation */}
                      {isExpanded && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 text-[12px] text-slate-600 pl-9 space-y-1">
                          <p className="leading-relaxed">{item.explanation}</p>
                          <p className="text-[10.5px] text-slate-400 font-mono pt-0.5">
                            Check ID: {item.rule_id}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-5 text-center space-y-1.5">
                <CheckCircle2 size={22} className="text-emerald-600 mx-auto" />
                <h4 className="font-bold text-[13.5px] text-emerald-900">
                  Nothing significant was flagged
                </h4>
                <p className="text-[12px] text-emerald-700 max-w-md mx-auto">
                  No major concerns were identified by the configured checks for {currentPurposeMeta.display_name}.
                </p>
              </div>
            )}
          </div>

          {/* -------------------------------------------------------------
           * SECTION 2: What looks good (Favorable Findings)
           * ------------------------------------------------------------- */}
          {favorableFindings.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight flex items-center gap-2">
                    <span>What looks good</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      {favorableFindings.length} positive
                    </span>
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Characteristics that clearly support {currentPurposeMeta.display_name}.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {favorableFindings.map((item) => {
                  const plainLabel = PLAIN_METRIC_LABELS[item.metric_key] || item.metric_display_name;
                  return (
                    <div
                      key={item.rule_id}
                      className="border border-emerald-200/80 bg-emerald-50/30 rounded-xl p-3 flex items-start gap-2.5"
                    >
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 size={14} />
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-[12.5px] text-slate-800">
                          {plainLabel}
                        </h4>
                        <p className="text-[11.5px] text-slate-600 leading-snug">{item.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
           * SECTION 3: Other Observations (Neutral Items)
           * ------------------------------------------------------------- */}
          {neutralObservations.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Other observations</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                      {neutralObservations.length} neutral
                    </span>
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Characteristics operating within expected baseline ranges for this purpose.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {neutralObservations.map((item) => {
                  const plainLabel = PLAIN_METRIC_LABELS[item.metric_key] || item.metric_display_name;
                  return (
                    <div
                      key={item.rule_id}
                      className="border border-slate-200/70 bg-slate-50/50 rounded-xl p-3 flex items-start gap-2.5"
                    >
                      <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} />
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-[12.5px] text-slate-800">
                          {plainLabel}
                        </h4>
                        <p className="text-[11.5px] text-slate-600 leading-snug">{item.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
           * SECTION 4: Expandable Technical Details
           * ------------------------------------------------------------- */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <button
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Layers size={15} />
                </div>
                <div>
                  <h4 className="font-bold text-[13px] text-slate-900">
                    Technical Details
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    View raw rule IDs, operator conditions, source profile paths, and unavailable metrics.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[12px] font-bold text-slate-600">
                <span>{showTechnicalDetails ? 'Collapse' : 'Expand'}</span>
                {showTechnicalDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showTechnicalDetails && (
              <div className="p-5 border-t border-slate-100 space-y-5">
                {/* Rules Table */}
                <div>
                  <h5 className="font-bold text-[12.5px] text-slate-800 mb-2">
                    Evaluated Purpose Rules
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11.5px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                          <th className="py-2 px-2.5">Rule ID</th>
                          <th className="py-2 px-2.5">Metric Key</th>
                          <th className="py-2 px-2.5">Condition</th>
                          <th className="py-2 px-2.5">Observed</th>
                          <th className="py-2 px-2.5">Triggered</th>
                          <th className="py-2 px-2.5">Verdict</th>
                          <th className="py-2 px-2.5">Source Profile Field</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {fitData.all_rules?.map((r) => (
                          <tr key={r.rule_id} className="hover:bg-slate-50/60">
                            <td className="py-1.5 px-2.5 font-semibold text-slate-800">{r.rule_id}</td>
                            <td className="py-1.5 px-2.5 text-slate-700">{r.metric_key}</td>
                            <td className="py-1.5 px-2.5 text-slate-600">
                              {r.operator} {r.threshold}
                            </td>
                            <td className="py-1.5 px-2.5 font-bold text-slate-900">
                              {typeof r.metric_value === 'number'
                                ? r.metric_value.toFixed(4)
                                : String(r.metric_value ?? 'N/A')}
                            </td>
                            <td className="py-1.5 px-2.5">
                              <span
                                className={`px-1.5 py-0.2 rounded font-bold ${
                                  r.triggered ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {String(r.triggered)}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5">
                              <span
                                className={`px-1.5 py-0.2 rounded uppercase font-bold text-[9.5px] ${
                                  r.verdict === 'critical'
                                    ? 'bg-rose-100 text-rose-800'
                                    : r.verdict === 'warning'
                                    ? 'bg-amber-100 text-amber-800'
                                    : r.verdict === 'favorable'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {r.verdict}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-500 font-sans text-[10.5px]">
                              {r.source_profile_field || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Unavailable Metrics Section */}
                {fitData.unavailable_metrics && fitData.unavailable_metrics.length > 0 && (
                  <div>
                    <h5 className="font-bold text-[12.5px] text-slate-800 mb-1.5">
                      Unavailable / Unsupported Proposed Metrics
                    </h5>
                    <div className="space-y-1.5">
                      {fitData.unavailable_metrics.map((u, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 flex items-start justify-between text-[11.5px]"
                        >
                          <div>
                            <span className="font-bold text-slate-800">{u.metric_display_name}</span>
                            <span className="text-slate-400 font-mono text-[10.5px] ml-2">({u.metric_key})</span>
                            <p className="text-slate-500 text-[11px] mt-0.5">{u.reason}</p>
                          </div>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-200 text-slate-700 shrink-0">
                            Unavailable
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
