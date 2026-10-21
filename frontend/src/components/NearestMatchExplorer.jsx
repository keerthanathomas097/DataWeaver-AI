import React, { useMemo } from 'react';
import {
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

const formatPct = (val, fallback = '0.0') => {
  if (typeof val === 'number' && !isNaN(val)) {
    return (val * 100).toFixed(1);
  }
  return fallback;
};

export default function NearestMatchExplorer({
  samples = [],
  baseline = { threshold: 0.65, median: 0.75 },
  selectedSampleIndex = null,
  onSelectSample = () => {},
}) {
  const threshold = typeof baseline?.threshold === 'number' ? baseline.threshold : 0.65;

  // Active sample (default to 0 if none selected)
  const activeIndex = selectedSampleIndex !== null ? selectedSampleIndex : 0;
  const activeSample = useMemo(() => {
    return samples.find((s) => s.index === activeIndex) || samples[0] || null;
  }, [samples, activeIndex]);

  if (!samples || samples.length === 0 || !activeSample) {
    return null;
  }

  const nearestMatch =
    activeSample.nearest && activeSample.nearest.length > 0
      ? activeSample.nearest[0]
      : null;

  const sim = typeof activeSample.nearest_similarity === 'number'
    ? activeSample.nearest_similarity
    : nearestMatch?.similarity ?? 0;

  const delta = sim - threshold;
  const isCovered = activeSample.covered;

  // Navigation handlers
  const handlePrev = () => {
    const currentIndex = samples.findIndex((s) => s.index === activeSample.index);
    if (currentIndex > 0) {
      onSelectSample(samples[currentIndex - 1].index);
    } else {
      onSelectSample(samples[samples.length - 1].index);
    }
  };

  const handleNext = () => {
    const currentIndex = samples.findIndex((s) => s.index === activeSample.index);
    if (currentIndex < samples.length - 1) {
      onSelectSample(samples[currentIndex + 1].index);
    } else {
      onSelectSample(samples[0].index);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 font-sans select-none">
      {/* -------------------------------------------------------------
       * Top Bar: Title & Photo Step Controls
       * ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-[15px] text-slate-900 tracking-tight flex items-center gap-2">
              <span>Nearest-Match Explorer</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                Visual Evidence
              </span>
            </h4>
          </div>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Inspect each uploaded real-world photo alongside its closest dataset match and empirical similarity score.
          </p>
        </div>

        {/* Stepper Navigation */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Previous Photo"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[12px] font-bold text-slate-700 px-2 min-w-[90px] text-center">
            Photo #{activeSample.index + 1} of {samples.length}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Next Photo"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
       * Quick Selector Ribbon Strip
       * ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {samples.map((s) => {
          const isSelected = activeSample.index === s.index;
          return (
            <button
              key={s.index}
              onClick={() => onSelectSample(s.index)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : s.covered
                  ? 'bg-emerald-50/80 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-rose-50/80 text-rose-800 border-rose-200 hover:bg-rose-100 ring-1 ring-rose-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isSelected ? 'bg-white' : s.covered ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <span>Photo #{s.index + 1}</span>
              <span className="opacity-70 font-normal">({formatPct(s.nearest_similarity)}%)</span>
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------------
       * Main Comparison Showcase
       * ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
        {/* Left Column: Side-by-Side Images (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Uploaded Photo */}
            <div className="space-y-1.5 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Your Target Photo
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  #{activeSample.index + 1}
                </span>
              </div>
              <div className="aspect-square rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-1.5 shadow-2xs">
                {activeSample.thumbnail_url ? (
                  <img
                    src={activeSample.thumbnail_url}
                    alt="Uploaded photo"
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <Eye size={24} className="text-slate-300" />
                )}
              </div>
              <p className="text-[10.5px] text-slate-400 truncate" title={activeSample.image_path}>
                {activeSample.image_path || 'Real-world target photo'}
              </p>
            </div>

            {/* Closest Dataset Match */}
            <div className="space-y-1.5 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Nearest Dataset Match
                </span>
                <span className="text-[10px] font-bold text-indigo-600">Rank #1 Match</span>
              </div>
              <div className="aspect-square rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-1.5 shadow-2xs">
                {nearestMatch?.image_url ? (
                  <img
                    src={nearestMatch.image_url}
                    alt="Closest dataset match"
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <Eye size={24} className="text-slate-300" />
                )}
              </div>
              <p className="text-[10.5px] text-slate-400 truncate" title={nearestMatch?.image_path}>
                {nearestMatch?.image_path || 'Dataset image'}
              </p>
            </div>
          </div>

          {/* Top 3 Alternative Candidates List */}
          {activeSample.nearest && activeSample.nearest.length > 1 && (
            <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-200/70 space-y-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 block">
                Other Closest Matches in Dataset
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activeSample.nearest.slice(1).map((near, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-1.5 bg-white rounded-xl border border-slate-200/80 shadow-2xs text-[11px]"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {near.image_url ? (
                        <img src={near.image_url} alt="Match" className="w-full h-full object-contain" />
                      ) : (
                        <Eye size={14} className="text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-500">Rank #{idx + 2}</span>
                        <span className="font-bold text-indigo-600 text-[10.5px]">
                          {formatPct(near.similarity)}%
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-400 truncate mt-0.5" title={near.image_path}>
                        {near.image_path}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Quantitative & Qualitative Evidence (5 cols) */}
        <div className="lg:col-span-5 space-y-3.5 flex flex-col justify-between">
          {/* Status Verdict Pill */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between ${
              isCovered
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-rose-50/80 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isCovered ? (
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle size={20} className="text-rose-600 shrink-0" />
              )}
              <div>
                <span className="font-extrabold text-[13px] block leading-tight">
                  {isCovered ? 'Adequately Covered' : 'Potential Domain Gap'}
                </span>
                <span className="text-[11px] opacity-80 block mt-0.5">
                  Nearest similarity: {formatPct(sim)}% (Cutoff: {formatPct(threshold)}%)
                </span>
              </div>
            </div>
            <span
              className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full ${
                delta >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {delta >= 0 ? `+${formatPct(delta)}%` : `${formatPct(delta)}%`}
            </span>
          </div>

          {/* Metric Breakdown Table */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-2 text-[11.5px]">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 block">
              Similarity Evidence
            </span>
            <div className="space-y-1.5 divide-y divide-slate-100">
              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-600">Nearest Cosine Similarity:</span>
                <span className="font-extrabold text-slate-900">{formatPct(sim)}%</span>
              </div>
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-slate-600">Dataset Reference Cutoff:</span>
                <span className="font-bold text-slate-700">{formatPct(threshold)}% (10th percentile)</span>
              </div>
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-slate-600">Criterion Verdict:</span>
                <span className={`font-bold ${isCovered ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isCovered ? 'Meets Reference Baseline' : 'Falls Below Reference Cutoff'}
                </span>
              </div>
            </div>
          </div>

          {/* Plain-English Researcher Takeaway */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5 text-[11.5px] text-slate-600 leading-relaxed">
            <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider">
              Research Takeaway & Next Steps
            </span>
            {isCovered ? (
              <p>
                This photo exhibits high semantic alignment with nearby training examples. The feature representations match typical within-dataset samples.
              </p>
            ) : (
              <div className="space-y-1">
                <p>
                  This photo is visually distant from existing training examples in feature space. Lighting, camera viewpoint, background clutter, or subject variation may be underrepresented.
                </p>
                <p className="text-indigo-700 font-medium">
                  <strong>Recommended action:</strong> Consider collecting 5–10 training examples with similar visual properties to reinforce this segment of the domain.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
