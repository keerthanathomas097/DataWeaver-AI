import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Compass, 
  UploadCloud, 
  FolderOpen, 
  BarChart3, 
  GitMerge, 
  Tags, 
  Copy, 
  History, 
  Download, 
  BookOpen, 
  Settings, 
  HelpCircle 
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab }) {
  const mainNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'discover', label: 'Discover Datasets', icon: Compass },
    { id: 'upload', label: 'Upload Dataset', icon: UploadCloud },
    { id: 'workspaces', label: 'Workspaces', icon: FolderOpen },
  ];

  const analysisTools = [
    { id: 'profiling', label: 'Dataset Profiling', icon: BarChart3 },
    { id: 'merge-advisor', label: 'Merge Advisor', icon: GitMerge },
    { id: 'labels', label: 'AI Label Management', icon: Tags },
    { id: 'duplicates', label: 'Duplicate Detection', icon: Copy },
    { id: 'snapshots', label: 'Snapshot History', icon: History },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'paper-analysis', label: 'Research Paper Analysis', icon: BookOpen },
  ];

  const footerNav = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
  ];

  const renderNavItems = (items) => {
    return items.map((item) => {
      const Icon = item.icon;
      const isActive = activeTab === item.id;
      return (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-[14px] font-medium transition-all duration-200 group ${
            isActive
              ? 'bg-blue-50 text-blue-600 shadow-[0_2px_8px_rgba(59,130,246,0.06)]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Icon 
            size={18} 
            className={`transition-colors duration-200 ${
              isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
            }`} 
          />
          <span>{item.label}</span>
        </button>
      );
    });
  };

  return (
    <aside className="w-64 border-r border-slate-100 bg-white flex flex-col h-screen sticky top-0 shrink-0">
      {/* Brand Header */}
      <div className="px-6 py-5.5 flex items-center gap-3 border-b border-slate-100/60">
        {/* Customized Premium Logo */}
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/10">
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="white" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M4 12V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <path d="M9 12h6" />
            <circle cx="12" cy="12" r="2" fill="white" />
          </svg>
        </div>
        <div>
          <h1 className="font-extrabold text-[17px] text-slate-800 tracking-tight leading-none">
            DataWeaver <span className="text-blue-600">AI</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 tracking-wider mt-1 uppercase">
            Enterprise ML Platform
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7 scrollbar-thin">
        {/* Main section */}
        <div className="space-y-1">
          {renderNavItems(mainNav)}
        </div>

        {/* Analysis Tools Section */}
        <div className="space-y-1">
          <p className="px-4 text-[10px] font-bold text-slate-400 tracking-widest uppercase mb-2">
            Analysis Tools
          </p>
          {renderNavItems(analysisTools)}
        </div>
      </div>

      {/* Footer Nav */}
      <div className="p-4 border-t border-slate-100/80 space-y-1 bg-slate-50/50">
        {renderNavItems(footerNav)}
      </div>
    </aside>
  );
}
