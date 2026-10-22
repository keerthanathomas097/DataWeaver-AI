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
  HelpCircle,
  ShieldAlert,
  Users
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, isAdmin }) {
  const mainNav = isAdmin
    ? [
        { id: 'admin-dashboard', label: 'Admin Dashboard', icon: LayoutDashboard },
        { id: 'admin-users', label: 'User Management', icon: Users },
      ]
    : [
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
          className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 group ${
            isActive
              ? 'bg-[#24543D]/10 text-[#24543D] font-bold border-l-3 border-[#24543D] shadow-2xs'
              : 'text-[#52725D] hover:text-[#202923] hover:bg-[#E7EAE4]/60'
          }`}
        >
          <Icon 
            size={18} 
            className={`transition-colors duration-200 shrink-0 ${
              isActive ? 'text-[#24543D]' : 'text-[#69746A] group-hover:text-[#24543D]'
            }`} 
          />
          <span className="truncate">{item.label}</span>
        </button>
      );
    });
  };

  return (
    <aside className="w-64 border-r border-[#D5DCD1] bg-[#FCFAF6] flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="px-6 py-5 flex items-center gap-3 border-b border-[#D5DCD1]/80">
        {/* Research Atlas Brand Mark */}
        <div className="w-9 h-9 rounded-xl bg-[#24543D] border border-[#C7D86B]/30 flex items-center justify-center shadow-xs shadow-[#24543D]/20 shrink-0">
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#F7F5EE" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M4 12V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <path d="M9 12h6" />
            <circle cx="12" cy="12" r="2" fill="#C7D86B" />
          </svg>
        </div>
        <div>
          <h1 className="font-serif font-bold text-[17px] text-[#202923] tracking-tight leading-none">
            DataWeaver <span className="text-[#24543D] font-sans font-bold text-[12px] px-1.5 py-0.2 rounded bg-[#24543D]/10 border border-[#24543D]/20 align-middle ml-0.5">AI</span>
          </h1>
          <p className="text-[9.5px] font-bold text-[#69746A] tracking-wider mt-1 uppercase">
            Scientific Research Atlas
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3.5 py-5 space-y-6 scrollbar-thin">
        {/* Main section */}
        <div className="space-y-1">
          {renderNavItems(mainNav)}
        </div>

        {/* Analysis Tools Section */}
        {!isAdmin && (
          <div className="space-y-1 pt-1">
            <p className="px-4 text-[10px] font-bold text-[#69746A] tracking-widest uppercase mb-2">
              Analysis Tools
            </p>
            {renderNavItems(analysisTools)}
          </div>
        )}
      </div>

      {/* Footer Nav */}
      <div className="p-3.5 border-t border-[#D5DCD1]/80 space-y-1 bg-[#F7F5EE]/70">
        {renderNavItems(footerNav)}
      </div>
    </aside>
  );
}
