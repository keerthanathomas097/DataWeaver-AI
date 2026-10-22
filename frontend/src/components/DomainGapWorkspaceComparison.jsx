import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Trophy,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  ExternalLink,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Maximize2,
  Grid,
  BarChart2,
  HelpCircle,
  X,
} from 'lucide-react';
import {
  triggerWorkspaceDomainGapCompare,
  getWorkspaceDomainGapCompare,
} from '../api/domainGapCompareApi';

/**
 * Renders a lightweight SVG Bullseye Target Chart for a single dataset.
 * Highlights the shared reference cutoff circle and places sample photo points radially.
 */
function MiniBullseyeTarget({ dataset, referenceCutoff, nearMissMargin = 0.10, isReference = false }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 12;

  const refThreshold = typeof referenceCutoff === 'number' ? referenceCutoff : 0.70;
  const nearMissThreshold = Math.max(0.1, refThreshold - nearMissMargin);

  // Radial mapping: similarity 1.0 -> r = 0, similarity 0.0 -> r = maxR
  // r(sim) = maxR * (1 - sim) / (1 - 0.40) clamped
  const minSimDomain = 0.40;
  const getRadius = (sim) => {
    const clamped = Math.max(minSimDomain, Math.min(1.0, sim));
    const normalized = (1.0 - clamped) / (1.0 - minSimDomain);
    return Math.max(4, normalized * maxR);
  };

  const refR = getRadius(refThreshold);
  const nearR = getRadius(nearMissThreshold);

  const photos = dataset?.per_photo || [];

  return (
    <div className={`p-3 bg-[#FCFAF6] rounded-xl border ${isReference ? 'border-[#24543D] ring-2 ring-[#24543D]/20 shadow-xs' : 'border-[#D5DCD1]'} flex flex-col items-center transition-all hover:border-[#24543D]/60`}>
      <div className="w-full flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-[#202923] truncate max-w-[110px]" title={dataset?.dataset_name}>
          {dataset?.dataset_name}
        </span>
        <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-[#E7EAE4] text-[#24543D]">
          Rank #{dataset?.rank}
        </span>
      </div>
      <svg width={size} height={size} className="overflow-visible my-1">
        {/* Background far zone */}
        <circle cx={cx} cy={cy} r={maxR} fill="#fef2f2" stroke="#fecaca" strokeWidth="1" />
        {/* Near-miss zone */}
        <circle cx={cx} cy={cy} r={nearR} fill="#fffbeb" stroke="#fde68a" strokeWidth="1" />
        {/* Covered zone inside reference cutoff */}
        <circle cx={cx} cy={cy} r={refR} fill="#ecfdf5" stroke="#a7f3d0" strokeWidth="1.5" />

        {/* Reference cutoff ring dashed outline */}
        <circle
          cx={cx}
          cy={cy}
          r={refR}
          fill="none"
          stroke="#059669"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />

        {/* Center dataset core mark */}
        <circle cx={cx} cy={cy} r={3} fill="#0f172a" />

        {/* Photos plotted radially */}
        {photos.map((p, idx) => {
          const sim = p.similarity ?? 0;
          const r = getRadius(sim);
          // Distribute angles evenly with golden ratio dispersion
          const angle = (idx * 137.5 * Math.PI) / 180;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);

          const isCov = sim >= refThreshold;
          const isNear = !isCov && sim >= nearMissThreshold;

          const dotColor = isCov ? '#10b981' : isNear ? '#f59e0b' : '#ef4444';
          const strokeColor = isCov ? '#047857' : isNear ? '#b45309' : '#b91c1c';

          return (
            <circle
              key={idx}
              cx={px}
              cy={py}
              r={3}
              fill={dotColor}
              stroke={strokeColor}
              strokeWidth="0.75"
              className="transition-transform hover:scale-150 cursor-pointer"
            >
              <title>{`Photo #${p.sample_index + 1}: similarity ${sim.toFixed(3)} (${isCov ? 'Covered' : isNear ? 'Near-miss' : 'Far'})`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="w-full flex items-center justify-between text-[11px] text-slate-500 mt-1 pt-1 border-t border-slate-100">
        <span>Coverage: <strong className="text-slate-700">{dataset?.coverage_pct}%</strong></span>
        <span>Median: <strong className="text-slate-700">{dataset?.median_similarity?.toFixed(2)}</strong></span>
      </div>
    </div>
  );
}

export default function DomainGapWorkspaceComparison({
  workspaceId,
  sampleSetId,
  initialReferenceDatasetId,
  onBack,
  onSelectDataset,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRecomputing, setIsRecomputing] = useState(false);

  // Local interactive slider reference cutoff
  const [localReference, setLocalReference] = useState(null);

  // Inspector modal/drawer for selected photo
  const [inspectedPhotoIndex, setInspectedPhotoIndex] = useState(null);

  // Active view tab: 'table' | 'heatmap' | 'targets'
  const [activeTab, setActiveTab] = useState('table');

  // Toggle for ineligible datasets drawer
  const [showIneligible, setShowIneligible] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  // Load comparison data from backend
  const fetchComparison = async (force = false) => {
    if (!workspaceId || !sampleSetId) return;
    try {
      if (force) setIsRecomputing(true);
      else setLoading(true);
      setError(null);

      const res = await triggerWorkspaceDomainGapCompare(
        workspaceId,
        sampleSetId,
        localReference,
        force
      );
      setData(res);
      if (localReference === null && res.default_reference) {
        setLocalReference(res.default_reference);
      }
    } catch (err) {
      console.error('Failed to load workspace domain gap comparison:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load comparison data');
    } finally {
      setLoading(false);
      setIsRecomputing(false);
    }
  };

  useEffect(() => {
    fetchComparison(false);
  }, [workspaceId, sampleSetId]);

  // Client-side live recalculation when slider moves
  const computedState = useMemo(() => {
    if (!data) return null;

    const refCutoff = localReference !== null ? localReference : data.reference_similarity;
    const margin = data.near_miss_margin ?? 0.10;
    const nearThreshold = Math.round((refCutoff - margin) * 1000) / 1000;
    const totalPhotos = data.sample_count || (data.sample_photos ? data.sample_photos.length : 1);

    // Recompute metrics for each dataset locally
    const datasets = (data.ranked_datasets || []).map((ds) => {
      const perPhoto = ds.per_photo || [];
      const sims = perPhoto.map((p) => p.similarity ?? 0.0);

      const covCount = sims.filter((s) => s >= refCutoff).length;
      const nearCount = sims.filter((s) => s >= nearThreshold && s < refCutoff).length;
      const farCount = sims.filter((s) => s < nearThreshold).length;

      const covPct = totalPhotos ? Math.round((1000 * covCount) / totalPhotos) / 10 : 0;
      const nearPct = totalPhotos ? Math.round((1000 * nearCount) / totalPhotos) / 10 : 0;
      const farPct = totalPhotos ? Math.round((1000 * farCount) / totalPhotos) / 10 : 0;

      return {
        ...ds,
        covered_count: covCount,
        near_miss_count: nearCount,
        far_count: farCount,
        coverage_pct: covPct,
        near_miss_pct: nearPct,
        far_pct: farPct,
      };
    });

    // Re-rank based on median_similarity DESC, then covered_count DESC
    datasets.sort((a, b) => {
      if (b.median_similarity !== a.median_similarity) {
        return b.median_similarity - a.median_similarity;
      }
      if (b.covered_count !== a.covered_count) {
        return b.covered_count - a.covered_count;
      }
      return (a.dataset_name || '').localeCompare(b.dataset_name || '');
    });

    datasets.forEach((d, idx) => {
      d.rank = idx + 1;
    });

    // Recompute greedy combined coverage
    const combined = [];
    if (datasets.length > 0 && totalPhotos > 0) {
      const uncovered = new Set(Array.from({ length: totalPhotos }, (_, i) => i));
      const cumulative = new Set();
      const pool = [...datasets];

      for (let step = 1; step <= Math.min(3, datasets.length); step++) {
        let bestDs = null;
        let bestNew = new Set();

        for (const cand of pool) {
          const newlyCovered = new Set(
            (cand.per_photo || [])
              .filter((p) => uncovered.has(p.sample_index) && p.similarity >= refCutoff)
              .map((p) => p.sample_index)
          );
          if (newlyCovered.size > bestNew.size) {
            bestNew = newlyCovered;
            bestDs = cand;
          }
        }

        if (!bestDs || (step > 1 && bestNew.size === 0)) break;

        bestNew.forEach((idx) => {
          cumulative.add(idx);
          uncovered.delete(idx);
        });
        pool.splice(pool.indexOf(bestDs), 1);

        combined.push({
          step,
          dataset_id: bestDs.dataset_id,
          dataset_name: bestDs.dataset_name,
          newly_covered_count: bestNew.size,
          cumulative_covered_count: cumulative.size,
          cumulative_coverage_pct: Math.round((1000 * cumulative.size) / totalPhotos) / 10,
        });
      }
    }

    const best = datasets[0] || null;
    const runnerUp = datasets[1] || null;
    let summarySentence = best
      ? `${best.dataset_name} provides the strongest coverage for your real-world photos (${best.coverage_pct}% covered at reference cutoff ${refCutoff.toFixed(2)}, median similarity ${best.median_similarity.toFixed(2)}).`
      : 'No eligible datasets available for workspace domain gap comparison.';

    if (best && runnerUp) {
      summarySentence += ` ${runnerUp.dataset_name} is the closest alternative with ${runnerUp.coverage_pct}% coverage.`;
    }

    return {
      referenceCutoff: refCutoff,
      nearMissThreshold: nearThreshold,
      datasets,
      combined,
      bestMatch: best,
      summarySentence,
    };
  }, [data, localReference]);

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center space-y-4">
        <RefreshCw size={32} className="text-indigo-600 animate-spin" />
        <div className="text-center">
          <p className="text-[15px] font-bold text-slate-800">Comparing Workspace Datasets...</p>
          <p className="text-[12.5px] text-slate-500 mt-1">
            Evaluating real-world deployment photos across all eligible candidate datasets.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white border border-rose-200 rounded-2xl shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertOctagon size={24} />
        </div>
        <h3 className="font-extrabold text-[18px] text-slate-800">Workspace Comparison Failed</h3>
        <p className="text-[13px] text-slate-600">{error}</p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => fetchComparison(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[12.5px] font-bold cursor-pointer transition-colors"
          >
            Retry Comparison
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[12.5px] font-bold cursor-pointer transition-colors"
          >
            Back to Single Assessment
          </button>
        </div>
      </div>
    );
  }

  const { referenceCutoff, nearMissThreshold, datasets, combined, bestMatch, summarySentence } =
    computedState || {};

  const refMin = data?.reference_min ?? 0.50;
  const refMax = data?.reference_max ?? 0.95;
  const defRef = data?.default_reference ?? 0.70;
  const ineligible = data?.ineligible_datasets || [];
  const samplePhotos = data?.sample_photos || [];

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header Bar */}
      <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#69746A] hover:text-[#202923] transition-colors mr-2 cursor-pointer"
            >
              <ArrowLeft size={16} /> Back to Single Check
            </button>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#24543D]/10 text-[#24543D] border border-[#D5DCD1] flex items-center gap-1">
              <Sparkles size={11} /> Workspace Feature
            </span>
          </div>
          <h1 className="font-serif font-bold text-[22px] text-[#202923] tracking-tight">
            Domain Gap Assessment — Workspace Comparison
          </h1>
          <p className="text-[13px] text-[#69746A]">
            Compare how well each dataset in this workspace covers your real-world deployment photos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchComparison(true)}
            disabled={isRecomputing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-bold bg-[#FCFAF6] border border-[#D5DCD1] text-[#202923] hover:bg-[#E7EAE4] transition-colors cursor-pointer disabled:opacity-50"
            title="Force recomputation of the comparison matrix"
          >
            <RefreshCw size={14} className={isRecomputing ? 'animate-spin text-[#24543D]' : ''} />
            {isRecomputing ? 'Recomputing...' : 'Re-run Comparison'}
          </button>
        </div>
      </div>

      {/* 2. Setup Bar & Dataset Chips */}
      <div className="bg-[#F7F5EE] border border-[#D5DCD1] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-[12px] font-bold text-[#69746A] mr-1">
            Active Photos:
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FCFAF6] border border-[#D5DCD1] text-[12px] font-bold text-[#202923] shadow-2xs">
            <Layers size={13} className="text-[#24543D]" />
            {data?.sample_count ?? samplePhotos.length} Deployment Photos
          </span>

          <span className="text-[#D5DCD1] mx-1">|</span>

          <span className="text-[12px] font-bold text-[#69746A] mr-1">
            Eligible Datasets ({datasets.length}):
          </span>
          {datasets.map((ds) => (
            <span
              key={ds.dataset_id}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-bold border transition-colors ${
                ds.dataset_id === initialReferenceDatasetId
                  ? 'bg-[#24543D]/10 border-[#D5DCD1] text-[#24543D]'
                  : 'bg-[#FCFAF6] border-[#D5DCD1] text-[#202923]'
              }`}
            >
              {ds.dataset_name}
              <span className="text-[#69746A] font-normal">({ds.dataset_image_count})</span>
            </span>
          ))}

          {ineligible.length > 0 && (
            <button
              onClick={() => setShowIneligible(!showIneligible)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-[#E7EAE4] hover:bg-[#D5DCD1] text-[#202923] transition-colors cursor-pointer border border-[#D5DCD1]"
            >
              <Info size={12} className="text-[#69746A]" />
              {ineligible.length} Ineligible
              {showIneligible ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowMethodology(!showMethodology)}
          className="inline-flex items-center gap-1 text-[12px] font-bold text-[#24543D] hover:text-[#1C4430] transition-colors self-start sm:self-auto cursor-pointer"
        >
          <HelpCircle size={14} /> Methodology Note
        </button>
      </div>

      {/* Ineligible Datasets Collapsible Drawer */}
      {showIneligible && ineligible.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 text-[12.5px] text-[#202923] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle size={15} className="text-amber-600" /> Datasets excluded from comparison
            </span>
            <button
              onClick={() => setShowIneligible(false)}
              className="text-amber-700 hover:text-amber-900 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            {ineligible.map((item) => (
              <div key={item.dataset_id} className="p-2.5 bg-white/90 rounded-xl border border-amber-200">
                <div className="font-bold text-[#202923]">{item.dataset_name}</div>
                <div className="text-[11px] text-amber-800 mt-0.5">{item.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology Note */}
      {showMethodology && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-xs text-[12.5px] text-[#69746A] space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-serif font-bold text-[14px] text-[#202923] flex items-center gap-1.5">
              <Info size={16} className="text-[#24543D]" /> Comparison Methodology & Traceability
            </h4>
            <button
              onClick={() => setShowMethodology(false)}
              className="text-[#69746A] hover:text-[#202923] cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
          <p>
            <strong>Reference Cutoff:</strong> Each dataset has its own empirical baseline threshold (the 10th percentile
            of intra-dataset cosine similarity in 768-D DINOv2 feature space). To provide a fair workspace-level ranking,
            DataWeaver defaults to the <em>median of dataset baseline cutoffs</em> ({defRef.toFixed(3)}), ensuring all datasets
            are judged under a uniform similarity expectation. You can adjust this threshold dynamically using the slider below.
          </p>
          <p>
            <strong>Deterministic Ranking:</strong> Candidates are ranked primarily by their <em>median nearest-neighbor similarity</em> across
            all evaluated photos, with ties broken by the total number of covered photos meeting the active reference cutoff.
          </p>
          <p className="text-[11.5px] text-[#69746A]">
            * All pairwise similarities are computed purely in memory or retrieved from stored checksummed matrices without regenerating embeddings or executing UMAP projection.
          </p>
        </div>
      )}

      {/* 3. Best Match Hero Card */}
      {bestMatch && (
        <div className="bg-gradient-to-br from-[#24543D]/10 via-[#FCFAF6] to-[#52725D]/5 border border-[#24543D]/30 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#24543D] text-white shadow-2xs">
                  <Trophy size={12} /> Best Match (#1 Ranked)
                </span>
                {bestMatch.dataset_id === initialReferenceDatasetId && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E7EAE4] text-[#24543D] border border-[#D5DCD1]">
                    Current Dataset
                  </span>
                )}
              </div>
              <h2 className="font-serif font-bold text-[22px] text-[#202923] tracking-tight">
                {bestMatch.dataset_name}
              </h2>
              <p className="text-[13.5px] font-medium text-[#202923] max-w-2xl leading-relaxed">
                {summarySentence}
              </p>

              {/* Caveat Pills */}
              {data?.caveats && data.caveats.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {data.caveats.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium"
                    >
                      <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stat Pill */}
            <div className="flex items-center gap-3 shrink-0 bg-[#FCFAF6]/90 backdrop-blur-xs border border-[#D5DCD1] rounded-2xl p-4 shadow-2xs">
              <div className="text-center px-3 border-r border-[#D5DCD1]/60">
                <div className="text-[24px] font-black text-[#24543D] tracking-tight">
                  {bestMatch.coverage_pct}%
                </div>
                <div className="text-[11px] font-bold text-[#69746A] uppercase tracking-wider">
                  Photos Covered
                </div>
              </div>
              <div className="text-center px-3">
                <div className="text-[24px] font-black text-[#202923] tracking-tight">
                  {bestMatch.median_similarity?.toFixed(2)}
                </div>
                <div className="text-[11px] font-bold text-[#69746A] uppercase tracking-wider">
                  Median Similarity
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Interactive Reference Cutoff Slider */}
      <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-[#24543D]" />
            <h3 className="font-serif font-bold text-[16px] text-[#202923]">
              Interactive Reference Cutoff: <span className="text-[#24543D] font-black font-sans">{referenceCutoff.toFixed(3)}</span>
            </h3>
            <span className="text-[12px] text-[#69746A]">
              (Near-miss window: {nearMissThreshold.toFixed(3)} – {referenceCutoff.toFixed(3)})
            </span>
          </div>

          <div className="flex items-center gap-3">
            {localReference !== defRef && (
              <button
                onClick={() => setLocalReference(defRef)}
                className="text-[12px] font-bold text-[#24543D] hover:text-[#1C4430] cursor-pointer underline"
              >
                Reset to default ({defRef.toFixed(3)})
              </button>
            )}
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              Live Recalculation Active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px] font-bold text-[#69746A]">{refMin.toFixed(2)} (Permissive)</span>
          <input
            type="range"
            min={refMin}
            max={refMax}
            step={0.005}
            value={referenceCutoff}
            onChange={(e) => setLocalReference(parseFloat(e.target.value))}
            className="flex-1 accent-[#24543D] cursor-pointer h-2 bg-[#E7EAE4] rounded-lg"
          />
          <span className="text-[11px] font-bold text-[#69746A]">{refMax.toFixed(2)} (Strict)</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#69746A] pt-1 border-t border-[#D5DCD1]/60">
          <span>Lowering the cutoff accommodates challenging real-world variations (lighting, blur).</span>
          <span>Higher cutoffs demand near-identical feature representations.</span>
        </div>
      </div>

      {/* 5. Greedy Combined Coverage Step Card */}
      {combined && combined.length > 1 && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-serif font-bold text-[15px] text-[#202923] flex items-center gap-1.5">
              <Sparkles size={16} className="text-[#24543D]" />
              Complementary Dataset Combination
            </h4>
            <span className="text-[11px] font-bold text-[#24543D]">
              Greedy Expansion
            </span>
          </div>
          <p className="text-[12.5px] text-[#69746A]">
            If no single dataset achieves 100% domain coverage, combining complementary datasets can eliminate coverage blind spots:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {combined.map((step, idx) => (
              <div
                key={step.step}
                className="p-3.5 bg-[#F7F5EE] rounded-xl border border-[#D5DCD1] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-[#24543D]/10 text-[#24543D] border border-[#D5DCD1]">
                      Step {step.step}
                    </span>
                    <span className="text-[13px] font-black text-[#202923]">
                      {step.cumulative_coverage_pct}% Total
                    </span>
                  </div>
                  <div className="font-bold text-[13px] text-[#202923] truncate" title={step.dataset_name}>
                    {step.dataset_name}
                  </div>
                  <div className="text-[11.5px] text-[#69746A] mt-0.5">
                    {idx === 0
                      ? `Provides base coverage for ${step.newly_covered_count} photos.`
                      : `Adds +${step.newly_covered_count} newly covered photos.`}
                  </div>
                </div>

                <div className="w-full bg-[#E7EAE4] h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-[#24543D] h-full rounded-full transition-all duration-300"
                    style={{ width: `${step.cumulative_coverage_pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Tabs: Ranked Table vs Similarity Heatmap vs Mini Targets */}
      <div className="flex items-center justify-between border-b border-[#D5DCD1] pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('table')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${
              activeTab === 'table'
                ? 'bg-[#24543D] text-white shadow-2xs'
                : 'bg-[#FCFAF6] text-[#69746A] hover:bg-[#E7EAE4] border border-[#D5DCD1]'
            }`}
          >
            <BarChart2 size={14} /> Ranked Table
          </button>
          <button
            onClick={() => setActiveTab('heatmap')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${
              activeTab === 'heatmap'
                ? 'bg-[#24543D] text-white shadow-2xs'
                : 'bg-[#FCFAF6] text-[#69746A] hover:bg-[#E7EAE4] border border-[#D5DCD1]'
            }`}
          >
            <Grid size={14} /> Photo × Dataset Matrix
          </button>
          <button
            onClick={() => setActiveTab('targets')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold transition-colors cursor-pointer ${
              activeTab === 'targets'
                ? 'bg-[#24543D] text-white shadow-2xs'
                : 'bg-[#FCFAF6] text-[#69746A] hover:bg-[#E7EAE4] border border-[#D5DCD1]'
            }`}
          >
            <Layers size={14} /> Target Charts
          </button>
        </div>

        <div className="text-[12px] text-[#69746A] hidden sm:block">
          {datasets.length} candidate datasets evaluated
        </div>
      </div>

      {/* View 1: Ranked Comparison Table */}
      {activeTab === 'table' && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F7F5EE] border-b border-[#D5DCD1] text-[11px] font-bold text-[#69746A] uppercase tracking-wider">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Dataset Name</th>
                  <th className="py-3 px-4">Images</th>
                  <th className="py-3 px-4">Median Sim</th>
                  <th className="py-3 px-4">Own Cutoff</th>
                  <th className="py-3 px-4">Coverage vs Reference</th>
                  <th className="py-3 px-4 min-w-[200px]">Coverage Breakdown</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DCD1]/60 text-[12.5px]">
                {datasets.map((ds) => {
                  const isCurrent = ds.dataset_id === initialReferenceDatasetId;
                  const isWinner = ds.rank === 1;

                  return (
                    <tr
                      key={ds.dataset_id}
                      className={`hover:bg-[#E7EAE4]/40 transition-colors ${
                        isWinner ? 'bg-[#24543D]/5' : isCurrent ? 'bg-[#52725D]/5' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-black text-[#202923]">
                        {isWinner ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#24543D] text-white text-[11px]">
                            1
                          </span>
                        ) : (
                          `#${ds.rank}`
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#202923] flex items-center gap-1.5">
                          {ds.dataset_name}
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#24543D]/10 text-[#24543D] border border-[#24543D]/20">
                              Current
                            </span>
                          )}
                          {isWinner && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Best
                            </span>
                          )}
                        </div>
                        {ds.size_warning && (
                          <div className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5" title={ds.size_warning}>
                            <AlertTriangle size={11} /> Size disparity
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[#69746A] font-medium">
                        {ds.dataset_image_count}
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-[#202923]">
                        {ds.median_similarity?.toFixed(3)}
                      </td>
                      <td className="py-3.5 px-4 text-[#69746A] font-mono text-[11.5px]">
                        {ds.cutoff?.toFixed(3) ?? '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-black text-[13px] text-emerald-800">
                          {ds.coverage_pct}%
                        </span>
                        <span className="text-[11px] text-[#69746A] ml-1">
                          ({ds.covered_count}/{ds.per_photo?.length || samplePhotos.length})
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[#E7EAE4]">
                            <div
                              className="bg-emerald-600 transition-all duration-300"
                              style={{ width: `${ds.coverage_pct}%` }}
                              title={`Covered: ${ds.covered_count} (${ds.coverage_pct}%)`}
                            />
                            <div
                              className="bg-amber-500 transition-all duration-300"
                              style={{ width: `${ds.near_miss_pct}%` }}
                              title={`Near-miss: ${ds.near_miss_count} (${ds.near_miss_pct}%)`}
                            />
                            <div
                              className="bg-rose-500 transition-all duration-300"
                              style={{ width: `${ds.far_pct}%` }}
                              title={`Far: ${ds.far_count} (${ds.far_pct}%)`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#69746A]">
                            <span className="text-emerald-800 font-bold">{ds.covered_count} cov</span>
                            <span className="text-amber-800 font-bold">{ds.near_miss_count} near</span>
                            <span className="text-rose-800 font-bold">{ds.far_count} far</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {onSelectDataset && (
                          <button
                            onClick={() => onSelectDataset(ds.dataset_id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11.5px] font-bold bg-[#F7F5EE] hover:bg-[#E7EAE4] text-[#24543D] border border-[#D5DCD1] transition-colors cursor-pointer"
                          >
                            Open Check <ExternalLink size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 2: Photo x Dataset Similarity Matrix (Heatmap) */}
      {activeTab === 'heatmap' && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif font-bold text-[16px] text-[#202923]">
                Photo × Dataset Similarity Heatmap
              </h3>
              <p className="text-[12px] text-[#69746A]">
                Inspect how each deployment photo matches across datasets. Click any photo row to inspect the matched image pairs.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="flex items-center gap-1 text-emerald-800">
                <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" /> ≥ {referenceCutoff.toFixed(2)} (Covered)
              </span>
              <span className="flex items-center gap-1 text-amber-800">
                <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Near-miss
              </span>
              <span className="flex items-center gap-1 text-rose-800">
                <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" /> Far
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#F7F5EE] border-b border-[#D5DCD1] text-[11px] font-bold text-[#69746A] uppercase">
                  <th className="py-3 px-3 text-left">Photo</th>
                  {datasets.map((ds) => (
                    <th key={ds.dataset_id} className="py-3 px-3 min-w-[120px]">
                      <div className="font-bold text-[#202923] truncate" title={ds.dataset_name}>
                        {ds.dataset_name}
                      </div>
                      <div className="text-[10px] text-[#69746A]">Rank #{ds.rank}</div>
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DCD1]/60">
                {samplePhotos.map((photo, pIdx) => (
                  <tr
                    key={photo.index ?? pIdx}
                    onClick={() => setInspectedPhotoIndex(photo.index ?? pIdx)}
                    className="hover:bg-[#E7EAE4]/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 text-left">
                      <div className="flex items-center gap-2">
                        {photo.url ? (
                          <img
                            src={photo.url}
                            alt={`Photo #${(photo.index ?? pIdx) + 1}`}
                            className="w-8 h-8 rounded-lg object-cover border border-[#D5DCD1] shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[#E7EAE4] border border-[#D5DCD1] flex items-center justify-center font-bold text-[#69746A] text-[11px]">
                            {(photo.index ?? pIdx) + 1}
                          </div>
                        )}
                        <span className="font-bold text-[#202923]">Photo #{(photo.index ?? pIdx) + 1}</span>
                      </div>
                    </td>

                    {datasets.map((ds) => {
                      const match = (ds.per_photo || []).find((p) => p.sample_index === (photo.index ?? pIdx));
                      const sim = match?.similarity ?? 0.0;
                      const isCov = sim >= referenceCutoff;
                      const isNear = !isCov && sim >= nearMissThreshold;

                      const cellStyle = isCov
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-extrabold'
                        : isNear
                        ? 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
                        : 'bg-rose-50/70 text-rose-900 border-rose-300 font-medium';

                      return (
                        <td key={ds.dataset_id} className="py-2 px-2">
                          <div className={`py-1.5 px-2 rounded-lg border text-[11.5px] ${cellStyle}`}>
                            {sim.toFixed(3)}
                          </div>
                        </td>
                      );
                    })}

                    <td className="py-2.5 px-3 text-right">
                      <button className="text-[#24543D] hover:underline text-[11px] font-bold cursor-pointer">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 3: Mini Bullseye Target Grid */}
      {activeTab === 'targets' && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-2xs space-y-4">
          <div>
            <h3 className="font-serif font-bold text-[16px] text-[#202923]">
              Coverage Target Comparison
            </h3>
            <p className="text-[12px] text-[#69746A]">
              Compact bullseye visualizations sharing the uniform reference cutoff ring (green dashed line).
              Photos inside the green ring satisfy the reference threshold.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {datasets.map((ds) => (
              <MiniBullseyeTarget
                key={ds.dataset_id}
                dataset={ds}
                referenceCutoff={referenceCutoff}
                nearMissMargin={data?.near_miss_margin ?? 0.10}
                isReference={ds.dataset_id === initialReferenceDatasetId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Photo Match Inspector Modal */}
      {inspectedPhotoIndex !== null && (
        <div className="fixed inset-0 z-50 bg-[#202923]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FCFAF6] rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl space-y-5 border border-[#D5DCD1]">
            <div className="flex items-center justify-between pb-3 border-b border-[#D5DCD1]">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#24543D]/10 text-[#24543D] border border-[#24543D]/20">
                  Photo #{inspectedPhotoIndex + 1}
                </span>
                <h3 className="font-serif font-bold text-[18px] text-[#202923]">
                  Cross-Dataset Nearest Match Inspection
                </h3>
              </div>
              <button
                onClick={() => setInspectedPhotoIndex(null)}
                className="w-8 h-8 rounded-lg bg-[#F7F5EE] hover:bg-[#E7EAE4] text-[#202923] border border-[#D5DCD1] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Uploaded Photo */}
              <div className="space-y-2">
                <span className="text-[12px] font-extrabold text-[#69746A] uppercase tracking-wider">
                  Target Real-World Photo
                </span>
                <div className="rounded-xl overflow-hidden border border-[#D5DCD1] bg-[#F7F5EE] aspect-square">
                  {samplePhotos[inspectedPhotoIndex]?.url ? (
                    <img
                      src={samplePhotos[inspectedPhotoIndex]?.url}
                      alt={`Target photo #${inspectedPhotoIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#69746A] font-bold">
                      Photo #{inspectedPhotoIndex + 1}
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-[#69746A] truncate">
                  {samplePhotos[inspectedPhotoIndex]?.path}
                </div>
              </div>

              {/* Right Columns: Each dataset's nearest match */}
              <div className="md:col-span-2 space-y-3">
                <span className="text-[12px] font-extrabold text-[#69746A] uppercase tracking-wider">
                  Nearest Image per Dataset
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {datasets.map((ds) => {
                    const match = (ds.per_photo || []).find((p) => p.sample_index === inspectedPhotoIndex);
                    const sim = match?.similarity ?? 0.0;
                    const isCov = sim >= referenceCutoff;
                    const isNear = !isCov && sim >= nearMissThreshold;

                    return (
                      <div
                        key={ds.dataset_id}
                        className="p-3 bg-[#F7F5EE] rounded-xl border border-[#D5DCD1] flex gap-3 items-center"
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#E7EAE4] border border-[#D5DCD1] shrink-0">
                          {match?.nearest_image_url ? (
                            <img
                              src={match.nearest_image_url}
                              alt={ds.dataset_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#69746A] text-[10px] text-center p-1">
                              No preview
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[12.5px] text-[#202923] truncate" title={ds.dataset_name}>
                            {ds.dataset_name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[14px] font-black text-[#202923]">
                              {sim.toFixed(3)}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                isCov
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : isNear
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {isCov ? 'Covered' : isNear ? 'Near-miss' : 'Far'}
                            </span>
                          </div>
                          <div className="text-[10.5px] text-[#69746A] truncate mt-0.5">
                            {match?.nearest_image_path?.split('/').pop()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
