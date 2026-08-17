import React from 'react';
import { ArrowLeft, AlertTriangle, Shield, CheckCircle, HelpCircle, Image as ImageIcon } from 'lucide-react';

export default function DuplicatesDashboard({ dataset, duplicateGroups, onBack }) {
  // Use React state to track expanded/collapsed state of each group row
  const [expandedGroups, setExpandedGroups] = React.useState({});

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Helper to categorize group based on confidence score (threshold 95%)
  const getGroupCategory = (group) => {
    const score = group.duplicate_group_confidence_score;
    // Assume exact match or missing score defaults to Duplicate (>= 95%)
    if (score === null || score >= 0.95) {
      return {
        label: 'Duplicate',
        colorClass: 'bg-rose-50 text-rose-600 border border-rose-100'
      };
    } else {
      return {
        label: 'Visually Similar',
        colorClass: 'bg-amber-50 text-amber-600 border border-amber-100'
      };
    }
  };

  // Categorize duplicate groups
  const duplicates = duplicateGroups.filter(g => {
    const cat = getGroupCategory(g);
    return cat.label === 'Duplicate';
  });

  const visuallySimilar = duplicateGroups.filter(g => {
    const cat = getGroupCategory(g);
    return cat.label === 'Visually Similar';
  });

  // Calculate total redundant images (only in Duplicate groups)
  const totalDuplicatesCount = duplicates.reduce((acc, g) => {
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
        {/* Duplicate Groups Card */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Duplicate Groups
            </p>
            <p className="text-[20px] font-extrabold text-slate-700 mt-1.5 leading-none">
              {duplicates.length}
            </p>
          </div>
        </div>

        {/* Visually Similar Groups Card */}
        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
            <HelpCircle size={20} />
          </div>
          <div>
            <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Visually Similar Groups
            </p>
            <p className="text-[20px] font-extrabold text-slate-700 mt-1.5 leading-none">
              {visuallySimilar.length}
            </p>
          </div>
        </div>

        {/* Total Redundant Images Card */}
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

        {/* Dataset Domain Route Card */}
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
            No groups found!
          </h3>
          <p className="text-[12.5px] text-slate-400 font-semibold mt-1 max-w-sm mx-auto">
            Your dataset is clean. All image files have unique pixel profiles and embeddings.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
            Identified Groups
          </p>
          
          <div className="grid grid-cols-1 gap-4">
            {duplicateGroups.map((group, gIdx) => {
              const category = getGroupCategory(group);
              const isExpanded = !!expandedGroups[group.duplicate_group_id || gIdx];
              const thumbnail = group.images[0]?.image_url;

              return (
                <div 
                  key={group.duplicate_group_id || gIdx}
                  className="bg-white border border-slate-100/80 rounded-2xl p-4.5 shadow-xs flex flex-col gap-4 transition-all duration-200"
                >
                  {/* Compact Row View */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      {/* Thumbnail Preview */}
                      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                        {thumbnail ? (
                          <img 
                            src={thumbnail} 
                            alt="Group Preview" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&q=80&w=400';
                            }}
                          />
                        ) : (
                          <ImageIcon className="text-slate-300" size={20} />
                        )}
                      </div>

                      {/* Labels and identification info */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-extrabold text-slate-800">
                            Group #{gIdx + 1}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${category.colorClass}`}>
                            {category.label}
                          </span>
                          {getMethodBadge(group.duplicate_group_detection_method)}
                          {getDomainRouteBadge(group.duplicate_group_domain_route)}
                        </div>
                        <p className="text-[11.5px] text-slate-400 font-semibold">
                          Contains {group.images.length} images
                        </p>
                      </div>
                    </div>

                    {/* Actions and confidence badge */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      {group.duplicate_group_confidence_score !== null && (
                        <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[10.5px] font-extrabold">
                          Confidence: {(group.duplicate_group_confidence_score * 100).toFixed(0)}%
                        </span>
                      )}
                      
                      <button
                        onClick={() => toggleGroup(group.duplicate_group_id || gIdx)}
                        className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                          isExpanded 
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' 
                            : 'bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 border-blue-200/50 hover:border-blue-300'
                        }`}
                      >
                        {isExpanded ? 'Hide images' : 'View images'}
                      </button>
                    </div>
                  </div>

                  {/* Image Grid (Only visible if expanded) */}
                  {isExpanded && (
                    <div className="pt-4 border-t border-slate-50 animate-in fade-in duration-200">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {group.images.map((img, iIdx) => (
                          <div 
                            key={img.duplicate_group_image_id || iIdx}
                            className="group relative bg-slate-50 border border-slate-100 rounded-xl overflow-hidden shadow-xs hover:shadow-sm transition-all"
                          >
                            {/* Image Preview */}
                            <div className="w-full aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
                              {img.image_url ? (
                                <img 
                                  src={img.image_url} 
                                  alt="Dataset item preview" 
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

                            {/* Image Label Details */}
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
                                <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase leading-none px-1.5 py-0.5 rounded ${category.colorClass}`}>
                                  {category.label === 'Duplicate' ? 'Duplicate' : 'Similar'}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
