import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Brain,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Lightbulb,
  ExternalLink,
  Info,
  X,
  ChevronRight,
} from 'lucide-react';
import client from '../api/client';

const METRIC_LABELS = {
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
  label_match_mismatch_ratio: 'Label Mismatch Ratio',
};

function formatMetricLabel(key) {
  if (!key) return '';
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AiAssessmentCard({ datasetId, purposeKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // In-memory cache by purposeKey to allow instant switches
  const cacheRef = useRef({});

  const fetchAssessment = async (force = false) => {
    if (!datasetId || !purposeKey) return;

    if (!force && cacheRef.current[purposeKey]) {
      setData(cacheRef.current[purposeKey]);
      setLoading(false);
      setError(null);
      return;
    }

    if (force) {
      setRegenerating(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await client.post(
        `/datasets/${datasetId}/purpose-fit/ai-assessment`,
        {
          purpose_key: purposeKey,
          force_regenerate: force,
        }
      );
      setData(response.data);
      cacheRef.current[purposeKey] = response.data;
    } catch (err) {
      console.error('Failed to load AI assessment:', err);
      setError(
        err.response?.data?.detail ||
          'Unable to generate an AI assessment for this purpose right now.'
      );
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  };

  useEffect(() => {
    fetchAssessment(false);
  }, [datasetId, purposeKey]);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleEvidenceClick = (metricKey) => {
    if (!metricKey) return;
    setIsOpen(false);
    setTimeout(() => {
      const target = document.getElementById(`finding-${metricKey}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2', 'transition-all', 'duration-300');
        setTimeout(() => {
          target.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
        }, 2200);
      }
    }, 150);
  };

  const assessment = data?.assessment;
  const isFallback = data?.generated_by === 'fallback';

  return (
    <>
      {/* Compact Entry Bar / Button at top of page */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3 px-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all hover:border-indigo-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            {isFallback ? <Brain size={16} /> : <Sparkles size={16} />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-[13.5px] font-bold text-slate-900">
                Executive AI Assessment
              </h4>
              {loading ? (
                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  Analyzing...
                </span>
              ) : isFallback ? (
                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Automatic summary
                </span>
              ) : (
                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center gap-1">
                  <Sparkles size={10} />
                  AI Generated
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-slate-500 line-clamp-1 mt-0.5">
              {loading
                ? 'Synthesizing dataset findings and purpose criteria...'
                : assessment?.headline || 'Evaluate dataset suitability, critical concerns, and recommended next steps.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          {error ? (
            <button
              onClick={() => fetchAssessment(false)}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[12px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>Retry</span>
            </button>
          ) : (
            <button
              onClick={() => setIsOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[12.5px] font-bold flex items-center gap-1.5 shadow-xs hover:shadow-sm transition-all cursor-pointer"
            >
              <Sparkles size={13} />
              <span>Open Assessment</span>
              <ChevronRight size={14} className="opacity-70" />
            </button>
          )}
        </div>
      </div>

      {/* Modal Dialog for the full AI Assessment Card */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
          <div
            className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[88vh] overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-white border-b border-slate-100 p-4 px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  {isFallback ? <Brain size={17} /> : <Sparkles size={17} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-[15px] text-slate-900 tracking-tight">
                    Executive AI Assessment
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isFallback ? (
                      <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                        <Info size={11} />
                        Automatic summary (AI unavailable)
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                        <Sparkles size={11} />
                        AI-generated from measured dataset statistics
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchAssessment(true)}
                  disabled={regenerating}
                  title="Re-run assessment with fresh evaluation"
                  className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} />
                  <span>{regenerating ? 'Regenerating...' : 'Regenerate'}</span>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close dialog"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 overflow-y-auto space-y-4">
              {loading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-5 bg-slate-200 rounded w-3/4"></div>
                  <div className="space-y-2">
                    <div className="h-3.5 bg-slate-100 rounded w-full"></div>
                    <div className="h-3.5 bg-slate-100 rounded w-5/6"></div>
                    <div className="h-3.5 bg-slate-100 rounded w-4/6"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="h-32 bg-slate-50 rounded-xl"></div>
                    <div className="h-32 bg-slate-50 rounded-xl"></div>
                  </div>
                </div>
              ) : error ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                  <p className="text-[13px] text-slate-700">{error}</p>
                  <button
                    onClick={() => fetchAssessment(false)}
                    className="px-3.5 py-1.5 bg-slate-800 text-white rounded-lg text-[12px] font-semibold"
                  >
                    Try Again
                  </button>
                </div>
              ) : assessment ? (
                <>
                  {/* Headline & Summary */}
                  <div className="space-y-1.5">
                    <h3 className="font-extrabold text-[16px] text-slate-900 tracking-tight leading-snug">
                      {assessment.headline}
                    </h3>
                    <p className="text-[13px] text-slate-700 leading-relaxed font-normal">
                      {assessment.summary}
                    </p>
                  </div>

                  {/* Two Columns: What Works vs What to Watch */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* Left Column: Strengths */}
                    <div className="bg-emerald-50/40 border border-emerald-200/60 rounded-xl p-4 space-y-2.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-emerald-800 font-bold text-[13px] mb-2">
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          <span>What works for this purpose</span>
                        </div>
                        {assessment.strengths && assessment.strengths.length > 0 ? (
                          <ul className="space-y-2 text-[12.5px] text-slate-700">
                            {assessment.strengths.map((str, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                <span className="leading-snug">{str}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-slate-500 italic">
                            No specific favorable suitability metrics recorded.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Concerns */}
                    <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-4 space-y-2.5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-amber-900 font-bold text-[13px] mb-2">
                          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                          <span>What to watch</span>
                        </div>
                        {assessment.concerns && assessment.concerns.length > 0 ? (
                          <div className="space-y-2.5">
                            {assessment.concerns.map((c, idx) => {
                              const isCritical = c.severity === 'critical';
                              return (
                                <div
                                  key={idx}
                                  className={`p-2.5 rounded-lg border text-[12.5px] leading-snug space-y-1.5 ${
                                    isCritical
                                      ? 'bg-rose-50/60 border-rose-200/70 text-rose-950'
                                      : 'bg-amber-50/60 border-amber-200/70 text-amber-950'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    {isCritical ? (
                                      <AlertOctagon size={14} className="text-rose-600 shrink-0 mt-0.5" />
                                    ) : (
                                      <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                    )}
                                    <span className="font-medium flex-1">{c.text}</span>
                                    <span
                                      className={`text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded ${
                                        isCritical
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {c.severity}
                                    </span>
                                  </div>

                                  {/* Evidence Chips */}
                                  {c.evidence && c.evidence.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5 pl-5.5">
                                      <span className="text-[10.5px] font-semibold text-slate-500">
                                        Evidence:
                                      </span>
                                      {c.evidence.map((ev, evIdx) => (
                                        <button
                                          key={evIdx}
                                          onClick={() => handleEvidenceClick(ev)}
                                          title={`Jump to ${formatMetricLabel(ev)} finding in the list`}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-indigo-600 hover:border-indigo-300 transition-all cursor-pointer shadow-2xs"
                                        >
                                          <span>{formatMetricLabel(ev)}</span>
                                          <ExternalLink size={10} className="text-slate-400" />
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[12px] text-slate-500 italic">
                            No active warnings or critical bottlenecks identified for this purpose.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  {assessment.recommendations && assessment.recommendations.length > 0 && (
                    <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center gap-2 text-slate-800 font-bold text-[12.5px]">
                        <Lightbulb size={15} className="text-amber-500 shrink-0" />
                        <span>Recommended Next Steps</span>
                      </div>
                      <ul className="space-y-1.5 pl-6 list-decimal text-[12.5px] text-slate-700 font-medium">
                        {assessment.recommendations.map((rec, idx) => (
                          <li key={idx} className="leading-snug">
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Confidence Note & Metadata Footer */}
                  {assessment.confidence_note && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-[11.5px] text-slate-500 gap-1.5">
                      <p className="italic leading-snug">
                        {assessment.confidence_note}
                      </p>
                      {data.model_name && (
                        <span className="text-[10.5px] text-slate-400 font-mono shrink-0">
                          Model: {data.model_name}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
