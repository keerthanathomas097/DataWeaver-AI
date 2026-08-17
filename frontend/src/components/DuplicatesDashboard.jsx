import React from 'react';
import { ArrowLeft, AlertTriangle, Shield, CheckCircle, HelpCircle, FileText, Image as ImageIcon } from 'lucide-react';

export default function DuplicatesDashboard({ dataset, duplicateGroups, onBack }) {
  // Calculate total duplicates count
  const totalDuplicatesCount = duplicateGroups.reduce((acc, g) => {
    // Duplicates are images in the group that are NOT marked as original
    const duplicatesInGroup = g.images.filter(img => !img.is_original_flag).length;
    return acc + duplicatesInGroup;
  }, 0);

  const getMethodBadge = (method) => {
    switch (method) {
      case 'exact_hash':
        return (
          <span className="px-2.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-md text-[10.5px] font-bold uppercase tracking-wider">
            Exact Match
          </span>
        );
      case 'phash':
        return (
          <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md text-[10.5px] font-bold uppercase tracking-wider">
            Near-Duplicate
          </span>
        );
      case 'fusion_classifier':
        return (
          <span className="px-2.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-md text-[10.5px] font-bold uppercase tracking-wider">
            Visual Similarity
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 bg-slate-50 text-slate-600 border border-slate-100 rounded-md text-[10.5px] font-bold uppercase tracking-wider">
            {method}
          </span>
        );
    }
  };

  const getDomainRouteBadge = (route) => {
    const r = route ? route.toLowerCase() : '';
    if (r === 'photographic') {
      return (
        <span className="px-2 py-0.5 bg-teal-50 text-teal-600 border border-teal-100 rounded-md text-[10.5px] font-bold uppercase tracking-wider">
          Photographic
        </span>
      );
    } else if (r === 'non_photographic') {
      return (
        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-md text-[10.5px] font-bold uppercase tracking-wider">
          Non-Photographic
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Back Button and Title */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            title="Back to Datasets"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="font-extrabold text-[20px] text-slate-800 tracking-tight">
              Duplicate Review Dashboard
            </h2>
            <p className="text-[12px] text-slate-400 font-semibold mt-0.5">
              Dataset: <span className="text-slate-600">{dataset?.dataset_name}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Summary statistics bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Duplicate Groups
            </p>
            <p className="text-[20px] font-extrabold text-slate-700 mt-1.5 leading-none">
              {duplicateGroups.length}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <ImageIcon size={20} />
          </div>
          <div>
            <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Total Redundant Images
            </p>
            <p className="text-[20px] font-extrabold text-slate-700 mt-1.5 leading-none">
              {totalDuplicatesCount}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Dataset Domain Route
            </p>
            <p className="text-[15px] font-bold text-slate-700 mt-1.5 leading-none capitalize">
              {dataset?.dataset_domain || 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {duplicateGroups.length === 0 ? (
        <div className="bg-white border border-slate-100/80 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={24} />
          </div>
          <h3 className="font-extrabold text-[16px] text-slate-800">
            No duplicates found!
          </h3>
          <p className="text-[12.5px] text-slate-400 font-semibold mt-1 max-w-sm mx-auto">
            Your dataset is clean. All image files have unique pixel profiles and embeddings.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
            Identified Duplicate Groups
          </p>
          
          <div className="grid grid-cols-1 gap-6">
            {duplicateGroups.map((group, gIdx) => (
              <div 
                key={group.duplicate_group_id || gIdx}
                className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs flex flex-col gap-4.5"
              >
                {/* Card Header Info */}
                <div className="flex items-center justify-between border-b border-slate-50 pb-3 flex-wrap gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-bold text-slate-500">
                      Group #{gIdx + 1}
                    </span>
                    <span className="text-slate-300">•</span>
                    {getMethodBadge(group.duplicate_group_detection_method)}
                    {getDomainRouteBadge(group.duplicate_group_domain_route)}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-[11.5px] text-slate-400 font-bold">
                      {group.images.length} images
                    </span>
                    {group.duplicate_group_confidence_score !== null && (
                      <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded-lg text-[10.5px] font-extrabold">
                        Confidence: {(group.duplicate_group_confidence_score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Images grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {group.images.map((img, iIdx) => (
                    <div 
                      key={img.duplicate_group_image_id || iIdx}
                      className="group relative bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shadow-xs hover:shadow-sm transition-all"
                    >
                      {/* Image Thumbnail */}
                      <div className="w-full aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                        {img.image_url ? (
                          <img 
                            src={img.image_url} 
                            alt="Dataset duplicate preview" 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&q=80&w=400';
                            }}
                          />
                        ) : (
                          <ImageIcon className="text-slate-300" size={24} />
                        )}
                      </div>

                      {/* Path and badge footer */}
                      <div className="p-2.5 space-y-1 bg-white">
                        <p 
                          className="text-[9.5px] font-mono text-slate-400 truncate font-semibold"
                          title={img.image_storage_path}
                        >
                          {img.image_storage_path.split('/').pop()}
                        </p>
                        
                        {img.is_original_flag ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase leading-none border border-emerald-100">
                            Original
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded uppercase leading-none border border-rose-100">
                            Duplicate
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
