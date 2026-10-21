import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Layers,
  Eye,
  Info,
  CheckCircle2,
  AlertTriangle,
  Compass,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Tag,
  Crosshair,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  AlertCircle,
  Activity,
  Layers2,
} from 'lucide-react';
import {
  computeDensityGrid,
  marchingSquares,
  segmentsToSvgPath,
  connectSegmentsToPolygons,
  computeDistributionOverlap,
} from '../utils/contourUtils';

const CLASS_PALETTE = [
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
  '#65a30d', // lime-600
  '#ea580c', // orange-600
  '#4f46e5', // indigo-600
  '#0d9488', // teal-600
];

function getClassColor(className, classMap) {
  if (!className) return '#64748b';
  if (!(className in classMap)) {
    const idx = Object.keys(classMap).length % CLASS_PALETTE.length;
    classMap[className] = CLASS_PALETTE[idx];
  }
  return classMap[className];
}

const formatPct = (val, fallback = '0.0') => {
  if (typeof val === 'number' && !isNaN(val)) {
    return (val * 100).toFixed(1);
  }
  return fallback;
};

export default function SourceTargetDomainGapMap({
  datasetPoints = [],
  samples = [],
  selectedSampleIndex = null,
  onSelectSample = () => {},
  projectionMethod = 'umap',
  baselineThreshold = null,
  distributionDistance = null,
}) {
  // SVG Canvas coordinate dimensions with dedicated margins for publication framing
  const width = 860;
  const height = 540;
  const margin = { top: 24, right: 32, bottom: 44, left: 44 };
  const plotW = width - margin.left - margin.right; // 784
  const plotH = height - margin.top - margin.bottom; // 472

  // Interaction & View State
  const [hoveredItem, setHoveredItem] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [viewFilter, setViewFilter] = useState('all'); // 'all' | 'gaps' | 'covered'
  const [showDensity, setShowDensity] = useState(true);
  const [showTargetMarkers, setShowTargetMarkers] = useState(true);
  const [colorByClass, setColorByClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedDatasetPoint, setSelectedDatasetPoint] = useState(null);

  // Zoom & Pan state
  const [zoomTransform, setZoomTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Convert normalized [5, 95] percentage coords to SVG canvas pixels inside the plot frame
  const getSvgX = useCallback(
    (x) => {
      if (typeof x !== 'number' || isNaN(x)) return width / 2;
      return margin.left + (x / 100) * plotW;
    },
    [plotW, margin.left, width]
  );
  const getSvgY = useCallback(
    (y) => {
      if (typeof y !== 'number' || isNaN(y)) return height / 2;
      return margin.top + (y / 100) * plotH;
    },
    [plotH, margin.top, height]
  );

  // Class detection and color map for dataset source points
  const { hasClasses, classColorMap } = useMemo(() => {
    const map = {};
    datasetPoints.forEach((p) => {
      const cls = p.class_label;
      if (cls && !(cls in map)) {
        const idx = Object.keys(map).length % CLASS_PALETTE.length;
        map[cls] = CLASS_PALETTE[idx];
      }
    });

    return {
      hasClasses: Object.keys(map).length > 0,
      classColorMap: map,
    };
  }, [datasetPoints]);

  // Active selected target sample
  const activeSample = useMemo(() => {
    if (selectedSampleIndex === null) return null;
    return samples.find((s) => s.index === selectedSampleIndex) || null;
  }, [samples, selectedSampleIndex]);

  // Pre-calculate nearest dataset points for all samples (Evidence-Driven)
  const sampleMatchMap = useMemo(() => {
    const map = {};
    samples.forEach((sample) => {
      if (sample.nearest && sample.nearest.length > 0) {
        const topMatch = sample.nearest[0];
        const topMatchPath = topMatch?.image_path;
        if (topMatchPath) {
          const match = datasetPoints.find((d) => d.image_path === topMatchPath);
          if (match && typeof match.x === 'number' && typeof match.y === 'number') {
            const targetX = getSvgX(match.x);
            const targetY = getSvgY(match.y);
            const sampleX = getSvgX(sample.x);
            const sampleY = getSvgY(sample.y);
            const dist2d = Math.sqrt(
              Math.pow(targetX - sampleX, 2) + Math.pow(targetY - sampleY, 2)
            );

            map[sample.index] = {
              targetX,
              targetY,
              sampleX,
              sampleY,
              dist2d,
              match,
              similarity: topMatch?.similarity ?? sample.nearest_similarity ?? 0,
            };
          }
        }
      }
    });
    return map;
  }, [samples, datasetPoints, getSvgX, getSvgY]);

  // Detect overlapping target markers (<13px apart in SVG canvas space)
  const sampleOverlapMap = useMemo(() => {
    const map = {};
    for (let i = 0; i < samples.length; i++) {
      const s1 = samples[i];
      const s1x = getSvgX(s1.x);
      const s1y = getSvgY(s1.y);
      const cluster = [s1];
      for (let j = 0; j < samples.length; j++) {
        if (i === j) continue;
        const s2 = samples[j];
        const s2x = getSvgX(s2.x);
        const s2y = getSvgY(s2.y);
        if (Math.hypot(s1x - s2x, s1y - s2y) < 13) {
          cluster.push(s2);
        }
      }
      map[s1.index] = cluster;
    }
    return map;
  }, [samples, getSvgX, getSvgY]);

  // Click handler that cycles through co-located targets when overlapping
  const handleMarkerClick = (sample, e) => {
    e.stopPropagation();
    setSelectedDatasetPoint(null);
    const siblings = sampleOverlapMap[sample.index];
    if (siblings && siblings.length > 1 && selectedSampleIndex === sample.index) {
      const currentIdx = siblings.findIndex((s) => s.index === sample.index);
      const nextSample = siblings[(currentIdx + 1) % siblings.length];
      onSelectSample(nextSample.index);
    } else {
      onSelectSample(selectedSampleIndex === sample.index ? null : sample.index);
    }
  };

  // Check if active sample appears close in 2D projection but is below cutoff in 768-D space
  const is2dDistorted = useMemo(() => {
    if (!activeSample || activeSample.covered) return false;
    const matchData = sampleMatchMap[activeSample.index];
    if (!matchData) return false;
    return matchData.dist2d < 85;
  }, [activeSample, sampleMatchMap]);

  // =========================================================================
  // 1. Source (Training Dataset) Distribution KDE & Contours (Rich Cobalt Blue)
  // =========================================================================
  const { sourceContours, sourceGrid, sourceMaxDensity } = useMemo(() => {
    if (datasetPoints.length < 8) {
      return { sourceContours: [], sourceGrid: null, sourceMaxDensity: 0 };
    }

    const pixelPoints = datasetPoints.map((p) => ({
      x: getSvgX(p.x),
      y: getSvgY(p.y),
    }));

    const cols = 52;
    const rows = 32;
    const { grid, dx, dy, maxDensity } = computeDensityGrid(
      pixelPoints,
      width,
      height,
      cols,
      rows,
      38
    );

    if (maxDensity <= 0) return { sourceContours: [], sourceGrid: null, sourceMaxDensity: 0 };

    const levels = [
      {
        threshold: maxDensity * 0.14,
        stroke: '#3b82f6', // blue-500
        strokeOpacity: 0.80,
        strokeWidth: 1.2,
        fill: '#dbeafe', // cobalt-100
        fillOpacity: 0.46,
      },
      {
        threshold: maxDensity * 0.38,
        stroke: '#2563eb', // blue-600
        strokeOpacity: 0.88,
        strokeWidth: 1.5,
        fill: '#93c5fd', // cobalt-200
        fillOpacity: 0.48,
      },
      {
        threshold: maxDensity * 0.68,
        stroke: '#1d4ed8', // blue-700 / deep cobalt
        strokeOpacity: 0.96,
        strokeWidth: 1.85,
        fill: '#60a5fa', // cobalt-400
        fillOpacity: 0.42,
      },
    ];

    const contours = levels.map((lvl) => {
      const segments = marchingSquares(grid, cols, rows, dx, dy, lvl.threshold);
      return {
        path: segmentsToSvgPath(segments),
        closedPath: connectSegmentsToPolygons(segments),
        ...lvl,
      };
    });

    return { sourceContours: contours, sourceGrid: grid, sourceMaxDensity: maxDensity };
  }, [datasetPoints, width, height, getSvgX, getSvgY]);

  // =========================================================================
  // 2. Target (Real-World Deployment) Distribution KDE & Contours (Vivid Coral / Warm Vermilion)
  // =========================================================================
  const { targetContours, targetGrid, targetMaxDensity, targetIsSmallSample } = useMemo(() => {
    // Graceful fallback for small samples: avoid misleading contours if M < 4
    if (samples.length < 4) {
      return {
        targetContours: [],
        targetGrid: null,
        targetMaxDensity: 0,
        targetIsSmallSample: samples.length > 0,
      };
    }

    const pixelPoints = samples.map((s) => ({
      x: getSvgX(s.x),
      y: getSvgY(s.y),
    }));

    const cols = 52;
    const rows = 32;
    // Slightly wider bandwidth for target photos (M = 10-30) to produce cohesive density field
    const { grid, dx, dy, maxDensity } = computeDensityGrid(
      pixelPoints,
      width,
      height,
      cols,
      rows,
      46
    );

    if (maxDensity <= 0) {
      return { targetContours: [], targetGrid: null, targetMaxDensity: 0, targetIsSmallSample: false };
    }

    const levels = [
      {
        threshold: maxDensity * 0.16,
        stroke: '#fb923c', // orange-400 / coral
        strokeOpacity: 0.82,
        strokeDash: '4 3',
        strokeWidth: 1.25,
        fill: '#ffedd5', // coral-100
        fillOpacity: 0.50,
      },
      {
        threshold: maxDensity * 0.40,
        stroke: '#f97316', // orange-500 / vermilion
        strokeOpacity: 0.90,
        strokeDash: '6 3',
        strokeWidth: 1.55,
        fill: '#fed7aa', // vermilion-200
        fillOpacity: 0.52,
      },
      {
        threshold: maxDensity * 0.68,
        stroke: '#ea580c', // deep vermilion-600
        strokeOpacity: 0.96,
        strokeDash: 'none',
        strokeWidth: 1.95,
        fill: '#fdba74', // coral-300
        fillOpacity: 0.46,
      },
    ];

    const contours = levels.map((lvl) => {
      const segments = marchingSquares(grid, cols, rows, dx, dy, lvl.threshold);
      return {
        path: segmentsToSvgPath(segments),
        closedPath: connectSegmentsToPolygons(segments),
        ...lvl,
      };
    });

    return {
      targetContours: contours,
      targetGrid: grid,
      targetMaxDensity: maxDensity,
      targetIsSmallSample: false,
    };
  }, [samples, width, height, getSvgX, getSvgY]);

  // =========================================================================
  // 3. Distribution Overlap Metric (Normalized 2D density grid intersection)
  // =========================================================================
  const densityOverlapScore = useMemo(() => {
    if (!sourceGrid || !targetGrid) return null;
    return computeDistributionOverlap(sourceGrid, targetGrid, 32, 52);
  }, [sourceGrid, targetGrid]);

  // Zoom / Pan handlers
  const handleZoomIn = () => {
    setZoomTransform((prev) => ({
      ...prev,
      scale: Math.min(prev.scale * 1.35, 4.0),
    }));
  };

  const handleZoomOut = () => {
    setZoomTransform((prev) => ({
      ...prev,
      scale: Math.max(prev.scale / 1.35, 1.0),
      x: prev.scale <= 1.35 ? 0 : prev.x,
      y: prev.scale <= 1.35 ? 0 : prev.y,
    }));
  };

  const handleResetZoom = () => {
    setZoomTransform({ scale: 1, x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setDragStart({ x: e.clientX - zoomTransform.x, y: e.clientY - zoomTransform.y });
  };

  const handleMouseMove = (e) => {
    if (!isPanning || zoomTransform.scale <= 1) return;
    setZoomTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    setZoomTransform((prev) => ({
      ...prev,
      scale: Math.min(Math.max(prev.scale * zoomFactor, 1.0), 4.0),
    }));
  };

  // Sample counts
  const totalSamples = samples.length;
  const gapCount = samples.filter((s) => !s.covered).length;
  const coveredCount = samples.filter((s) => s.covered).length;

  return (
    <div className="bg-[#fcfbf9] border border-[#e5e2dc] rounded-2xl p-5.5 shadow-xs space-y-4 font-sans select-none">
      {/* -------------------------------------------------------------
       * Top Bar: Title & View Controls
       * ------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#ece8e1]">
        <div>
          <div className="flex items-center gap-2.5">
            <h4 className="font-extrabold text-[16.5px] text-slate-900 tracking-tight flex items-center gap-2">
              <span>Source–Target Domain Gap Map</span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-[#f0f4ff] text-[#1e40af] border border-[#c7d7fe]">
                <Sparkles size={11} className="text-[#2563eb]" />
                {projectionMethod.toUpperCase()} Shared Feature Space
              </span>
            </h4>
          </div>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Shared distribution map comparing training dataset concentration (source) with real-world target photos.
          </p>
        </div>

        {/* View Mode Filters & Display Layer Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Segmented Filter Control */}
          <div className="flex items-center bg-[#f4f1ea] p-1 rounded-xl border border-[#ded9ce] text-[11.5px] font-semibold text-slate-600">
            <button
              onClick={() => setViewFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                viewFilter === 'all'
                  ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200/60'
                  : 'hover:text-slate-900'
              }`}
            >
              All Photos ({totalSamples})
            </button>
            <button
              onClick={() => setViewFilter('gaps')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewFilter === 'gaps'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200 font-bold shadow-xs'
                  : 'text-rose-700 hover:text-rose-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Below Cutoff ({gapCount})</span>
            </button>
            <button
              onClick={() => setViewFilter('covered')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                viewFilter === 'covered'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold shadow-xs'
                  : 'text-emerald-700 hover:text-emerald-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>Covered ({coveredCount})</span>
            </button>
          </div>

          {/* Density Toggle */}
          <button
            onClick={() => setShowDensity(!showDensity)}
            className={`px-2.5 py-1 rounded-xl text-[11.5px] font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showDensity
                ? 'bg-[#f4f1ea] border-[#ded9ce] text-slate-900 font-bold'
                : 'bg-white border-[#e5e2dc] text-slate-500 hover:bg-[#faf8f5]'
            }`}
            title="Toggle source and target density fields"
          >
            <Layers size={12} className={showDensity ? 'text-indigo-600' : 'text-slate-400'} />
            <span>Distribution Fields</span>
          </button>

          {/* Target Markers Toggle */}
          <button
            onClick={() => setShowTargetMarkers(!showTargetMarkers)}
            className={`px-2.5 py-1 rounded-xl text-[11.5px] font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showTargetMarkers
                ? 'bg-[#f4f1ea] border-[#ded9ce] text-slate-900 font-bold'
                : 'bg-white border-[#e5e2dc] text-slate-500 hover:bg-[#faf8f5]'
            }`}
            title="Toggle individual target photo markers"
          >
            <Crosshair size={12} className={showTargetMarkers ? 'text-indigo-600' : 'text-slate-400'} />
            <span>Target Markers</span>
          </button>

          {/* Class Coloring Toggle */}
          {hasClasses && (
            <button
              onClick={() => setColorByClass(!colorByClass)}
              className={`px-2.5 py-1 rounded-xl text-[11.5px] font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                colorByClass
                  ? 'bg-[#f4f1ea] border-[#ded9ce] text-slate-900 font-bold'
                  : 'bg-white border-[#e5e2dc] text-slate-500 hover:bg-[#faf8f5]'
              }`}
              title="Color source dataset points by class label"
            >
              <Tag size={12} className={colorByClass ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Color by Class</span>
            </button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Scientific Legend Bar (Source, Target, Overlap, & Target Status)
       * ------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3 text-[11.5px] font-medium text-slate-700 bg-[#f6f4ee] px-4 py-2.5 rounded-xl border border-[#e2ded5] flex-wrap">
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          {/* Source Distribution */}
          <div
            className="flex items-center gap-2"
            title="Training dataset image concentration in shared feature space (Cobalt Blue)"
          >
            <span className="w-3.5 h-3.5 rounded bg-[#dbeafe] border-2 border-[#1d4ed8] shadow-2xs shrink-0" />
            <span className="font-semibold text-slate-800">Source (Training Data)</span>
          </div>

          {/* Target Distribution */}
          <div
            className="flex items-center gap-2"
            title="Uploaded real-world target image distribution (Warm Coral / Vermilion)"
          >
            <span className="w-3.5 h-3.5 rounded bg-[#ffedd5] border-2 border-dashed border-[#ea580c] shadow-2xs shrink-0" />
            <span className="font-semibold text-slate-800">Target (Deployment Photos)</span>
          </div>

          {/* Overlap Zone */}
          <div
            className="flex items-center gap-2"
            title="Shared feature-space region where source and target distributions overlap in this projection"
          >
            <span className="w-3.5 h-3.5 rounded bg-gradient-to-r from-[#93c5fd] to-[#fed7aa] border border-[#6366f1] shadow-2xs shrink-0" />
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              <span>Projected 2D Overlap {densityOverlapScore !== null && `(${formatPct(densityOverlapScore)}%)`}</span>
              <span
                className="text-slate-400 hover:text-slate-600 cursor-help"
                title="Measures the area intersection of source and target 2D kernel density distributions within this UMAP projection. This reflects 2D visual co-location in the exploratory projection, not high-dimensional feature coverage."
              >
                <HelpCircle size={12} />
              </span>
            </span>
          </div>

          {/* Target Markers status */}
          <div className="flex items-center gap-3.5 pl-2 border-l border-[#ded9ce]">
            <div className="flex items-center gap-1.5" title="Target image meeting similarity cutoff">
              <span className="w-2.5 h-2.5 rounded-full bg-[#059669] ring-2 ring-emerald-200 border border-white" />
              <span>Meets Cutoff</span>
            </div>
            <div className="flex items-center gap-1.5" title="Target image below similarity cutoff">
              <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48] ring-2 ring-rose-200 border border-dashed border-[#e11d48]" />
              <span>Below Cutoff</span>
            </div>
          </div>
        </div>

        {hasClasses && colorByClass && (
          <div className="text-[11px] text-slate-500 font-semibold hidden sm:flex items-center gap-1">
            <span>Class colors active</span>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
       * 70% Map Canvas / 30% Evidence Inspection Panel Layout
       * ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Map Canvas Area (~70% Width) */}
        <div
          ref={containerRef}
          className="lg:col-span-8 relative bg-[#faf8f5] border border-[#e5e2dc] rounded-2xl overflow-hidden min-h-[520px] flex items-center justify-center shadow-xs cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => {
            handleMouseMove(e);
            if (hoveredItem && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setHoverPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }
          }}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Canvas Navigation Toolbar (Zoom / Reset) */}
          <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-[#ded9ce] shadow-xs text-slate-700">
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-[#f4f1ea] hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-[#f4f1ea] hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-[#f4f1ea] hover:text-slate-900 rounded-lg transition-colors cursor-pointer text-[10.5px] font-bold px-2"
              title="Reset View"
            >
              Reset
            </button>
          </div>

          {/* Small Sample Notice (if M < 4) */}
          {targetIsSmallSample && (
            <div className="absolute top-3.5 left-3.5 z-20 bg-amber-50/95 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-1.5 shadow-2xs">
              <Info size={13} className="text-amber-600 shrink-0" />
              <span>Small target sample ({samples.length} photos): Individual markers shown; density contours require ≥ 4 photos.</span>
            </div>
          )}

          {/* Interactive Class Filter Selector (when colorByClass is active) */}
          {hasClasses && colorByClass && (
            <div className="absolute bottom-3 left-3.5 z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-[#ded9ce] text-[10.5px] text-slate-700 max-w-[calc(100%-120px)] overflow-x-auto scrollbar-none shadow-xs">
              <span className="font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
                Class Filter:
              </span>
              <button
                onClick={() => setSelectedClass(null)}
                className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors shrink-0 ${
                  selectedClass === null
                    ? 'bg-slate-900 text-white font-bold'
                    : 'hover:text-slate-900 hover:bg-[#f4f1ea]'
                }`}
              >
                All
              </button>
              {Object.keys(classColorMap).map((cls) => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls === selectedClass ? null : cls)}
                  className={`px-2 py-0.5 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 ${
                    selectedClass === cls
                      ? 'bg-slate-900 text-white font-bold'
                      : 'hover:text-slate-900 hover:bg-[#f4f1ea]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: classColorMap[cls] }}
                  />
                  <span>{cls}</span>
                </button>
              ))}
            </div>
          )}

          {/* Canvas SVG */}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full select-none"
          >
            {/* Outer SVG Canvas Background (Warm Archival Off-White) */}
            <rect width={width} height={height} fill="#faf8f5" />

            {/* Static Axes Framing Layer (Pinned to Frame, Free of Data Collisions) */}
            <g className="pointer-events-none">
              {/* Bottom Axis Line & Ticks */}
              <line
                x1={margin.left}
                y1={margin.top + plotH}
                x2={margin.left + plotW}
                y2={margin.top + plotH}
                stroke="#d5d0c5"
                strokeWidth="1.2"
              />
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                <line
                  key={`xtick-${i}`}
                  x1={margin.left + plotW * pct}
                  y1={margin.top + plotH}
                  x2={margin.left + plotW * pct}
                  y2={margin.top + plotH + 4}
                  stroke="#d5d0c5"
                  strokeWidth="1.2"
                />
              ))}

              {/* Left Axis Line & Ticks */}
              <line
                x1={margin.left}
                y1={margin.top}
                x2={margin.left}
                y2={margin.top + plotH}
                stroke="#d5d0c5"
                strokeWidth="1.2"
              />
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                <line
                  key={`ytick-${i}`}
                  x1={margin.left - 4}
                  y1={margin.top + plotH * pct}
                  x2={margin.left}
                  y2={margin.top + plotH * pct}
                  stroke="#d5d0c5"
                  strokeWidth="1.2"
                />
              ))}

              {/* Axis Titles Placed Cleanly in the Margins (Zero Overlap with Data) */}
              <text
                x={margin.left + plotW / 2}
                y={height - 12}
                textAnchor="middle"
                fill="#334155"
                fontSize="11"
                fontWeight="600"
                letterSpacing="0.03em"
              >
                Embedding Dimension 1 ({projectionMethod.toUpperCase()})
              </text>
              <text
                transform={`translate(14, ${margin.top + plotH / 2}) rotate(-90)`}
                textAnchor="middle"
                fill="#334155"
                fontSize="11"
                fontWeight="600"
                letterSpacing="0.03em"
              >
                Embedding Dimension 2 ({projectionMethod.toUpperCase()})
              </text>
            </g>

            {/* Clip Path to Neatly Keep Plotted Elements Inside Plot Bounds */}
            <defs>
              <clipPath id="plot-area-clip">
                <rect
                  x={margin.left}
                  y={margin.top}
                  width={plotW}
                  height={plotH}
                  rx="6"
                />
              </clipPath>
            </defs>

            {/* Inner Plot Area */}
            <g clipPath="url(#plot-area-clip)">
              {/* Inner Plot Paper Canvas */}
              <rect
                x={margin.left}
                y={margin.top}
                width={plotW}
                height={plotH}
                fill="#fcfbfa"
              />

              {/* Subtle Gridlines */}
              <g stroke="#ebe7df" strokeWidth="0.8" strokeDasharray="3 3">
                {[0.25, 0.5, 0.75].map((pct, i) => (
                  <React.Fragment key={`grid-${i}`}>
                    <line
                      x1={margin.left + plotW * pct}
                      y1={margin.top}
                      x2={margin.left + plotW * pct}
                      y2={margin.top + plotH}
                    />
                    <line
                      x1={margin.left}
                      y1={margin.top + plotH * pct}
                      x2={margin.left + plotW}
                      y2={margin.top + plotH * pct}
                    />
                  </React.Fragment>
                ))}
              </g>

              {/* Zoomable & Pannable Data Content Layer */}
              <g
                transform={`translate(${zoomTransform.x}, ${zoomTransform.y}) scale(${zoomTransform.scale})`}
                className="transition-transform duration-75"
              >
                {/* ---------------------------------------------------------
                 * DISTRIBUTION FIELDS LAYER (Cobalt Blue + Warm Vermilion Fills)
                 * --------------------------------------------------------- */}
                {showDensity && (
                  <g className="transition-opacity duration-300 pointer-events-none">
                    {/* Layer A: Source (Training Dataset) Density Fills (Rich Cobalt Blue) */}
                    {sourceContours.map((contour, idx) =>
                      contour.closedPath ? (
                        <path
                          key={`source-fill-${idx}`}
                          d={contour.closedPath}
                          fill={contour.fill}
                          fillOpacity={contour.fillOpacity}
                          stroke="none"
                        />
                      ) : null
                    )}

                    {/* Layer B: Target (Deployment Photos) Density Fills (Vivid Coral / Vermilion) */}
                    {targetContours.map((contour, idx) =>
                      contour.closedPath ? (
                        <path
                          key={`target-fill-${idx}`}
                          d={contour.closedPath}
                          fill={contour.fill}
                          fillOpacity={contour.fillOpacity}
                          stroke="none"
                        />
                      ) : null
                    )}

                    {/* Layer C: Source Iso-density Contour Strokes (Crisp Cobalt) */}
                    {sourceContours.map((contour, idx) => (
                      <path
                        key={`source-stroke-${idx}`}
                        d={contour.path}
                        fill="none"
                        stroke={contour.stroke}
                        strokeWidth={contour.strokeWidth}
                        strokeOpacity={contour.strokeOpacity}
                        strokeDasharray={contour.strokeDash}
                      />
                    ))}

                    {/* Layer D: Target Iso-density Contour Strokes (Crisp Vermilion) */}
                    {targetContours.map((contour, idx) => (
                      <path
                        key={`target-stroke-${idx}`}
                        d={contour.path}
                        fill="none"
                        stroke={contour.stroke}
                        strokeWidth={contour.strokeWidth}
                        strokeOpacity={contour.strokeOpacity}
                        strokeDasharray={contour.strokeDash}
                      />
                    ))}
                  </g>
                )}

                {/* ---------------------------------------------------------
                 * SOURCE DATASET POINTS (Crisp Cobalt Blue Scatter on Shared Space)
                 * --------------------------------------------------------- */}
                <g>
                  {datasetPoints.map((pt, idx) => {
                    const cx = getSvgX(pt.x);
                    const cy = getSvgY(pt.y);

                    const isNearestToActive =
                      sampleMatchMap[selectedSampleIndex]?.match?.image_path === pt.image_path;
                    const isSelectedDataset = selectedDatasetPoint?.image_path === pt.image_path;

                    const isClassDimmed =
                      selectedClass !== null && pt.class_label !== selectedClass;
                    const isFilterDimmed =
                      viewFilter === 'gaps' && !isNearestToActive;

                    let opacity = 0.65;
                    if (isClassDimmed || isFilterDimmed) opacity = 0.08;
                    if (isNearestToActive || isSelectedDataset) opacity = 1.0;

                    const pointColor =
                      colorByClass && pt.class_label && classColorMap[pt.class_label]
                        ? classColorMap[pt.class_label]
                        : '#1e40af';

                    return (
                      <circle
                        key={`dataset-${idx}`}
                        cx={cx}
                        cy={cy}
                        r={isNearestToActive || isSelectedDataset ? 6.5 : 3.0}
                        fill={isNearestToActive ? '#1e3a8a' : pointColor}
                        fillOpacity={opacity}
                        stroke="#ffffff"
                        strokeWidth={isNearestToActive || isSelectedDataset ? 2.2 : 0.6}
                        className="cursor-pointer transition-all duration-150 hover:scale-150 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDatasetPoint(pt);
                          onSelectSample(null);
                        }}
                        onMouseEnter={(e) => {
                          if (containerRef.current) {
                            const rect = containerRef.current.getBoundingClientRect();
                            setHoverPos({
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                          setHoveredItem({
                            type: 'dataset',
                            data: pt,
                            cx,
                            cy,
                          });
                        }}
                        onMouseLeave={() => setHoveredItem(null)}
                      />
                    );
                  })}
                </g>

                {/* ---------------------------------------------------------
                 * EVIDENCE CONNECTING LINE: Selected Target to Nearest Dataset Match
                 * Drawn ONLY when both coordinates and match relationship are available
                 * --------------------------------------------------------- */}
                {selectedSampleIndex !== null && sampleMatchMap[selectedSampleIndex] && (
                  (() => {
                    const matchData = sampleMatchMap[selectedSampleIndex];
                    const sample = samples.find((s) => s.index === selectedSampleIndex);
                    const strokeColor = sample?.covered ? '#059669' : '#e11d48';

                    return (
                      <g key={`nearest-link-${selectedSampleIndex}`}>
                        <line
                          x1={matchData.sampleX}
                          y1={matchData.sampleY}
                          x2={matchData.targetX}
                          y2={matchData.targetY}
                          stroke={strokeColor}
                          strokeWidth={1.8}
                          strokeDasharray="4 3"
                          strokeOpacity={0.85}
                          className="transition-all duration-200"
                        />

                        {/* Reticle Ring around Nearest Dataset Match */}
                        <g transform={`translate(${matchData.targetX}, ${matchData.targetY})`}>
                          <circle
                            r={14}
                            fill="none"
                            stroke="#1d4ed8"
                            strokeWidth="1.5"
                            strokeDasharray="3 2"
                          />
                          <circle
                            r={20}
                            fill="#2563eb"
                            fillOpacity="0.08"
                            stroke="#2563eb"
                            strokeWidth="0.8"
                          />
                        </g>

                        {/* Floating Similarity Badge on Midpoint */}
                        <g
                          transform={`translate(${
                            (matchData.sampleX + matchData.targetX) / 2
                          }, ${
                            (matchData.sampleY + matchData.targetY) / 2
                          })`}
                        >
                          <rect
                            x="-34"
                            y="-10"
                            width="68"
                            height="20"
                            rx="6"
                            fill="#0f172a"
                            stroke="#ffffff"
                            strokeWidth="1"
                            filter="drop-shadow(0 1px 3px rgba(0,0,0,0.18))"
                          />
                          <text
                            x="0"
                            y="4"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="9.5"
                            fontWeight="bold"
                          >
                            {formatPct(matchData.similarity)}% sim
                          </text>
                        </g>
                      </g>
                    );
                  })()
                )}

                {/* ---------------------------------------------------------
                 * TARGET-IMAGE MARKERS: High-Precision Markers & Overlapping Cluster Handling
                 * --------------------------------------------------------- */}
                {showTargetMarkers &&
                  samples
                    .slice()
                    .sort((a, b) => {
                      if (a.index === hoveredItem?.data?.index) return 1;
                      if (b.index === hoveredItem?.data?.index) return -1;
                      if (a.index === selectedSampleIndex) return 1;
                      if (b.index === selectedSampleIndex) return -1;
                      return 0;
                    })
                    .map((sample) => {
                      const sx = getSvgX(sample.x);
                      const sy = getSvgY(sample.y);
                      const isSelected = selectedSampleIndex === sample.index;
                      const isHovered =
                        hoveredItem?.type === 'sample' && hoveredItem?.data?.index === sample.index;
                      const isCovered = sample.covered;
                      const overlapCluster = sampleOverlapMap[sample.index] || [];
                      const isOverlap = overlapCluster.length > 1;

                      // Filter visibility
                      if (viewFilter === 'gaps' && isCovered) return null;
                      if (viewFilter === 'covered' && !isCovered) return null;

                      // When multiple unselected points overlap, only render the canonical first one to prevent muddy overlapping circles
                      const isSiblingSelected =
                        isOverlap && !isSelected && overlapCluster.some((s) => s.index === selectedSampleIndex);
                      if (isSiblingSelected) return null;

                      if (isOverlap && !isSelected) {
                        const canonicalIdx = overlapCluster[0].index;
                        if (sample.index !== canonicalIdx) return null;
                      }

                      // High-contrast status colors
                      const markerColor = isCovered ? '#059669' : '#e11d48';

                      // Current index within cluster for cycling
                      const clusterPos = isOverlap
                        ? overlapCluster.findIndex((s) => s.index === sample.index) + 1
                        : 1;

                      return (
                        <g
                          key={`sample-marker-${sample.index}`}
                          className="cursor-pointer transition-transform duration-150"
                          transform={`translate(${sx}, ${sy})`}
                          onClick={(e) => handleMarkerClick(sample, e)}
                          onMouseEnter={(e) => {
                            if (containerRef.current) {
                              const rect = containerRef.current.getBoundingClientRect();
                              setHoverPos({
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }
                            setHoveredItem({
                              type: 'sample',
                              data: sample,
                              cluster: isOverlap ? overlapCluster : null,
                              cx: sx,
                              cy: sy,
                            });
                          }}
                          onMouseLeave={() => setHoveredItem(null)}
                        >
                          {/* Active Selection Halo */}
                          {isSelected && (
                            <circle
                              r={17}
                              fill={markerColor}
                              fillOpacity="0.14"
                              stroke="#0f172a"
                              strokeWidth="1.8"
                              strokeDasharray="3 2"
                            />
                          )}

                          {/* White Buffer Ring for Sharp Contrast against Contours */}
                          <circle
                            r={isSelected ? 10.5 : 8}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth={isSelected ? 2.5 : 2}
                          />

                          {/* Outer Status Ring */}
                          <circle
                            r={isSelected ? 10.5 : 8}
                            fill="none"
                            stroke={markerColor}
                            strokeWidth={isSelected ? 2.5 : 1.8}
                            strokeDasharray={isCovered ? 'none' : '3 2'}
                          />

                          {/* Center Core Dot */}
                          <circle
                            r={isSelected ? 6 : 4.5}
                            fill={markerColor}
                            stroke="#ffffff"
                            strokeWidth="1.2"
                          />

                          {/* Unselected Overlapping Cluster Badge */}
                          {isOverlap && !isSelected && (
                            <g transform="translate(8, -8)">
                              <rect
                                x="-8"
                                y="-7"
                                width={overlapCluster.length >= 10 ? '19' : '15'}
                                height="14"
                                rx="4"
                                fill="#0f172a"
                                stroke="#ffffff"
                                strokeWidth="1"
                                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))"
                              />
                              <text
                                x={overlapCluster.length >= 10 ? '1.5' : '0'}
                                y="3.2"
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="8"
                                fontWeight="bold"
                              >
                                ×{overlapCluster.length}
                              </text>
                            </g>
                          )}

                          {/* Selected Member: Quick Cluster Cycle Pill */}
                          {isOverlap && isSelected && (
                            <g
                              transform="translate(18, -1)"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextSample = overlapCluster[clusterPos % overlapCluster.length];
                                onSelectSample(nextSample.index);
                              }}
                              className="cursor-pointer hover:opacity-90 transition-opacity"
                            >
                              <rect
                                x="0"
                                y="-9"
                                width="66"
                                height="18"
                                rx="6"
                                fill="#0f172a"
                                stroke="#ffffff"
                                strokeWidth="1"
                                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
                              />
                              <text
                                x="33"
                                y="3.5"
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="8.5"
                                fontWeight="bold"
                              >
                                ↻ Next ({clusterPos}/{overlapCluster.length})
                              </text>
                            </g>
                          )}

                          {/* Collision-Aware Label Badge */}
                          {(isSelected || isHovered) && (
                            <g transform={`translate(0, ${sy < 50 ? 16 : -14})`}>
                              <rect
                                x={sample.index >= 9 ? '-13' : '-11'}
                                y="-8"
                                width={sample.index >= 9 ? '26' : '22'}
                                height="16"
                                rx="4"
                                fill="#0f172a"
                                stroke="#ffffff"
                                strokeWidth="1"
                                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
                              />
                              <text
                                x="0"
                                y="3.5"
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="9"
                                fontWeight="bold"
                              >
                                #{sample.index + 1}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
              </g>

              {/* Outer Frame Border */}
              <rect
                x={margin.left}
                y={margin.top}
                width={plotW}
                height={plotH}
                fill="none"
                stroke="#ded9ce"
                strokeWidth="1"
                rx="6"
                className="pointer-events-none"
              />
            </g>
          </svg>

          {/* -------------------------------------------------------------
           * Precise Hover Tooltip Preview
           * ------------------------------------------------------------- */}
          {hoveredItem && (
            <div
              className="absolute z-30 pointer-events-none bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl text-[11.5px] shadow-xl border border-slate-700/80 max-w-[240px] space-y-2 transition-all duration-75"
              style={{
                left: Math.min(
                  Math.max(hoverPos.x - 120, 12),
                  (containerRef.current?.clientWidth || width) - 256
                ),
                top: hoverPos.y > 220 ? Math.max(hoverPos.y - 230, 12) : hoverPos.y + 16,
              }}
            >
              {hoveredItem.type === 'sample' ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                    <span className="font-extrabold text-[12.5px] text-slate-100">
                      Target Photo #{hoveredItem.data.index + 1}
                    </span>
                    <span
                      className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                        hoveredItem.data.covered
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {hoveredItem.data.covered ? 'Covered' : 'Below Cutoff'}
                    </span>
                  </div>

                  {hoveredItem.data.thumbnail_url ? (
                    <img
                      src={hoveredItem.data.thumbnail_url}
                      alt="Target thumbnail"
                      className="w-full h-24 object-contain bg-black/60 rounded-lg border border-slate-800"
                    />
                  ) : (
                    <div className="w-full h-16 bg-slate-800/60 rounded-lg flex items-center justify-center text-slate-400 text-[10px]">
                      <Eye size={16} className="mr-1 text-slate-400" />
                      <span>No thumbnail available</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Cosine Similarity:</span>
                      <span className="font-bold text-white">
                        {formatPct(hoveredItem.data.nearest_similarity)}%
                      </span>
                    </div>

                    {baselineThreshold !== null && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Score Margin:</span>
                        <span
                          className={`font-bold ${
                            hoveredItem.data.covered ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {hoveredItem.data.nearest_similarity >= baselineThreshold
                            ? `+${formatPct(hoveredItem.data.nearest_similarity - baselineThreshold)}% above cutoff`
                            : `-${formatPct(baselineThreshold - hoveredItem.data.nearest_similarity)}% below cutoff`}
                        </span>
                      </div>
                    )}

                    {baselineThreshold !== null && (
                      <div className="space-y-0.5 pt-0.5">
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full ${
                              hoveredItem.data.covered ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                            style={{
                              width: `${Math.min(
                                (hoveredItem.data.nearest_similarity || 0) * 100,
                                100
                              )}%`,
                            }}
                          />
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                            style={{ left: `${baselineThreshold * 100}%` }}
                            title={`Baseline cutoff: ${formatPct(baselineThreshold)}%`}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>0%</span>
                          <span className="text-amber-400 font-semibold">
                            Cutoff: {formatPct(baselineThreshold)}%
                          </span>
                          <span>100%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Overlapping co-located targets list */}
                  {sampleOverlapMap[hoveredItem.data.index]?.length > 1 && (
                    <div className="pt-1.5 border-t border-slate-800 text-[10px] space-y-1">
                      <div className="flex items-center justify-between text-slate-300 font-semibold">
                        <span>Co-located Targets ({sampleOverlapMap[hoveredItem.data.index].length}):</span>
                        <span className="text-slate-400 text-[9px]">Click to cycle</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sampleOverlapMap[hoveredItem.data.index].map((s) => (
                          <span
                            key={s.index}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              s.index === hoveredItem.data.index
                                ? 'ring-1 ring-white bg-slate-800 text-white'
                                : s.covered
                                ? 'bg-emerald-950/70 text-emerald-400'
                                : 'bg-rose-950/70 text-rose-400'
                            }`}
                          >
                            #{s.index + 1}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-extrabold text-[12px] text-slate-200 border-b border-slate-800 pb-1">
                    Source Dataset Image Point
                  </div>
                  {hoveredItem.data.image_url && (
                    <img
                      src={hoveredItem.data.image_url}
                      alt="Dataset point"
                      className="w-full h-24 object-contain bg-black/60 rounded-lg border border-slate-800"
                    />
                  )}
                  {hoveredItem.data.class_label && (
                    <div className="text-[11px] text-slate-300">
                      Category: <span className="font-bold text-white">{hoveredItem.data.class_label}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 truncate" title={hoveredItem.data.image_path}>
                    {hoveredItem.data.image_path}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------
         * EVIDENCE INSPECTION PANEL (~30% Width Layout)
         * ------------------------------------------------------------- */}
        <div className="lg:col-span-4 bg-[#faf9f6] border border-[#e5e2dc] rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xs">
          {activeSample ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-[#e5e2dc]">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      activeSample.covered ? 'bg-[#059669]' : 'bg-[#e11d48]'
                    }`}
                  />
                  <div>
                    <h5 className="font-extrabold text-[14px] text-slate-900 leading-none">
                      Target Photo #{activeSample.index + 1}
                    </h5>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Evidence & Nearest Source Match
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onSelectSample(null)}
                  className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer px-2 py-0.5 rounded-md hover:bg-[#ece8e1] transition-colors"
                >
                  Clear
                </button>
              </div>

              {/* Status Banner */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  activeSample.covered
                    ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50/90 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {activeSample.covered ? (
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-[12.5px] block leading-snug">
                      {activeSample.covered ? 'Meets Similarity Cutoff' : 'Below Similarity Cutoff'}
                    </span>
                    <span className="text-[11px] opacity-80 block">
                      Score: {formatPct(activeSample.nearest_similarity)}%
                      {baselineThreshold !== null && ` vs ${formatPct(baselineThreshold)}% cutoff`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score Margin Card */}
              <div className="bg-white p-3.5 rounded-xl border border-[#e5e2dc] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-semibold">Empirical Score Margin</span>
                  {activeSample.nearest_similarity !== null && baselineThreshold !== null && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold ${
                        activeSample.covered
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {activeSample.nearest_similarity >= baselineThreshold
                        ? `+${formatPct(activeSample.nearest_similarity - baselineThreshold)}% margin`
                        : `-${formatPct(baselineThreshold - activeSample.nearest_similarity)}% margin`}
                    </span>
                  )}
                </div>

                {baselineThreshold !== null && (
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/70">
                      <div
                        className={`h-full transition-all duration-300 ${
                          activeSample.covered ? 'bg-emerald-600' : 'bg-rose-500'
                        }`}
                        style={{
                          width: `${Math.min(
                            (activeSample.nearest_similarity || 0) * 100,
                            100
                          )}%`,
                        }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10"
                        style={{ left: `${baselineThreshold * 100}%` }}
                        title={`Baseline Cutoff: ${formatPct(baselineThreshold)}%`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                      <span>0%</span>
                      <span className="text-slate-800 font-bold">
                        Cutoff: {formatPct(baselineThreshold)}%
                      </span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Co-located targets switcher (if this sample overlaps with others) */}
              {sampleOverlapMap[activeSample.index]?.length > 1 && (
                <div className="bg-[#f4f1ea] rounded-xl p-2.5 border border-[#ded9ce] text-[11px] space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <Sparkles size={12} className="text-[#2563eb]" />
                      <span>Co-located Targets ({sampleOverlapMap[activeSample.index].length})</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">Click to switch</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sampleOverlapMap[activeSample.index].map((s) => (
                      <button
                        key={s.index}
                        onClick={() => onSelectSample(s.index)}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold cursor-pointer transition-colors ${
                          s.index === activeSample.index
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : s.covered
                            ? 'bg-emerald-100/90 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100/90 text-rose-800 hover:bg-rose-200'
                        }`}
                      >
                        #{s.index + 1} ({formatPct(s.nearest_similarity)}%)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scientific Honesty: 2D vs High-Dimensional Distortion Note */}
              {is2dDistorted && (
                <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3 flex items-start gap-2 text-[11px] text-amber-950 leading-snug">
                  <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>2D Projection Note:</strong> This photo appears visually close to dataset points on this 2D map, but its actual multi-dimensional similarity ({formatPct(activeSample.nearest_similarity)}%) is below the reference cutoff. 2D projections compress 768-D feature space and can distort visual distances. The high-dimensional cosine similarity score is the authoritative measure.
                  </div>
                </div>
              )}

              {/* Visual Side-by-Side Comparison */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Visual Evidence Comparison
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Left: Target Photo */}
                  <div className="space-y-1">
                    <span className="text-[10.5px] font-semibold text-slate-600 block truncate" title={activeSample.image_path}>
                      Target Photo
                    </span>
                    <div className="aspect-square rounded-xl bg-white border border-[#e2dfd7] overflow-hidden flex items-center justify-center p-1 shadow-2xs">
                      {activeSample.thumbnail_url ? (
                        <img
                          src={activeSample.thumbnail_url}
                          alt="Uploaded target photo"
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : (
                        <Eye size={20} className="text-slate-300" />
                      )}
                    </div>
                    {activeSample.image_path && (
                      <span className="text-[9.5px] text-slate-400 truncate block text-center" title={activeSample.image_path}>
                        {activeSample.image_path.split('/').pop()}
                      </span>
                    )}
                  </div>

                  {/* Right: Closest Dataset Match */}
                  <div className="space-y-1">
                    <span className="text-[10.5px] font-semibold text-slate-600 block truncate" title={activeSample.nearest?.[0]?.image_path}>
                      Nearest Dataset Match
                    </span>
                    <div className="aspect-square rounded-xl bg-white border border-[#e2dfd7] overflow-hidden flex items-center justify-center p-1 shadow-2xs">
                      {activeSample.nearest && activeSample.nearest.length > 0 && activeSample.nearest[0].image_url ? (
                        <img
                          src={activeSample.nearest[0].image_url}
                          alt="Closest match in dataset"
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : (
                        <Eye size={20} className="text-slate-300" />
                      )}
                    </div>
                    {activeSample.nearest?.[0]?.image_path && (
                      <span className="text-[9.5px] text-slate-400 truncate block text-center" title={activeSample.nearest[0].image_path}>
                        {activeSample.nearest[0].image_path.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Scientific Caveat / Plain-Language Meaning */}
              <div className="bg-white p-3 rounded-xl border border-[#e5e2dc] space-y-1 text-[11px] text-slate-600 leading-relaxed">
                <span className="font-bold text-slate-900 block text-[10.5px] uppercase tracking-wider">
                  Criterion Interpretation
                </span>
                <p>
                  A score below the reference cutoff ({formatPct(baselineThreshold)}%) indicates that this target condition (lighting, angle, background, or subject) is underrepresented in the dataset. This reflects a visual feature gap under the current embedding model, not guaranteed model failure.
                </p>
              </div>

              {/* Top 3 Nearest Candidate Matches */}
              {activeSample.nearest && activeSample.nearest.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Top Closest Dataset Matches
                  </span>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {activeSample.nearest.map((near, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-[#e5e2dc] shadow-2xs text-[11px]"
                      >
                        <div className="w-10 h-10 rounded bg-[#fcfbf9] border border-[#ece8e1] overflow-hidden shrink-0 flex items-center justify-center">
                          {near.image_url ? (
                            <img src={near.image_url} alt="Match" className="w-full h-full object-contain" />
                          ) : (
                            <Eye size={14} className="text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Rank #{idx + 1}</span>
                            <span className="font-bold text-indigo-600">
                              {formatPct(near.similarity)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5" title={near.image_path}>
                            {near.image_path}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : selectedDatasetPoint ? (
            /* Selected Dataset Point Details */
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#e5e2dc]">
                <h5 className="font-extrabold text-[14px] text-slate-900">
                  Source Dataset Image Inspection
                </h5>
                <button
                  onClick={() => setSelectedDatasetPoint(null)}
                  className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="aspect-square rounded-xl bg-white border border-[#e2dfd7] overflow-hidden flex items-center justify-center p-2 shadow-2xs">
                {selectedDatasetPoint.image_url ? (
                  <img
                    src={selectedDatasetPoint.image_url}
                    alt="Dataset point"
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <Eye size={28} className="text-slate-300" />
                )}
              </div>

              <div className="space-y-1 bg-white p-3 rounded-xl border border-[#e5e2dc] text-[11.5px]">
                {selectedDatasetPoint.class_label && (
                  <div className="text-slate-700">
                    <span className="text-slate-400 font-medium">Category:</span>{' '}
                    <span className="font-bold text-slate-900">{selectedDatasetPoint.class_label}</span>
                  </div>
                )}
                <div className="text-slate-500 truncate" title={selectedDatasetPoint.image_path}>
                  <span className="text-slate-400 font-medium">Path:</span> {selectedDatasetPoint.image_path}
                </div>
              </div>
            </div>
          ) : (
            /* Empty selection state */
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-2.5 text-slate-400 my-auto">
              <div className="w-11 h-11 rounded-2xl bg-[#f0f4ff] text-[#2563eb] flex items-center justify-center">
                <Compass size={22} />
              </div>
              <h5 className="font-extrabold text-[13.5px] text-slate-800">
                Select a Target Image on the Map
              </h5>
              <p className="text-[11.5px] text-slate-500 leading-relaxed max-w-[260px]">
                Click any colored target marker on the map or choose one from the list below to inspect its closest source dataset match and empirical similarity score.
              </p>
            </div>
          )}

          {/* Quick Photo Jumper Strip (Preserves access to every target image) */}
          <div className="pt-2 border-t border-[#ece8e1]">
            <div className="flex items-center justify-between text-[10.5px] text-slate-500 mb-1.5 font-bold uppercase tracking-wider">
              <span>Quick Select Target</span>
              <span>{samples.length} items</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {samples.map((s) => {
                const isSelected = selectedSampleIndex === s.index;
                return (
                  <button
                    key={s.index}
                    onClick={() => {
                      setSelectedDatasetPoint(null);
                      onSelectSample(isSelected ? null : s.index);
                    }}
                    className={`px-2 py-1 rounded-lg text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : s.covered
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-300'
                    }`}
                  >
                    #{s.index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Exact Scientific Footnote (Section 3 Requirement)
       * ------------------------------------------------------------- */}
      <div className="pt-2.5 border-t border-slate-100 flex items-start gap-2 text-[11.5px] text-slate-500 leading-snug">
        <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
        <span>
          Terrain shows the distribution of dataset images in a 2D projection. Coverage status is determined by actual image-similarity scores, not apparent map distance.
        </span>
      </div>
    </div>
  );
}
