import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Download,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Sparkles,
  Minus,
} from 'lucide-react';

import {
  triggerLearningCurve,
  getLearningCurveStatus,
  getLearningCurveResults,
  cancelLearningCurve,
} from '../api/learningCurveApi';
import { LEARNING_CURVE_COPY } from '../utils/learningCurveCopy';

export default function DatasetLearningCurve({ dataset, onBack }) {
  const datasetId = dataset?.dataset_id;
  const datasetName = dataset?.dataset_name || 'Dataset';

  // State
  const [loading, setLoading] = useState(true);
  const [jobStatus, setJobStatus] = useState('not_run'); // 'not_run' | 'ineligible' | 'running' | 'completed' | 'failed' | 'cancelled'
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [ineligibleInfo, setIneligibleInfo] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRecomputing, setIsRecomputing] = useState(false);

  // UI Interactive States
  const [isChartHelpOpen, setIsChartHelpOpen] = useState(false);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isCaveatsOpen, setIsCaveatsOpen] = useState(false);
  const [showAllMislabels, setShowAllMislabels] = useState(false);
  const [enlargedCandidate, setEnlargedCandidate] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [brokenImages, setBrokenImages] = useState({});

  // Polling ref
  const pollIntervalRef = useRef(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Initial fetch on mount or datasetId change
  const fetchStatusAndData = async () => {
    if (!datasetId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const statusRes = await getLearningCurveStatus(datasetId);
      setJobStatus(statusRes.status);
      setStage(statusRes.stage || '');
      setProgress(statusRes.progress || 0);

      if (statusRes.status === 'ineligible') {
        setIneligibleInfo({
          reason: statusRes.reason,
          message: statusRes.message,
          details: statusRes.details,
        });
        setLoading(false);
        return;
      }

      if (statusRes.status === 'completed') {
        const fullResult = await getLearningCurveResults(datasetId);
        setResultData(fullResult);
        setLoading(false);
        return;
      }

      if (statusRes.status === 'running') {
        startPolling();
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching learning curve status:', err);
      setJobStatus('failed');
      setErrorMessage(err.response?.data?.detail || 'Unable to check learning curve status.');
      setLoading(false);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusRes = await getLearningCurveStatus(datasetId);
        setJobStatus(statusRes.status);
        setStage(statusRes.stage || '');
        setProgress(statusRes.progress || 0);

        if (statusRes.status === 'completed') {
          stopPolling();
          const fullResult = await getLearningCurveResults(datasetId);
          setResultData(fullResult);
        } else if (statusRes.status === 'failed' || statusRes.status === 'cancelled') {
          stopPolling();
          if (statusRes.status === 'failed') {
            setErrorMessage('Learning curve check encountered an unexpected error.');
          }
        }
      } catch (pollErr) {
        console.error('Error polling learning curve:', pollErr);
      }
    }, 2000);
  };

  useEffect(() => {
    fetchStatusAndData();
    return () => stopPolling();
  }, [datasetId]);

  // Action handlers
  const handleStartCheck = async (force = false) => {
    if (!datasetId) return;
    setErrorMessage('');
    setIsRecomputing(force);
    setJobStatus('running');
    setStage('Starting check...');
    setProgress(0.05);

    try {
      const res = await triggerLearningCurve(datasetId, force);
      if (res.status === 'completed') {
        setResultData(res);
        setJobStatus('completed');
        setIsRecomputing(false);
        return;
      }
      startPolling();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'object' && detail?.reason) {
        setJobStatus('ineligible');
        setIneligibleInfo(detail);
      } else {
        setJobStatus('failed');
        setErrorMessage(typeof detail === 'string' ? detail : 'Failed to launch learning curve calculation.');
      }
      setIsRecomputing(false);
      stopPolling();
    }
  };

  const handleCancelCheck = async () => {
    try {
      await cancelLearningCurve(datasetId);
      setJobStatus('cancelled');
      setStage('Cancelled by user');
      stopPolling();
    } catch (err) {
      console.error('Failed to cancel check:', err);
    }
  };

  // CSV Export for mislabel candidates
  const handleExportCsv = () => {
    if (!resultData?.mislabel_candidates?.length) return;
    const rows = [
      ['Image Path', 'Labelled Class', 'Predicted Class', 'Test Model Confidence'],
      ...resultData.mislabel_candidates.map((c) => [
        c.image_path,
        c.labelled_class,
        c.predicted_class,
        `${(c.confidence * 100).toFixed(1)}%`,
      ]),
    ];
    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((e) => e.map((x) => `"${x}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mislabel_review_${datasetName.replace(/\s+/g, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Verdict Metadata Helper
  const verdictMeta = useMemo(() => {
    if (!resultData?.verdict) return LEARNING_CURVE_COPY.verdicts.levelling_off;
    return LEARNING_CURVE_COPY.verdicts[resultData.verdict] || LEARNING_CURVE_COPY.verdicts.levelling_off;
  }, [resultData?.verdict]);

  // Derived metrics for summary
  const summaryNumbers = useMemo(() => {
    if (!resultData) return null;
    const finalPct = Math.round(resultData.final_score * 100);
    const chancePct = Math.round(resultData.chance_level * 100);
    const totalImgs = resultData.images_used || resultData.images_total || 0;
    const lastGainPoints = Math.round(resultData.last_step_gain * 100);

    return {
      finalPct,
      chancePct,
      totalImgs,
      lastGainPoints,
    };
  }, [resultData]);

  // SVG Chart Geometry Calculation
  const chartGeometry = useMemo(() => {
    if (!resultData?.fractions || resultData.fractions.length === 0) return null;

    const width = 640;
    const height = 320;
    const padLeft = 60;
    const padRight = 40;
    const padTop = 30;
    const padBottom = 60;

    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    const fractions = resultData.fractions;
    const minFrac = fractions[0].fraction;
    const maxFrac = fractions[fractions.length - 1].fraction;

    // x-coordinate mapping
    const getX = (frac) => {
      const ratio = (frac - minFrac) / (maxFrac - minFrac || 1);
      return padLeft + ratio * plotWidth;
    };

    // y-coordinate mapping (0 to 100%)
    const getY = (val) => {
      const clamped = Math.max(0, Math.min(1.0, val));
      return padTop + (1.0 - clamped) * plotHeight;
    };

    const validPoints = fractions.filter((f) => !f.skipped);

    // Build main line path
    const linePath = validPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.fraction).toFixed(1)} ${getY(p.score_mean).toFixed(1)}`)
      .join(' ');

    // Build soft shaded band (mean + std, mean - std)
    const upperPoints = validPoints.map((p) => ({
      x: getX(p.fraction),
      y: getY(Math.min(1.0, p.score_mean + p.score_std)),
    }));

    const lowerPoints = [...validPoints].reverse().map((p) => ({
      x: getX(p.fraction),
      y: getY(Math.max(0.0, p.score_mean - p.score_std)),
    }));

    const areaPoints = [...upperPoints, ...lowerPoints];
    const areaPath = areaPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .concat('Z')
      .join(' ');

    const chanceY = getY(resultData.chance_level);

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotWidth,
      plotHeight,
      getX,
      getY,
      linePath,
      areaPath,
      chanceY,
      fractions,
      validPoints,
    };
  }, [resultData]);

  // Mislabel candidates view slice
  const displayedCandidates = useMemo(() => {
    if (!resultData?.mislabel_candidates) return [];
    if (showAllMislabels) return resultData.mislabel_candidates;
    return resultData.mislabel_candidates.slice(0, 12);
  }, [resultData?.mislabel_candidates, showAllMislabels]);

  // Loading view
  if (loading) {
    return (
      <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-16 text-center space-y-4 shadow-2xs my-8 max-w-2xl mx-auto">
        <RefreshCw size={28} className="animate-spin text-[#24543D] mx-auto" />
        <h3 className="font-serif font-bold text-[18px] text-[#202923]">Checking Learning Curve status...</h3>
        <p className="text-[13px] text-[#69746A]">Inspecting dataset eligibility and cached results.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* -------------------------------------------------------------
       * TOP HEADER BAR
       * ------------------------------------------------------------- */}
      <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl border border-[#D5DCD1] flex items-center justify-center text-[#69746A] hover:text-[#202923] hover:bg-[#E7EAE4] transition-colors cursor-pointer shrink-0"
              title="Return to profiling overview"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#24543D] bg-[#24543D]/10 px-2.5 py-0.5 rounded-full border border-[#24543D]/20 flex items-center gap-1.5">
                  <TrendingUp size={12} />
                  <span>{LEARNING_CURVE_COPY.header.title}</span>
                </span>
                <h2 className="font-serif font-bold text-[20px] text-[#202923] tracking-tight">
                  {datasetName}
                </h2>
              </div>
              <p className="text-[12.5px] text-[#69746A] mt-0.5">
                {LEARNING_CURVE_COPY.header.subtitle}
              </p>
            </div>
          </div>

          {jobStatus === 'completed' && (
            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <button
                onClick={() => handleStartCheck(true)}
                disabled={isRecomputing || jobStatus === 'running'}
                className="px-4 py-2 bg-[#FCFAF6] hover:bg-[#E7EAE4] text-[#202923] border border-[#D5DCD1] rounded-xl text-[12.5px] font-semibold transition-all flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={isRecomputing ? 'animate-spin' : ''} />
                <span>Re-run check</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------
       * STATE A: INELIGIBLE
       * ------------------------------------------------------------- */}
      {jobStatus === 'ineligible' && ineligibleInfo && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-8 max-w-2xl mx-auto shadow-2xs text-center space-y-4 my-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/70 px-2.5 py-0.5 rounded-full">
              Eligibility Notice
            </span>
            <h3 className="font-serif font-bold text-[20px] text-[#202923] mt-2">
              {LEARNING_CURVE_COPY.ineligible.reasons[ineligibleInfo.reason]?.headline ||
                LEARNING_CURVE_COPY.ineligible.title}
            </h3>
            <p className="text-[13.5px] text-[#69746A] max-w-lg mx-auto mt-2 leading-relaxed">
              {ineligibleInfo.message ||
                LEARNING_CURVE_COPY.ineligible.reasons[ineligibleInfo.reason]?.message}
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={onBack}
              className="px-5 py-2.5 bg-[#24543D] hover:bg-[#1C4430] text-white rounded-xl text-[13px] font-bold shadow-md shadow-[#24543D]/15 transition-all cursor-pointer"
            >
              Return to Dataset Profiling
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * STATE B: NOT RUN YET
       * ------------------------------------------------------------- */}
      {jobStatus === 'not_run' && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-8 md:p-10 shadow-2xs space-y-8 max-w-3xl mx-auto my-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#24543D]/10 text-[#24543D] border border-[#D5DCD1] flex items-center justify-center mx-auto">
              <Sparkles size={28} />
            </div>
            <h3 className="font-serif font-bold text-[24px] text-[#202923] tracking-tight">
              {LEARNING_CURVE_COPY.unrun.title}
            </h3>
            <p className="text-[13.5px] text-[#69746A] max-w-xl mx-auto leading-relaxed">
              {LEARNING_CURVE_COPY.unrun.intro}
            </p>
          </div>

          {/* 3 Steps Explanation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LEARNING_CURVE_COPY.unrun.steps.map((st) => (
              <div
                key={st.number}
                className="bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl p-5 space-y-2 relative"
              >
                <div className="w-7 h-7 rounded-lg bg-[#24543D] text-white text-[13px] font-bold flex items-center justify-center">
                  {st.number}
                </div>
                <h4 className="font-bold text-[14px] text-[#202923]">{st.title}</h4>
                <p className="text-[12px] text-[#69746A] leading-relaxed">{st.desc}</p>
              </div>
            ))}
          </div>

          {/* Run Action */}
          <div className="text-center space-y-2 pt-2">
            <button
              onClick={() => handleStartCheck(false)}
              className="px-6 py-3 bg-[#24543D] hover:bg-[#1C4430] text-white rounded-xl text-[14px] font-bold shadow-md shadow-[#24543D]/20 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <TrendingUp size={17} />
              <span>{LEARNING_CURVE_COPY.unrun.ctaButton}</span>
            </button>
            <p className="text-[12px] text-[#69746A]">{LEARNING_CURVE_COPY.unrun.durationNote}</p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * STATE C: RUNNING / POLLING
       * ------------------------------------------------------------- */}
      {jobStatus === 'running' && (
        <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-10 max-w-xl mx-auto text-center space-y-5 shadow-2xs my-8" aria-live="polite">
          <RefreshCw size={32} className="animate-spin text-[#24543D] mx-auto" />
          <div className="space-y-1.5">
            <h3 className="font-serif font-bold text-[20px] text-[#202923]">
              Evaluating Dataset Learning Curve...
            </h3>
            <p className="text-[13px] text-[#69746A]">
              {stage || 'Testing test model accuracy across progressive fractions of images.'}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5 max-w-md mx-auto">
            <div className="w-full bg-[#E7EAE4] rounded-full h-2.5 overflow-hidden border border-[#D5DCD1]">
              <div
                className="bg-[#24543D] h-full transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#69746A] font-semibold px-1">
              <span>{stage}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleCancelCheck}
              className="text-[12px] text-[#69746A] hover:text-[#202923] underline cursor-pointer"
            >
              Cancel evaluation
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * STATE D: FAILED
       * ------------------------------------------------------------- */}
      {jobStatus === 'failed' && (
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-4 shadow-2xs my-8">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <AlertCircle size={26} />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif font-bold text-[19px] text-rose-900">
              Learning Curve Check Failed
            </h3>
            <p className="text-[13px] text-rose-700 max-w-md mx-auto">
              {errorMessage || 'An error occurred while evaluating model accuracy across sample fractions.'}
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => handleStartCheck(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[12.5px] font-bold shadow-xs transition-colors cursor-pointer"
            >
              Retry Check
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white border border-rose-200 text-rose-900 rounded-xl text-[12.5px] font-semibold hover:bg-rose-50 transition-colors cursor-pointer"
            >
              Return
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * STATE E: COMPLETED RESULTS
       * ------------------------------------------------------------- */}
      {jobStatus === 'completed' && resultData && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          {/* Stale Warning Banner if dataset changed */}
          {resultData.is_stale && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-[12.5px] text-amber-900">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={16} className="text-amber-700 shrink-0" />
                <span>
                  The dataset files have changed since this curve was measured. Re-run to update estimates.
                </span>
              </div>
              <button
                onClick={() => handleStartCheck(true)}
                className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-[11.5px] font-bold transition-colors shrink-0 cursor-pointer"
              >
                Update Now
              </button>
            </div>
          )}

          {/* Fallback Grouping Notice (Part 3.4a requirement) */}
          {resultData.grouping === 'none_fallback' && (
            <div className="p-4 bg-amber-50/90 border border-amber-300/80 rounded-2xl flex items-start gap-3 shadow-2xs text-[13px] text-amber-950">
              <AlertTriangle size={19} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Duplicate Isolation Notice</span>
                <p className="text-amber-900 text-[12.5px] leading-relaxed">
                  Near-duplicate images could not be kept strictly apart between training and evaluation folds in this test (e.g. because very large duplicate groups span the dataset), so the score may look better than it really is.
                </p>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
           * 1. ANSWER CARD (Headline, largest element)
           * ------------------------------------------------------------- */}
          <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 md:p-8 shadow-2xs space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2 max-w-3xl">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                  Primary Verdict
                </span>
                <h1 className="font-serif font-bold text-[24px] sm:text-[28px] text-[#202923] tracking-tight leading-snug">
                  {verdictMeta.headline}
                </h1>
                <p className="text-[13.5px] text-[#69746A] leading-relaxed">
                  {verdictMeta.summary}
                </p>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-bold shrink-0 self-start bg-[#F7F5EE] border-[#D5DCD1] text-[#24543D]">
                {verdictMeta.iconType === 'trending-up' && <TrendingUp size={15} />}
                {verdictMeta.iconType === 'check-circle' && <CheckCircle2 size={15} />}
                {verdictMeta.iconType === 'minus' && <Minus size={15} />}
                {verdictMeta.iconType === 'alert-triangle' && <AlertTriangle size={15} />}
                <span className="capitalize">{resultData.verdict.replace(/_/g, ' ')}</span>
              </div>
            </div>

            {/* Supporting Sentence */}
            {summaryNumbers && (
              <div className="p-4 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl text-[13.5px] text-[#202923] font-medium leading-relaxed">
                With all <strong className="font-bold text-[#24543D]">{summaryNumbers.totalImgs.toLocaleString()}</strong> images the test model labels about <strong className="font-bold text-[#24543D]">{summaryNumbers.finalPct}%</strong> of unseen images correctly. Guessing would get <strong className="font-bold text-[#69746A]">{summaryNumbers.chancePct}%</strong>.
              </div>
            )}

            {/* Caveat Chips */}
            {resultData.caveats && resultData.caveats.length > 0 && (
              <div className="pt-2 border-t border-[#D5DCD1]/60 flex items-center gap-2 flex-wrap text-[11.5px]">
                <span className="font-semibold text-[#69746A]">Things to keep in mind:</span>
                {resultData.caveats.slice(0, 2).map((cKey) => {
                  const meta = LEARNING_CURVE_COPY.caveats[cKey];
                  if (!meta) return null;
                  return (
                    <span
                      key={cKey}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold ${
                        meta.isWarning
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-[#E7EAE4] text-[#202923] border-[#D5DCD1]'
                      }`}
                      title={meta.plainText}
                    >
                      <Info size={12} className="shrink-0" />
                      <span>{meta.label}</span>
                    </span>
                  );
                })}

                {resultData.caveats.length > 2 && (
                  <div className="relative inline-block">
                    <button
                      onClick={() => setIsCaveatsOpen(!isCaveatsOpen)}
                      className="px-2.5 py-1 rounded-full border border-[#D5DCD1] bg-[#F7F5EE] text-[#24543D] font-bold text-[11px] hover:bg-[#E7EAE4] transition-colors cursor-pointer"
                    >
                      +{resultData.caveats.length - 2} more notes
                    </button>
                    {isCaveatsOpen && (
                      <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-white border border-[#D5DCD1] rounded-xl shadow-lg z-30 text-[11.5px] text-[#202923] space-y-2">
                        <div className="font-bold text-[12px] text-[#202923] flex items-center justify-between pb-1 border-b border-[#D5DCD1]">
                          <span>Methodological Caveats</span>
                          <button onClick={() => setIsCaveatsOpen(false)} className="text-[#69746A] hover:text-[#202923]">
                            <X size={13} />
                          </button>
                        </div>
                        {resultData.caveats.map((ck) => (
                          <div key={ck} className="space-y-0.5">
                            <span className="font-bold text-[#24543D]">{LEARNING_CURVE_COPY.caveats[ck]?.label || ck}:</span>
                            <p className="text-[#69746A] leading-snug">{LEARNING_CURVE_COPY.caveats[ck]?.plainText || ''}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* -------------------------------------------------------------
           * 2. THE CURVE (The Centerpiece, Pure SVG)
           * ------------------------------------------------------------- */}
          {chartGeometry && (
            <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#D5DCD1]/60">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                    Visual Learning Trajectory
                  </span>
                  <h3 className="font-serif font-bold text-[18px] text-[#202923] tracking-tight mt-0.5">
                    {LEARNING_CURVE_COPY.chart.title}
                  </h3>
                </div>

                <div className="flex items-center gap-4 text-[11px] font-semibold text-[#69746A]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#24543D]" />
                    <span>Test Model Score</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 border-t-2 border-dashed border-[#69746A]" />
                    <span>{LEARNING_CURVE_COPY.chart.guessingLineLabel} ({Math.round(resultData.chance_level * 100)}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-[#24543D]/15 border border-[#24543D]/30" />
                    <span>Typical Spread</span>
                  </div>
                </div>
              </div>

              {/* Responsive SVG Chart Container */}
              <div className="relative overflow-x-auto py-2">
                <svg
                  viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
                  className="w-full h-auto min-w-[580px] max-w-4xl mx-auto block"
                  aria-label="Learning curve chart showing model score versus training images"
                >
                  <defs>
                    <linearGradient id="curveShadedBand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#24543D" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#24543D" stopOpacity="0.04" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines (0%, 25%, 50%, 75%, 100%) */}
                  {[0.0, 0.25, 0.50, 0.75, 1.0].map((level) => {
                    const y = chartGeometry.getY(level);
                    return (
                      <g key={level}>
                        <line
                          x1={chartGeometry.padLeft}
                          y1={y}
                          x2={chartGeometry.width - chartGeometry.padRight}
                          y2={y}
                          stroke="#D5DCD1"
                          strokeWidth="1"
                          strokeDasharray={level === 0 ? 'none' : '3,3'}
                        />
                        <text
                          x={chartGeometry.padLeft - 10}
                          y={y + 3.5}
                          textAnchor="end"
                          fontSize="10.5"
                          fontWeight="600"
                          fill="#69746A"
                        >
                          {Math.round(level * 100)}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Guessing Baseline Dashed Line */}
                  <g>
                    <line
                      x1={chartGeometry.padLeft}
                      y1={chartGeometry.chanceY}
                      x2={chartGeometry.width - chartGeometry.padRight}
                      y2={chartGeometry.chanceY}
                      stroke="#859286"
                      strokeWidth="1.5"
                      strokeDasharray="5,4"
                    />
                    <text
                      x={chartGeometry.width - chartGeometry.padRight - 6}
                      y={chartGeometry.chanceY - 6}
                      textAnchor="end"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#69746A"
                    >
                      Guessing: {Math.round(resultData.chance_level * 100)}%
                    </text>
                  </g>

                  {/* Soft Shaded Band (Mean ± Standard Deviation) */}
                  <path d={chartGeometry.areaPath} fill="url(#curveShadedBand)" />

                  {/* Main Curve Line */}
                  <path
                    d={chartGeometry.linePath}
                    fill="none"
                    stroke="#24543D"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data Points and Markers */}
                  {chartGeometry.fractions.map((f, idx) => {
                    const cx = chartGeometry.getX(f.fraction);
                    const cy = chartGeometry.getY(f.score_mean);
                    const isHovered = hoveredPoint?.fraction === f.fraction;
                    const isFinal = idx === chartGeometry.fractions.length - 1;

                    if (f.skipped) {
                      return (
                        <g key={f.fraction}>
                          <circle
                            cx={cx}
                            cy={chartGeometry.padTop + chartGeometry.plotHeight}
                            r="5"
                            fill="#FFFFFF"
                            stroke="#69746A"
                            strokeWidth="1.5"
                            strokeDasharray="2,2"
                          />
                        </g>
                      );
                    }

                    return (
                      <g
                        key={f.fraction}
                        tabIndex={0}
                        role="button"
                        aria-label={`${Math.round(f.fraction * 100)}% training images: ${Math.round(f.score_mean * 100)}% score`}
                        onMouseEnter={() => setHoveredPoint(f)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onFocus={() => setHoveredPoint(f)}
                        onBlur={() => setHoveredPoint(null)}
                        className="cursor-pointer outline-none"
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 7.5 : 5}
                          fill="#FFFFFF"
                          stroke="#24543D"
                          strokeWidth={isHovered ? 3.5 : 2.5}
                          className="transition-all duration-150"
                        />
                        {/* Label final point with percentage */}
                        {isFinal && (
                          <g>
                            <rect
                              x={cx - 24}
                              y={cy - 26}
                              width="48"
                              height="20"
                              rx="6"
                              fill="#24543D"
                            />
                            <text
                              x={cx}
                              y={cy - 12}
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="bold"
                              fill="#FFFFFF"
                            >
                              {Math.round(f.score_mean * 100)}%
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Small callout on last segment */}
                  {summaryNumbers && chartGeometry.validPoints.length > 1 && (
                    <g>
                      <text
                        x={chartGeometry.width - chartGeometry.padRight}
                        y={chartGeometry.height - chartGeometry.padBottom + 38}
                        textAnchor="end"
                        fontSize="10.5"
                        fontWeight="bold"
                        fill={summaryNumbers.lastGainPoints > 0 ? '#24543D' : '#69746A'}
                      >
                        {summaryNumbers.lastGainPoints > 0
                          ? `+${summaryNumbers.lastGainPoints} points from last step`
                          : 'No real change on last step'}
                      </text>
                    </g>
                  )}

                  {/* X-Axis Ticks (fraction % and image count) */}
                  {chartGeometry.fractions.map((f) => {
                    const x = chartGeometry.getX(f.fraction);
                    const y = chartGeometry.padTop + chartGeometry.plotHeight;
                    const imgCount = Math.round(f.train_images_mean);

                    return (
                      <g key={f.fraction}>
                        <line x1={x} y1={y} x2={x} y2={y + 5} stroke="#D5DCD1" strokeWidth="1" />
                        <text
                          x={x}
                          y={y + 18}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="bold"
                          fill="#202923"
                        >
                          {Math.round(f.fraction * 100)}%
                        </text>
                        <text
                          x={x}
                          y={y + 31}
                          textAnchor="middle"
                          fontSize="9.5"
                          fontWeight="normal"
                          fill="#69746A"
                        >
                          {f.skipped ? 'skipped' : `${imgCount} imgs`}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Hover / Focus Tooltip Overlay */}
                {hoveredPoint && (
                  <div
                    className="absolute bg-white border border-[#D5DCD1] rounded-xl px-3 py-2 shadow-md text-[12px] text-[#202923] pointer-events-none z-20"
                    style={{
                      left: `${chartGeometry.getX(hoveredPoint.fraction)}px`,
                      top: `${Math.max(10, chartGeometry.getY(hoveredPoint.score_mean) - 50)}px`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="font-bold text-[#24543D]">
                      {Math.round(hoveredPoint.fraction * 100)}% training share ({Math.round(hoveredPoint.train_images_mean)} images)
                    </div>
                    <div className="text-[11.5px] text-[#69746A]">
                      Score: <strong className="text-[#202923] font-bold">{(hoveredPoint.score_mean * 100).toFixed(1)}%</strong> ± {(hoveredPoint.score_std * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>

              {/* Expandable "How to read this chart" */}
              <div className="pt-2 border-t border-[#D5DCD1]/60">
                <button
                  onClick={() => setIsChartHelpOpen(!isChartHelpOpen)}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-[#24543D] hover:underline cursor-pointer"
                >
                  <HelpCircle size={14} />
                  <span>{LEARNING_CURVE_COPY.chart.howToReadTitle}</span>
                  {isChartHelpOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {isChartHelpOpen && (
                  <ul className="mt-2.5 p-3.5 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl text-[12px] text-[#69746A] space-y-1.5">
                    {LEARNING_CURVE_COPY.chart.howToReadBullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#24543D] font-bold mt-0.5">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
           * 3. WHICH CLASSES WOULD GAIN
           * ------------------------------------------------------------- */}
          {resultData.per_class && resultData.per_class.length > 0 && (
            <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#D5DCD1]/60">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                    Class-Level Breakdown
                  </span>
                  <h3 className="font-serif font-bold text-[18px] text-[#202923] tracking-tight mt-0.5">
                    {LEARNING_CURVE_COPY.classes.title}
                  </h3>
                  <p className="text-[12px] text-[#69746A]">
                    {LEARNING_CURVE_COPY.classes.subtitle}
                  </p>
                </div>
              </div>

              {/* Rows with Two-Tone Horizontal Bars */}
              <div className="space-y-3.5">
                {resultData.per_class.map((c) => {
                  const basePct = Math.round(c.recall_baseline * 100);
                  const fullPct = Math.round(c.recall_full * 100);
                  const gainPoints = Math.round(c.gain * 100);

                  return (
                    <div
                      key={c.class_name}
                      className="p-3.5 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[13.5px] text-[#202923]">
                            {c.class_name}
                          </span>
                          {c.would_benefit && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#24543D]/10 text-[#24543D] border border-[#24543D]/20">
                              {LEARNING_CURVE_COPY.classes.wouldBenefitBadge}
                            </span>
                          )}
                        </div>

                        <div className="text-[12px] text-[#69746A]">
                          {LEARNING_CURVE_COPY.classes.gainLabel}:{' '}
                          <strong className={gainPoints > 0 ? 'text-[#24543D] font-bold' : 'text-[#69746A]'}>
                            {gainPoints > 0 ? `+${gainPoints} points` : `${gainPoints} points`}
                          </strong>{' '}
                          ({basePct}% → {fullPct}%)
                        </div>
                      </div>

                      {/* Two-tone bar */}
                      <div className="relative w-full h-3 bg-[#E7EAE4] rounded-full overflow-hidden border border-[#D5DCD1]">
                        {/* Baseline bar (25%) */}
                        <div
                          className="absolute left-0 top-0 h-full bg-[#52725D]/70 transition-all duration-300"
                          style={{ width: `${basePct}%` }}
                          title={`Score at 25% photos: ${basePct}%`}
                        />
                        {/* Gain extension to full dataset */}
                        {fullPct > basePct && (
                          <div
                            className="absolute top-0 h-full bg-[#24543D] transition-all duration-300"
                            style={{
                              left: `${basePct}%`,
                              width: `${fullPct - basePct}%`,
                            }}
                            title={`Gain with all photos: +${gainPoints} points`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
           * 4. LOOK-ALIKE CLASSES (Confused Pairs)
           * ------------------------------------------------------------- */}
          {resultData.confused_pairs && resultData.confused_pairs.length > 0 && (
            <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-2xs space-y-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                  Disambiguation Signals
                </span>
                <h3 className="font-serif font-bold text-[18px] text-[#202923] tracking-tight mt-0.5">
                  {LEARNING_CURVE_COPY.confusedPairs.title}
                </h3>
                <p className="text-[12px] text-[#69746A]">
                  {LEARNING_CURVE_COPY.confusedPairs.subtitle}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {resultData.confused_pairs.map((p, idx) => {
                  const ratePct = Math.round(p.rate * 100);
                  return (
                    <div
                      key={idx}
                      className="p-3.5 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl flex items-center justify-between gap-3 text-[12.5px]"
                    >
                      <div>
                        <span className="text-[#202923] font-semibold">
                          <strong className="text-[#202923] font-bold">{p.true_class}</strong> is mistaken for{' '}
                          <strong className="text-[#24543D] font-bold">{p.predicted_class}</strong>
                        </span>
                        <p className="text-[11.5px] text-[#69746A] mt-0.5">
                          Occurs in approximately {ratePct}% of test evaluations.
                        </p>
                      </div>

                      <div className="w-12 text-right font-extrabold text-[#24543D] text-[13px] shrink-0">
                        {ratePct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------
           * 5. IMAGES WORTH A SECOND LOOK (Mislabel Candidates)
           * ------------------------------------------------------------- */}
          {resultData.mislabel_candidates && resultData.mislabel_candidates.length > 0 && (
            <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#D5DCD1]/60">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#69746A]">
                    Audit Suggestions
                  </span>
                  <h3 className="font-serif font-bold text-[18px] text-[#202923] tracking-tight mt-0.5">
                    {LEARNING_CURVE_COPY.mislabel.title} ({resultData.mislabel_candidates.length})
                  </h3>
                  <p className="text-[12px] text-[#69746A]">
                    {LEARNING_CURVE_COPY.mislabel.subtitle}
                  </p>
                </div>

                <button
                  onClick={handleExportCsv}
                  className="px-3.5 py-1.5 bg-[#FCFAF6] hover:bg-[#E7EAE4] text-[#24543D] border border-[#D5DCD1] rounded-xl text-[12px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto shrink-0"
                >
                  <Download size={14} />
                  <span>{LEARNING_CURVE_COPY.mislabel.exportCsvButton}</span>
                </button>
              </div>

              {/* Thumbnail Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {displayedCandidates.map((c, i) => {
                  const confPct = Math.round(c.confidence * 100);
                  const isBroken = brokenImages[c.image_path];

                  return (
                    <div
                      key={i}
                      onClick={() => setEnlargedCandidate(c)}
                      className="bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl overflow-hidden cursor-pointer hover:border-[#24543D] transition-all group shadow-2xs flex flex-col"
                    >
                      {/* Image Thumbnail */}
                      <div className="relative aspect-square w-full bg-[#E7EAE4] flex items-center justify-center overflow-hidden">
                        {c.image_url && !isBroken ? (
                          <img
                            src={c.image_url}
                            alt={`Candidate photo labelled ${c.labelled_class}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={() => setBrokenImages((prev) => ({ ...prev, [c.image_path]: true }))}
                          />
                        ) : (
                          <div className="text-center p-2 text-[#69746A] text-[10.5px]">
                            <Eye size={18} className="mx-auto mb-1 opacity-50" />
                            <span>Photo preview</span>
                          </div>
                        )}
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white font-mono text-[9.5px] font-bold">
                          {confPct}%
                        </span>
                      </div>

                      {/* Metadata */}
                      <div className="p-2 space-y-0.5 text-[11px] leading-tight flex-1 flex flex-col justify-between">
                        <div className="text-[#69746A]">
                          Labelled: <strong className="text-[#202923] font-bold">{c.labelled_class}</strong>
                        </div>
                        <div className="text-[#24543D]">
                          Looks like: <strong className="font-bold">{c.predicted_class}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show All Toggle if > 12 */}
              {resultData.mislabel_candidates.length > 12 && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setShowAllMislabels(!showAllMislabels)}
                    className="text-[12px] font-bold text-[#24543D] hover:underline cursor-pointer"
                  >
                    {showAllMislabels
                      ? LEARNING_CURVE_COPY.mislabel.showFewerButton
                      : LEARNING_CURVE_COPY.mislabel.showAllButton}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------------------------------------
           * 6. HOW THIS WAS MEASURED (Collapsed Drawer)
           * ------------------------------------------------------------- */}
          <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl p-5 shadow-2xs">
            <button
              onClick={() => setIsMethodologyOpen(!isMethodologyOpen)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Info size={16} className="text-[#24543D]" />
                <h4 className="font-serif font-bold text-[16px] text-[#202923]">
                  {LEARNING_CURVE_COPY.methodology.title}
                </h4>
              </div>
              {isMethodologyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {isMethodologyOpen && (
              <div className="mt-4 pt-4 border-t border-[#D5DCD1]/60 text-[12.5px] text-[#69746A] space-y-2.5 leading-relaxed">
                <p>{LEARNING_CURVE_COPY.methodology.body}</p>
                <p className="p-3 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl text-[12px] text-[#202923]">
                  {LEARNING_CURVE_COPY.methodology.caveatsNote}
                </p>
                <div className="flex items-center gap-4 text-[11.5px] font-semibold text-[#69746A] pt-1">
                  <span>Images analyzed: {resultData.images_used?.toLocaleString()}</span>
                  <span>•</span>
                  <span>Classes: {resultData.num_classes}</span>
                  <span>•</span>
                  <span>Grouping: {resultData.grouping}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * IMAGE PREVIEW ENLARGE MODAL
       * ------------------------------------------------------------- */}
      {enlargedCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#FCFAF6] border border-[#D5DCD1] rounded-2xl max-w-lg w-full overflow-hidden shadow-xl space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h4 className="font-serif font-bold text-[16px] text-[#202923]">
                Mislabel Review Suggestion
              </h4>
              <button
                onClick={() => setEnlargedCandidate(null)}
                className="text-[#69746A] hover:text-[#202923] p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="aspect-square w-full rounded-xl overflow-hidden bg-[#E7EAE4] flex items-center justify-center border border-[#D5DCD1]">
              {enlargedCandidate.image_url ? (
                <img
                  src={enlargedCandidate.image_url}
                  alt={enlargedCandidate.image_path}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-[12px] text-[#69746A]">No image preview available</div>
              )}
            </div>

            <div className="p-3 bg-[#F7F5EE] border border-[#D5DCD1] rounded-xl text-[12.5px] space-y-1">
              <div>
                <span className="text-[#69746A]">Labelled as:</span>{' '}
                <strong className="text-[#202923] font-bold">{enlargedCandidate.labelled_class}</strong>
              </div>
              <div>
                <span className="text-[#69746A]">Test model suggests:</span>{' '}
                <strong className="text-[#24543D] font-bold">
                  {enlargedCandidate.predicted_class} ({Math.round(enlargedCandidate.confidence * 100)}% confidence)
                </strong>
              </div>
              <p className="text-[11px] text-[#69746A] pt-1">
                Path: {enlargedCandidate.image_path}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
