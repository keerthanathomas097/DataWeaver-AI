import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Eye,
  Target,
  Compass,
} from 'lucide-react';
import {
  NEAR_MISS_MARGIN,
  computeDmax,
  distanceToRadius,
  classifyZone,
  computeSectors,
  layoutPhotoMarkers,
  layoutBaselineDots,
} from '../utils/targetChartGeometry';

const formatPct = (val, fallback = '0.0') => {
  if (typeof val === 'number' && !isNaN(val)) {
    return (val * 100).toFixed(1);
  }
  return fallback;
};

export default function DomainGapTargetChart({
  datasetPoints = [],
  samples = [],
  selectedSampleIndex = null,
  onSelectSample = () => {},
  baselineThreshold = 0.65,
  baselinePoints = [],
  onRecompute = null,
  isComputing = false,
}) {
  const containerRef = useRef(null);
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [showHowToRead, setShowHowToRead] = useState(false);

  // SVG coordinate dimensions
  const width = 640;
  const height = 540;
  const centerX = width / 2; // 320
  const centerY = height / 2; // 270
  const outerRadius = 210;

  const threshold = typeof baselineThreshold === 'number' && !isNaN(baselineThreshold)
    ? baselineThreshold
    : 0.65;

  // 1. Build lookup map from image_path -> class_label
  const pathClassMap = useMemo(() => {
    const map = new Map();
    datasetPoints.forEach((p) => {
      if (p.image_path) {
        map.set(p.image_path, p.class_label || null);
      }
    });
    return map;
  }, [datasetPoints]);

  // 2. Compute dynamic scale dmax
  const dmax = useMemo(() => {
    return computeDmax({
      baselineThreshold: threshold,
      samples,
      baselinePoints,
    });
  }, [threshold, samples, baselinePoints]);

  // 3. Compute class sectors
  const sectors = useMemo(() => {
    return computeSectors(datasetPoints, baselinePoints);
  }, [datasetPoints, baselinePoints]);

  // 4. Compute layout for target photo markers
  const placedMarkers = useMemo(() => {
    return layoutPhotoMarkers({
      samples,
      sectors,
      pathClassMap,
      dmax,
      outerRadius,
      baselineThreshold: threshold,
      centerX,
      centerY,
    });
  }, [samples, sectors, pathClassMap, dmax, outerRadius, threshold, centerX, centerY]);

  // 5. Compute layout for baseline dataset dots
  const baselineDots = useMemo(() => {
    return layoutBaselineDots({
      baselinePoints,
      sectors,
      dmax,
      outerRadius,
      centerX,
      centerY,
    });
  }, [baselinePoints, sectors, dmax, outerRadius, centerX, centerY]);

  // Radii for key concentric rings
  const cutoffRadius = useMemo(() => {
    return distanceToRadius(threshold, dmax, outerRadius);
  }, [threshold, dmax, outerRadius]);

  const nearMissThreshold = Math.max(0, threshold - NEAR_MISS_MARGIN);
  const nearMissRadius = useMemo(() => {
    return Math.min(outerRadius, distanceToRadius(nearMissThreshold, dmax, outerRadius));
  }, [nearMissThreshold, dmax, outerRadius]);

  // Graticule similarity rings (80%, 60%, 40%)
  const graticuleSteps = useMemo(() => {
    const steps = [0.8, 0.6, 0.4];
    return steps
      .map((sim) => ({
        sim,
        label: `${Math.round(sim * 100)}%`,
        radius: distanceToRadius(sim, dmax, outerRadius),
      }))
      .filter((s) => s.radius > 20 && s.radius < outerRadius - 10 && Math.abs(s.radius - cutoffRadius) > 14);
  }, [dmax, outerRadius, cutoffRadius]);

  // Active selected sample
  const activeSample = useMemo(() => {
    if (selectedSampleIndex === null) return null;
    return samples.find((s) => s.index === selectedSampleIndex) || null;
  }, [samples, selectedSampleIndex]);

  // Placed marker for selected photo
  const selectedPlacedMarker = useMemo(() => {
    if (selectedSampleIndex === null) return null;
    return placedMarkers.find((m) => m.index === selectedSampleIndex) || null;
  }, [placedMarkers, selectedSampleIndex]);

  // Counts breakdown
  const zoneCounts = useMemo(() => {
    let covered = 0;
    let nearMiss = 0;
    let farOutside = 0;

    placedMarkers.forEach((m) => {
      if (m.zone === 'covered') covered += 1;
      else if (m.zone === 'near_miss') nearMiss += 1;
      else farOutside += 1;
    });

    return { covered, nearMiss, farOutside, total: placedMarkers.length };
  }, [placedMarkers]);

  // Keyboard shortcut: Escape to deselect
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onSelectSample(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectSample]);

  // Tooltip position calculation (clamped inside chart card)
  const tooltipCoords = useMemo(() => {
    if (!hoveredMarker) return null;
    const cardW = 220;
    const cardH = 150;
    let tx = hoveredMarker.x - cardW / 2;
    let ty = hoveredMarker.y - cardH - 18;

    // Boundary constraints
    if (tx < 12) tx = 12;
    if (tx + cardW > width - 12) tx = width - cardW - 12;
    if (ty < 12) ty = hoveredMarker.y + 24;

    return { x: tx, y: ty };
  }, [hoveredMarker, width]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
      {/* -------------------------------------------------------------
       * CARD HEADER: Title, Purpose, and Legend
       * ------------------------------------------------------------- */}
      <div className="p-5 pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Target size={18} />
            </div>
            <h3 className="font-extrabold text-[16px] text-slate-900 tracking-tight">
              Coverage Target Map
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Similarity Proximity
            </span>
          </div>
          <p className="text-[12.5px] text-slate-500 mt-1">
            Center represents your dataset (100% match). Distance shows how far each deployment photo is from its nearest dataset image.
          </p>
        </div>

        {/* Dedicated Chart Legend */}
        <div className="flex items-center gap-3.5 flex-wrap text-[11.5px] text-slate-600 bg-slate-50/80 px-3.5 py-2 rounded-xl border border-slate-200/60 self-start md:self-auto">
          <div className="flex items-center gap-1.5" title="Dataset image in baseline distribution">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 opacity-60 inline-block" />
            <span className="font-medium">Dataset image</span>
          </div>
          <div className="flex items-center gap-1.5" title="Meets or exceeds similarity cutoff">
            <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block ring-2 ring-white shadow-xs" />
            <span className="font-semibold text-emerald-800">Covered</span>
          </div>
          <div className="flex items-center gap-1.5" title="Within 10% below cutoff">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block ring-2 ring-white shadow-xs" />
            <span className="font-semibold text-amber-800">Near miss</span>
          </div>
          <div className="flex items-center gap-1.5" title="Distant from dataset images">
            <span className="w-3 h-3 rounded-full bg-rose-600 inline-block ring-2 ring-white shadow-xs" />
            <span className="font-semibold text-rose-800">Far outside</span>
          </div>
        </div>
      </div>

      {/* Legacy result notice if baseline_points is missing */}
      {baselinePoints.length === 0 && samples.length > 0 && (
        <div className="bg-amber-50/80 border-b border-amber-200/80 px-5 py-2.5 flex items-center justify-between gap-3 text-[12px] text-amber-900">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-amber-600 shrink-0" />
            <span>
              This result was computed with an older profile. Rings and target photo markers are fully accurate.
            </span>
          </div>
          {onRecompute && (
            <button
              onClick={onRecompute}
              disabled={isComputing}
              className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <RotateCcw size={12} className={isComputing ? 'animate-spin' : ''} />
              <span>Refresh check</span>
            </button>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
       * MAIN CONTENT: Two-Column Layout (Target Chart + Evidence Inspection Panel)
       * ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left Column: Target Bullseye Chart (lg:col-span-8) */}
        <div className="lg:col-span-8 p-4 lg:p-6 flex flex-col items-center justify-center relative select-none bg-gradient-to-b from-slate-50/60 via-white to-slate-50/40">
          <div ref={containerRef} className="relative w-full max-w-[640px] aspect-[640/540]">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-full overflow-visible drop-shadow-xs"
              role="img"
              aria-label="Coverage Target Chart showing deployment photos proximity to dataset"
            >
              <title>Coverage Target Bullseye Chart</title>
              <desc>
                High-precision concentric bullseye chart showing semantic feature proximity.
                Center is dataset (100%). Inner green ring is covered zone, middle amber band is near miss, outer rose band is far outside.
              </desc>

              {/* Rich Visual Definitions: Gradients, Glows, and Drop Shadows */}
              <defs>
                {/* Marker Drop Shadow */}
                <filter id="marker-shadow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.28" />
                </filter>
                <filter id="cutoff-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#10b981" floodOpacity="0.45" />
                </filter>
                <filter id="pill-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.16" />
                </filter>
                <filter id="center-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#2563eb" floodOpacity="0.6" />
                </filter>

                {/* Concentric Zone Radial Gradients */}
                <radialGradient id="grad-covered" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ecfdf5" stopOpacity="0.95" />
                  <stop offset="70%" stopColor="#d1fae5" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#a7f3d0" stopOpacity="0.75" />
                </radialGradient>
                <radialGradient id="grad-nearmiss" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.95" />
                  <stop offset="75%" stopColor="#fef3c7" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#fde68a" stopOpacity="0.75" />
                </radialGradient>
                <radialGradient id="grad-faroutside" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fff1f2" stopOpacity="0.95" />
                  <stop offset="80%" stopColor="#ffe4e6" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#fecdd3" stopOpacity="0.75" />
                </radialGradient>

                {/* Center Core Glow */}
                <radialGradient id="center-core-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                  <stop offset="40%" stopColor="#2563eb" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                </radialGradient>

                {/* Photo Marker Gradients (Glossy High-End Dimension) */}
                <linearGradient id="marker-grad-covered" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <linearGradient id="marker-grad-nearmiss" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
                <linearGradient id="marker-grad-faroutside" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#be123c" />
                </linearGradient>

                {/* Radial Guide Line Gradient */}
                <linearGradient id="guide-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>

              {/* ---------------------------------------------------------
               * 0. Subtle Polar Grid Crosshairs
               * --------------------------------------------------------- */}
              <g className="polar-axes pointer-events-none opacity-40">
                {/* Horizontal axis (excluding corridors) */}
                <line
                  x1={centerX - outerRadius - 10}
                  y1={centerY}
                  x2={centerX - 24}
                  y2={centerY}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <line
                  x1={centerX + 24}
                  y1={centerY}
                  x2={centerX + outerRadius + 10}
                  y2={centerY}
                  stroke="#cbd5e1"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              </g>

              {/* ---------------------------------------------------------
               * 1. Concentric Zone Fills (Outermost drawn first)
               * --------------------------------------------------------- */}
              {/* Outer boundary fill (Far Outside Zone) */}
              <circle
                cx={centerX}
                cy={centerY}
                r={outerRadius}
                fill="url(#grad-faroutside)"
                stroke="#fb7185"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                strokeOpacity="0.6"
              />

              {/* Near Miss Zone fill */}
              {nearMissRadius > cutoffRadius && (
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={nearMissRadius}
                  fill="url(#grad-nearmiss)"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                  strokeOpacity="0.8"
                />
              )}

              {/* Covered Zone fill */}
              <circle
                cx={centerX}
                cy={centerY}
                r={cutoffRadius}
                fill="url(#grad-covered)"
              />

              {/* Cutoff Glow Under-ring */}
              <circle
                cx={centerX}
                cy={centerY}
                r={cutoffRadius}
                fill="none"
                stroke="#10b981"
                strokeWidth="6"
                strokeOpacity="0.25"
                filter="url(#cutoff-glow)"
              />

              {/* Sharp Cutoff Dashed Ring */}
              <circle
                cx={centerX}
                cy={centerY}
                r={cutoffRadius}
                fill="none"
                stroke="#047857"
                strokeWidth="2.4"
                strokeDasharray="6 3.5"
              />

              {/* Center Atmosphere Glow */}
              <circle cx={centerX} cy={centerY} r={cutoffRadius * 0.65} fill="url(#center-core-glow)" />

              {/* ---------------------------------------------------------
               * 2. Graticule Rings (20-point steps: e.g. 80%, 60%, 40%)
               * --------------------------------------------------------- */}
              {graticuleSteps.map((step) => (
                <g key={step.sim}>
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={step.radius}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="0.85"
                    strokeDasharray="2 4"
                    opacity="0.6"
                  />
                  {/* Top corridor label badge */}
                  <g transform={`translate(${centerX}, ${centerY - step.radius})`}>
                    <rect
                      x="-14"
                      y="-7"
                      width="28"
                      height="14"
                      rx="7"
                      fill="#ffffff"
                      fillOpacity="0.9"
                      stroke="#cbd5e1"
                      strokeWidth="0.8"
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="9"
                      fontWeight="bold"
                    >
                      {step.label}
                    </text>
                  </g>
                </g>
              ))}

              {/* ---------------------------------------------------------
               * 3. Cutoff Ring Pill Label in Top Corridor
               * --------------------------------------------------------- */}
              <g
                transform={`translate(${centerX}, ${centerY - cutoffRadius})`}
                filter="url(#pill-shadow)"
                className="select-none"
              >
                <rect
                  x="-48"
                  y="-20"
                  width="96"
                  height="20"
                  rx="10"
                  fill="#047857"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {/* Small indicator dot */}
                <circle cx="-38" cy="-10" r="3.2" fill="#34d399" />
                <text
                  x="4"
                  y="-6"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="800"
                  letterSpacing="0.03em"
                >
                  CUTOFF {formatPct(threshold)}%
                </text>
              </g>

              {/* ---------------------------------------------------------
               * 4. Highlighted Zone Badges in Bottom Corridor (Vertical Axis)
               * --------------------------------------------------------- */}
              <g className="select-none pointer-events-none">
                {/* Covered band badge */}
                <g transform={`translate(${centerX}, ${centerY + cutoffRadius * 0.62})`}>
                  <rect
                    x="-62"
                    y="-9"
                    width="124"
                    height="18"
                    rx="9"
                    fill="#ffffff"
                    fillOpacity="0.95"
                    stroke="#10b981"
                    strokeWidth="1.2"
                    filter="url(#pill-shadow)"
                  />
                  <circle cx="-50" cy="0" r="2.8" fill="#10b981" />
                  <text
                    x="5"
                    y="3.5"
                    textAnchor="middle"
                    fill="#065f46"
                    fontSize="9.5"
                    fontWeight="800"
                  >
                    Covered ≥ {formatPct(threshold)}%
                  </text>
                </g>

                {/* Near miss band badge */}
                {nearMissRadius - cutoffRadius > 14 && (
                  <g transform={`translate(${centerX}, ${centerY + (cutoffRadius + nearMissRadius) / 2})`}>
                    <rect
                      x="-65"
                      y="-9"
                      width="130"
                      height="18"
                      rx="9"
                      fill="#ffffff"
                      fillOpacity="0.95"
                      stroke="#f59e0b"
                      strokeWidth="1.2"
                      filter="url(#pill-shadow)"
                    />
                    <circle cx="-53" cy="0" r="2.8" fill="#f59e0b" />
                    <text
                      x="5"
                      y="3.5"
                      textAnchor="middle"
                      fill="#92400e"
                      fontSize="9.5"
                      fontWeight="800"
                    >
                      Near miss {Math.round(nearMissThreshold * 100)}–{Math.round(threshold * 100)}%
                    </text>
                  </g>
                )}

                {/* Far outside band badge */}
                {outerRadius - nearMissRadius > 14 && (
                  <g transform={`translate(${centerX}, ${centerY + (nearMissRadius + outerRadius) / 2})`}>
                    <rect
                      x="-64"
                      y="-9"
                      width="128"
                      height="18"
                      rx="9"
                      fill="#ffffff"
                      fillOpacity="0.95"
                      stroke="#f43f5e"
                      strokeWidth="1.2"
                      filter="url(#pill-shadow)"
                    />
                    <circle cx="-52" cy="0" r="2.8" fill="#f43f5e" />
                    <text
                      x="5"
                      y="3.5"
                      textAnchor="middle"
                      fill="#9f1239"
                      fontSize="9.5"
                      fontWeight="800"
                    >
                      Far outside &lt; {Math.round(nearMissThreshold * 100)}%
                    </text>
                  </g>
                )}
              </g>

              {/* ---------------------------------------------------------
               * 5. Enhanced Sector Divider Arcs & Class Badges
               * --------------------------------------------------------- */}
              {sectors.map((sec, secIdx) => {
                const startRad = (sec.startAngle * Math.PI) / 180;
                const endRad = (sec.endAngle * Math.PI) / 180;
                const midRad = (sec.midAngle * Math.PI) / 180;

                // Sector accent colors
                const sectorColor = secIdx === 0 ? '#2563eb' : secIdx === 1 ? '#7c3aed' : '#0891b2';

                // Pill position outside outer ring
                const pillR = outerRadius + 26;
                const pillX = centerX + pillR * Math.cos(midRad);
                const pillY = centerY + pillR * Math.sin(midRad);

                // Arc path along outer perimeter
                const rArc = outerRadius + 2;
                const arcX1 = centerX + rArc * Math.cos(startRad);
                const arcY1 = centerY + rArc * Math.sin(startRad);
                const arcX2 = centerX + rArc * Math.cos(endRad);
                const arcY2 = centerY + rArc * Math.sin(endRad);

                return (
                  <g key={sec.className}>
                    {/* Sector radial bounds */}
                    <line
                      x1={centerX + (cutoffRadius * 0.35) * Math.cos(startRad)}
                      y1={centerY + (cutoffRadius * 0.35) * Math.sin(startRad)}
                      x2={centerX + outerRadius * Math.cos(startRad)}
                      y2={centerY + outerRadius * Math.sin(startRad)}
                      stroke="#94a3b8"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                      opacity="0.6"
                    />

                    {/* Outer Perimeter Highlight Arc */}
                    <path
                      d={`M ${arcX1} ${arcY1} A ${rArc} ${rArc} 0 0 1 ${arcX2} ${arcY2}`}
                      fill="none"
                      stroke={sectorColor}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      opacity="0.8"
                    />

                    {/* Class label pill badge */}
                    <g transform={`translate(${pillX}, ${pillY})`} filter="url(#pill-shadow)">
                      <rect
                        x="-48"
                        y="-12"
                        width="96"
                        height="24"
                        rx="12"
                        fill="#ffffff"
                        stroke={sectorColor}
                        strokeWidth="1.6"
                      />
                      {/* Class color dot */}
                      <circle cx="-36" cy="0" r="3.5" fill={sectorColor} />
                      <text
                        x="3"
                        y="4"
                        textAnchor="middle"
                        fill="#0f172a"
                        fontSize="10.5"
                        fontWeight="800"
                      >
                        {sec.className.length > 8 ? sec.className.slice(0, 7) + '…' : sec.className}
                        <tspan fill="#64748b" fontWeight="600" fontSize="9.5"> ({sec.count})</tspan>
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* ---------------------------------------------------------
               * 6. Baseline Dataset Dots (Muted with subtle glow)
               * --------------------------------------------------------- */}
              <g className="dataset-dots">
                {baselineDots.map((dot) => (
                  <circle
                    key={dot.index}
                    cx={dot.x}
                    cy={dot.y}
                    r="2.5"
                    fill="#64748b"
                    opacity="0.5"
                    className="hover:opacity-100 hover:scale-150 transition-all duration-150"
                  >
                    <title>
                      Dataset image ({dot.class_label || 'unlabelled'}): {formatPct(dot.similarity)}% baseline similarity
                    </title>
                  </circle>
                ))}
              </g>

              {/* ---------------------------------------------------------
               * 7. Center Bullseye Focal Core (100% Dataset Core)
               * --------------------------------------------------------- */}
              <g transform={`translate(${centerX}, ${centerY})`} className="cursor-help">
                {/* Outer concentric ripple */}
                <circle
                  cx="0"
                  cy="0"
                  r="18"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="1.2"
                  strokeDasharray="2 3"
                  opacity="0.5"
                />
                {/* Middle ring */}
                <circle
                  cx="0"
                  cy="0"
                  r="10"
                  fill="#dbeafe"
                  stroke="#2563eb"
                  strokeWidth="1.8"
                  filter="url(#center-shadow)"
                />
                {/* Core electric bullseye */}
                <circle cx="0" cy="0" r="4.5" fill="#1d4ed8" />
                <circle cx="0" cy="0" r="1.6" fill="#ffffff" />
                <title>Dataset Focal Center: 100% Identical Visual Match</title>
              </g>

              {/* ---------------------------------------------------------
               * 8. Selected Photo Radial Guide & Score Badge
               * --------------------------------------------------------- */}
              {selectedPlacedMarker && (
                <g className="guide-ray">
                  {/* Glowing line from center to marker */}
                  <line
                    x1={centerX}
                    y1={centerY}
                    x2={selectedPlacedMarker.x}
                    y2={selectedPlacedMarker.y}
                    stroke="url(#guide-grad)"
                    strokeWidth="2.2"
                    strokeDasharray="4 3"
                    opacity="0.9"
                  />
                  {/* Score pill along the radial line */}
                  <g
                    transform={`translate(${
                      (centerX + selectedPlacedMarker.x) / 2
                    }, ${
                      (centerY + selectedPlacedMarker.y) / 2
                    })`}
                    filter="url(#pill-shadow)"
                  >
                    <rect
                      x="-22"
                      y="-11"
                      width="44"
                      height="22"
                      rx="11"
                      fill="#0f172a"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="10"
                      fontWeight="900"
                      letterSpacing="0.02em"
                    >
                      {formatPct(selectedPlacedMarker.similarity)}%
                    </text>
                  </g>
                </g>
              )}

              {/* ---------------------------------------------------------
               * 9. Glossy, Dimensional Photo Markers (Hero Elements)
               * --------------------------------------------------------- */}
              <g className="photo-markers">
                {placedMarkers.map((marker) => {
                  const isSelected = selectedSampleIndex === marker.index;
                  const isHovered = hoveredMarker?.index === marker.index;

                  let fillGrad = 'url(#marker-grad-covered)';
                  let ringColor = '#10b981';
                  if (marker.zone === 'near_miss') {
                    fillGrad = 'url(#marker-grad-nearmiss)';
                    ringColor = '#f59e0b';
                  } else if (marker.zone === 'far_outside') {
                    fillGrad = 'url(#marker-grad-faroutside)';
                    ringColor = '#f43f5e';
                  }

                  const radius = isSelected ? 15.5 : isHovered ? 15 : 13.5;

                  return (
                    <g
                      key={marker.index}
                      transform={`translate(${marker.x}, ${marker.y})`}
                      tabIndex="0"
                      role="button"
                      aria-label={`Photo ${marker.index + 1}, ${formatPct(marker.similarity)} percent similar, ${marker.zone.replace('_', ' ')}`}
                      className="cursor-pointer focus:outline-hidden transition-all duration-200"
                      onClick={() => onSelectSample(isSelected ? null : marker.index)}
                      onMouseEnter={() => setHoveredMarker(marker)}
                      onMouseLeave={() => setHoveredMarker(null)}
                      onFocus={() => setHoveredMarker(marker)}
                      onBlur={() => setHoveredMarker(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectSample(isSelected ? null : marker.index);
                        }
                      }}
                    >
                      {/* Selected marker: Dual animated neon aura */}
                      {isSelected && (
                        <>
                          <circle
                            cx="0"
                            cy="0"
                            r="22"
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="2.5"
                            strokeOpacity="0.75"
                            className="animate-ping"
                          />
                          <circle
                            cx="0"
                            cy="0"
                            r="20"
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2.2"
                            strokeDasharray="4 2"
                            className="animate-spin origin-center"
                            style={{ animationDuration: '8s' }}
                          />
                        </>
                      )}

                      {/* Main glossy spherical marker */}
                      <circle
                        cx="0"
                        cy="0"
                        r={radius}
                        fill={fillGrad}
                        stroke="#ffffff"
                        strokeWidth="2.6"
                        filter="url(#marker-shadow)"
                        className="transition-all duration-200"
                      />

                      {/* Highlight crescent on top edge */}
                      <path
                        d={`M ${-radius * 0.65} ${-radius * 0.35} A ${radius * 0.75} ${radius * 0.75} 0 0 1 ${radius * 0.65} ${-radius * 0.35}`}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="1.2"
                        strokeOpacity="0.5"
                        strokeLinecap="round"
                        pointerEvents="none"
                      />

                      {/* Photo number inside */}
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={marker.index + 1 > 99 ? '9' : '10.5'}
                        fontWeight="900"
                        pointerEvents="none"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                      >
                        {marker.index + 1}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Hover Tooltip Card (Rendered via HTML/DOM inside container) */}
            {hoveredMarker && tooltipCoords && (
              <div
                className="absolute z-30 pointer-events-none bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl text-[11px] shadow-2xl border border-slate-700/80 w-[220px] space-y-2 transition-all duration-150 animate-in fade-in-50 zoom-in-95"
                style={{
                  left: tooltipCoords.x,
                  top: tooltipCoords.y,
                }}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-blue-500/30" />
                    <span className="font-extrabold text-slate-100 text-[13px]">
                      Photo #{hoveredMarker.index + 1}
                    </span>
                  </div>
                  <span
                    className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-md ${
                      hoveredMarker.zone === 'covered'
                        ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50'
                        : hoveredMarker.zone === 'near_miss'
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                        : 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                    }`}
                  >
                    {hoveredMarker.zone.replace('_', ' ')}
                  </span>
                </div>

                {hoveredMarker.sample.thumbnail_url && (
                  <div className="w-full h-24 bg-black/70 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-1 shadow-inner">
                    <img
                      src={hoveredMarker.sample.thumbnail_url}
                      alt={`Photo ${hoveredMarker.index + 1}`}
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                )}

                <div className="space-y-1 pt-0.5">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-medium text-slate-400">Similarity Score:</span>
                    <span className="font-extrabold text-white text-[13px]">
                      {formatPct(hoveredMarker.similarity)}%
                    </span>
                  </div>

                  <div className="text-[10px] font-semibold flex items-center justify-between">
                    <span className="text-slate-400">Margin to Cutoff:</span>
                    <span
                      className={
                        hoveredMarker.similarity >= threshold
                          ? 'text-emerald-400 font-bold'
                          : 'text-rose-400 font-bold'
                      }
                    >
                      {hoveredMarker.similarity >= threshold
                        ? `+${formatPct(hoveredMarker.similarity - threshold)}% above`
                        : `-${formatPct(threshold - hoveredMarker.similarity)}% below`}
                    </span>
                  </div>

                  {hoveredMarker.nearestClass && (
                    <div className="text-[10px] text-slate-400 border-t border-slate-800 pt-1.5 flex items-center justify-between">
                      <span>Closest Class:</span>
                      <span className="text-blue-300 font-bold">{hoveredMarker.nearestClass}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Stat Capsules directly under chart */}
          <div className="flex items-center gap-2.5 mt-5 text-[12px] font-bold flex-wrap justify-center">
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300/80 shadow-2xs hover:shadow-xs transition-shadow">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>{zoneCounts.covered} Covered</span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-300/80 shadow-2xs hover:shadow-xs transition-shadow">
              <AlertTriangle size={14} className="text-amber-600" />
              <span>{zoneCounts.nearMiss} Near Miss</span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-300/80 shadow-2xs hover:shadow-xs transition-shadow">
              <AlertOctagon size={14} className="text-rose-600" />
              <span>{zoneCounts.farOutside} Far Outside</span>
            </div>
          </div>
        </div>

        {/* Right Column: Evidence Inspection Side Panel (lg:col-span-4) */}
        <div className="lg:col-span-4 bg-[#faf9f6] border-t lg:border-t-0 lg:border-l border-[#e5e2dc] p-5 flex flex-col justify-between space-y-4">
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
                      Evidence & Nearest Dataset Match
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
                      {threshold !== null && ` vs ${formatPct(threshold)}% cutoff`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Score Margin Card */}
              <div className="bg-white p-3.5 rounded-xl border border-[#e5e2dc] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-semibold">Empirical Score Margin</span>
                  {activeSample.nearest_similarity !== null && threshold !== null && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold ${
                        activeSample.covered
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {activeSample.nearest_similarity >= threshold
                        ? `+${formatPct(activeSample.nearest_similarity - threshold)}% margin`
                        : `-${formatPct(threshold - activeSample.nearest_similarity)}% margin`}
                    </span>
                  )}
                </div>

                {threshold !== null && (
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/70">
                      <div
                        className={`h-full transition-all duration-300 ${
                          activeSample.covered ? 'bg-emerald-600' : 'bg-rose-500'
                        }`}
                        style={{
                          width: `${Math.min((activeSample.nearest_similarity || 0) * 100, 100)}%`,
                        }}
                      />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900 z-10"
                        style={{ left: `${threshold * 100}%` }}
                        title={`Baseline Cutoff: ${formatPct(threshold)}%`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                      <span>0%</span>
                      <span className="text-slate-800 font-bold">
                        Cutoff: {formatPct(threshold)}%
                      </span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Side-by-Side Comparison */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Visual Evidence Comparison
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Left: Target Photo */}
                  <div className="space-y-1">
                    <span
                      className="text-[10.5px] font-semibold text-slate-600 block truncate"
                      title={activeSample.image_path}
                    >
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
                      <span
                        className="text-[9.5px] text-slate-400 truncate block text-center"
                        title={activeSample.image_path}
                      >
                        {activeSample.image_path.split('/').pop()}
                      </span>
                    )}
                  </div>

                  {/* Right: Closest Dataset Match */}
                  <div className="space-y-1">
                    <span
                      className="text-[10.5px] font-semibold text-slate-600 block truncate"
                      title={activeSample.nearest?.[0]?.image_path}
                    >
                      Nearest Dataset Match
                    </span>
                    <div className="aspect-square rounded-xl bg-white border border-[#e2dfd7] overflow-hidden flex items-center justify-center p-1 shadow-2xs">
                      {activeSample.nearest &&
                      activeSample.nearest.length > 0 &&
                      activeSample.nearest[0].image_url ? (
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
                      <span
                        className="text-[9.5px] text-slate-400 truncate block text-center"
                        title={activeSample.nearest[0].image_path}
                      >
                        {activeSample.nearest[0].image_path.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Top 3 Nearest Matches */}
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
                            <span className="font-bold text-indigo-600">{formatPct(near.similarity)}%</span>
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
          ) : (
            /* Empty selection state */
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-2.5 text-slate-400 my-auto">
              <div className="w-11 h-11 rounded-2xl bg-[#f0f4ff] text-[#2563eb] flex items-center justify-center">
                <Compass size={22} />
              </div>
              <h5 className="font-extrabold text-[13.5px] text-slate-800">
                Select a Target Photo on the Chart
              </h5>
              <p className="text-[11.5px] text-slate-500 leading-relaxed max-w-[260px]">
                Click any numbered photo marker on the bullseye target or choose one from the list below to inspect its closest dataset match and empirical similarity score.
              </p>
            </div>
          )}

          {/* Quick Photo Jumper Strip */}
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
                    onClick={() => onSelectSample(isSelected ? null : s.index)}
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
       * CARD FOOTER: Clear Caption & Collapsible Explainer
       * ------------------------------------------------------------- */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2.5 text-[12px] text-slate-600">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="leading-relaxed">
            <strong>Chart meaning:</strong> Distance from the centre shows how far each photo is from its closest dataset image. Rings show what is normal for this dataset's own images.
          </p>
          <button
            onClick={() => setShowHowToRead(!showHowToRead)}
            className="flex items-center gap-1 text-[11.5px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer self-start sm:self-auto shrink-0 transition-colors"
          >
            <span>How to read this chart</span>
            {showHowToRead ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Collapsible Explainer */}
        {showHowToRead && (
          <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 space-y-2 text-[11.5px] leading-relaxed animate-in fade-in-50 duration-150">
            <ul className="space-y-1.5 list-disc list-inside text-slate-600">
              <li>
                <strong className="text-slate-800">Centre = dataset:</strong> The center dot represents 100% identical similarity to a dataset image. Markers closer to the center have closer visual matches.
              </li>
              <li>
                <strong className="text-slate-800">Rings = how close counts as covered:</strong> The green dashed ring marks the dataset baseline cutoff. Photos inside this ring are covered; photos in the amber ring are near misses; photos beyond are far outside.
              </li>
              <li>
                <strong className="text-slate-800">Side = nearest class:</strong> The angle around the center indicates which dataset category or class was the closest match to each photo.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
