import React, { useState, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sliders,
} from 'lucide-react';

const formatPct = (val, fallback = '0.0') => {
  if (typeof val === 'number' && !isNaN(val)) {
    return (val * 100).toFixed(1);
  }
  return fallback;
};

export default function SimilarityDistributionChart({
  samples = [],
  baseline = { threshold: 0.65, median: 0.75 },
  selectedSampleIndex = null,
  onSelectSample = () => {},
}) {
  const [hoveredSample, setHoveredSample] = useState(null);

  const threshold = typeof baseline?.threshold === 'number' ? baseline.threshold : 0.65;
  const median = typeof baseline?.median === 'number' ? baseline.median : 0.75;

  // Chart dimensions in SVG coordinates
  const width = 860;
  const height = 210;
  const paddingX = 55;
  const axisY = 120;

  // Compute dynamic scale domain [minDomain, maxDomain]
  const { minDomain, maxDomain } = useMemo(() => {
    if (!samples || samples.length === 0) {
      return { minDomain: 0.3, maxDomain: 1.0 };
    }
    const sims = samples
      .map((s) => s.nearest_similarity)
      .filter((v) => typeof v === 'number' && !isNaN(v));

    const minSim = Math.min(...sims, threshold);
    const maxSim = Math.max(...sims, median, 1.0);

    // Give 5% breathing room on the low end, clamp to [0, 1]
    const lower = Math.max(0, Math.floor((minSim - 0.08) * 10) / 10);
    const upper = 1.0;
    return { minDomain: lower, maxDomain: upper };
  }, [samples, threshold, median]);

  // Project similarity [minDomain, maxDomain] -> [paddingX, width - paddingX]
  const getX = (sim) => {
    if (typeof sim !== 'number' || isNaN(sim)) return paddingX;
    const clamped = Math.max(minDomain, Math.min(maxDomain, sim));
    const ratio = (clamped - minDomain) / (maxDomain - minDomain);
    return paddingX + ratio * (width - 2 * paddingX);
  };

  const thresholdX = getX(threshold);
  const medianX = getX(median);

  // Compute vertical lanes / jitter so samples with very similar scores don't overlap awkwardly
  const sampleLayout = useMemo(() => {
    if (!samples) return [];
    // Sort samples by similarity to calculate collision lanes
    const sorted = [...samples].sort(
      (a, b) => (a.nearest_similarity || 0) - (b.nearest_similarity || 0)
    );

    const lanePositions = [0, -22, 22, -42, 42]; // Staggered Y offsets from axisY
    const placed = [];

    sorted.forEach((sample) => {
      const x = getX(sample.nearest_similarity);
      // Find an offset lane that is not too close (< 24px) to recently placed points
      let laneIndex = 0;
      for (let i = placed.length - 1; i >= 0; i--) {
        const prev = placed[i];
        if (Math.abs(prev.x - x) < 22 && prev.laneIndex === laneIndex) {
          laneIndex = (laneIndex + 1) % lanePositions.length;
        }
      }
      placed.push({
        ...sample,
        x,
        y: axisY + lanePositions[laneIndex],
        laneIndex,
      });
    });

    return placed;
  }, [samples, minDomain, maxDomain]);

  // Active sample info
  const activePlaced = useMemo(() => {
    if (selectedSampleIndex === null) return null;
    return sampleLayout.find((s) => s.index === selectedSampleIndex) || null;
  }, [sampleLayout, selectedSampleIndex]);

  // Count summaries
  const coveredCount = samples.filter((s) => s.covered).length;
  const gapCount = samples.filter((s) => !s.covered).length;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 font-sans select-none">
      {/* -------------------------------------------------------------
       * Top Header & Summary Pill
       * ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-[15px] text-slate-900 tracking-tight flex items-center gap-2">
              <span>Similarity Distribution</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Statistical Evidence
              </span>
            </h4>
          </div>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Uploaded images positioned by their exact nearest-neighbour cosine similarity relative to the dataset reference cutoff.
          </p>
        </div>

        {/* Legend Pills */}
        <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span>Covered (≥ {formatPct(threshold)}%) : {coveredCount}</span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span>Potential Gaps (&lt; {formatPct(threshold)}%) : {gapCount}</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Statistical Distribution SVG Chart
       * ------------------------------------------------------------- */}
      <div className="relative bg-slate-50/50 border border-slate-200/80 rounded-2xl p-2 overflow-hidden shadow-xs">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none">
          <defs>
            {/* Pattern for potential gap zone */}
            <linearGradient id="gapZoneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fff1f2" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ffe4e6" stopOpacity="0.3" />
            </linearGradient>

            <linearGradient id="coveredZoneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ecfdf5" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#d1fae5" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* 1. Background Shaded Zones */}
          {/* Below Cutoff: Potential Gap Zone */}
          <rect
            x={paddingX}
            y={24}
            width={Math.max(0, thresholdX - paddingX)}
            height={height - 60}
            fill="url(#gapZoneGrad)"
            rx="8"
          />
          {/* Above Cutoff: Covered Zone */}
          <rect
            x={thresholdX}
            y={24}
            width={Math.max(0, width - paddingX - thresholdX)}
            height={height - 60}
            fill="url(#coveredZoneGrad)"
            rx="8"
          />

          {/* Zone Watermark Labels */}
          <text
            x={paddingX + 12}
            y={42}
            fill="#e11d48"
            fontSize="10"
            fontWeight="bold"
            fontFamily="sans-serif"
            opacity="0.75"
          >
            POTENTIAL DOMAIN GAP REGION (&lt; {formatPct(threshold)}%)
          </text>
          <text
            x={width - paddingX - 12}
            y={42}
            textAnchor="end"
            fill="#059669"
            fontSize="10"
            fontWeight="bold"
            fontFamily="sans-serif"
            opacity="0.75"
          >
            COVERED REGION (≥ {formatPct(threshold)}%)
          </text>

          {/* 2. Main Horizontal Axis Line */}
          <line
            x1={paddingX}
            y1={axisY}
            x2={width - paddingX}
            y2={axisY}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />

          {/* Scale Axis Ticks */}
          {[0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((tick) => {
            if (tick < minDomain || tick > maxDomain) return null;
            const tx = getX(tick);
            return (
              <g key={`tick-${tick}`} transform={`translate(${tx}, ${axisY})`}>
                <line x1="0" y1="-5" x2="0" y2="5" stroke="#94a3b8" strokeWidth="1" />
                <text
                  x="0"
                  y="20"
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="10"
                  fontWeight="600"
                >
                  {(tick * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          {/* 3. Reference Cutoff Vertical Line (Prominent) */}
          <g transform={`translate(${thresholdX}, 0)`}>
            <line
              x1="0"
              y1="24"
              x2="0"
              y2={height - 36}
              stroke="#0f172a"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
            {/* Cutoff Pin Badge at Top */}
            <g transform="translate(0, 18)">
              <rect
                x="-46"
                y="-14"
                width="92"
                height="22"
                rx="6"
                fill="#0f172a"
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))"
              />
              <text
                x="0"
                y="1"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="9.5"
                fontWeight="extrabold"
              >
                Cutoff: {formatPct(threshold)}%
              </text>
            </g>
          </g>

          {/* 4. Dataset Internal Median Vertical Line (Dashed Slate) */}
          {medianX > thresholdX + 30 && (
            <g transform={`translate(${medianX}, 0)`}>
              <line
                x1="0"
                y1="34"
                x2="0"
                y2={height - 36}
                stroke="#64748b"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <text
                x="0"
                y="height - 24"
                textAnchor="middle"
                fill="#475569"
                fontSize="9"
                fontWeight="bold"
              >
                Dataset Median ({formatPct(median)}%)
              </text>
            </g>
          )}

          {/* 5. Plotted Uploaded Photos (Selectable Nodes) */}
          {sampleLayout.map((s) => {
            const isSelected = selectedSampleIndex === s.index;
            const markerColor = s.covered ? '#059669' : '#e11d48';

            return (
              <g
                key={`dist-sample-${s.index}`}
                transform={`translate(${s.x}, ${s.y})`}
                className="cursor-pointer transition-transform duration-150"
                onClick={() => onSelectSample(isSelected ? null : s.index)}
                onMouseEnter={() => setHoveredSample(s)}
                onMouseLeave={() => setHoveredSample(null)}
              >
                {/* Connecting stem line to the horizontal axis */}
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2={axisY - s.y}
                  stroke={markerColor}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.45"
                />

                {/* Active Selection Halo */}
                {isSelected && (
                  <circle
                    r="16"
                    fill={markerColor}
                    fillOpacity="0.15"
                    stroke={markerColor}
                    strokeWidth="1.5"
                  />
                )}

                {/* Outer Ring */}
                <circle
                  r={isSelected ? 10 : 8}
                  fill={markerColor}
                  stroke="#ffffff"
                  strokeWidth="1.8"
                />

                {/* ID Tag Pill */}
                <g transform="translate(0, -11)">
                  <rect
                    x={s.index >= 9 ? '-10' : '-8'}
                    y="-6"
                    width={s.index >= 9 ? '20' : '16'}
                    height="12"
                    rx="3"
                    fill="#ffffff"
                    stroke={markerColor}
                    strokeWidth="0.8"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill="#1e293b"
                    fontSize="8"
                    fontWeight="bold"
                  >
                    #{s.index + 1}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Card */}
        {hoveredSample && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900/95 backdrop-blur-md text-white p-2.5 rounded-xl text-[11px] shadow-xl border border-slate-700/80 max-w-[210px] space-y-1.5 transition-all"
            style={{
              left: Math.min(Math.max(hoveredSample.x - 90, 10), width - 230),
              top: Math.max(hoveredSample.y - 120, 10),
            }}
          >
            <div className="flex items-center justify-between gap-1.5 border-b border-slate-800 pb-1">
              <span className="font-bold text-slate-100">Photo #{hoveredSample.index + 1}</span>
              <span
                className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                  hoveredSample.covered ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {hoveredSample.covered ? 'Covered' : 'Potential Gap'}
              </span>
            </div>
            {hoveredSample.thumbnail_url && (
              <img
                src={hoveredSample.thumbnail_url}
                alt="Thumbnail"
                className="w-full h-16 object-contain bg-black/50 rounded-lg border border-slate-800"
              />
            )}
            <div className="flex items-center justify-between text-slate-300 pt-0.5">
              <span>Similarity:</span>
              <span className="font-bold text-white">
                {formatPct(hoveredSample.nearest_similarity)}%
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              {hoveredSample.nearest_similarity >= threshold
                ? `+${formatPct(hoveredSample.nearest_similarity - threshold)}% above cutoff`
                : `${formatPct(threshold - hoveredSample.nearest_similarity)}% below cutoff`}
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
       * Selected Photo Detail Strip (Linked Readout)
       * ------------------------------------------------------------- */}
      {activePlaced && (
        <div
          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            activePlaced.covered
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/70 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {activePlaced.covered ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle size={18} className="text-rose-600 shrink-0" />
            )}
            <div>
              <span className="font-bold text-[12.5px] block leading-snug">
                Photo #{activePlaced.index + 1}: {formatPct(activePlaced.nearest_similarity)}% Similarity
              </span>
              <span className="text-[11px] opacity-85 block">
                {activePlaced.nearest_similarity >= threshold
                  ? `Exceeds reference cutoff by +${formatPct(activePlaced.nearest_similarity - threshold)}% (Meets Criterion)`
                  : `Falls below reference cutoff by ${formatPct(threshold - activePlaced.nearest_similarity)}% (Potential Domain Gap)`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11.5px] font-semibold text-slate-600">
            <span>Reference Cutoff: {formatPct(threshold)}%</span>
            <span className="text-slate-300">•</span>
            <span>Dataset Median: {formatPct(median)}%</span>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * Scientific Explanation Note
       * ------------------------------------------------------------- */}
      <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-[11.5px] text-slate-500 leading-snug">
        <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <span>
          <strong>Reference Baseline Interpretation:</strong> The reference cutoff ({formatPct(threshold)}%) is derived from the 10th percentile of internal nearest-neighbour similarities among dataset images. It establishes an empirical baseline for typical in-dataset visual proximity, but does not constitute a guaranteed benchmark of downstream classification accuracy.
        </span>
      </div>
    </div>
  );
}
