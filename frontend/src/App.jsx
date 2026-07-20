import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Compass, 
  FileText, 
  Folder, 
  Image as ImageIcon, 
  Plus, 
  Microscope, 
  Sprout, 
  Activity, 
  Database, 
  Copy, 
  AlertTriangle, 
  Lightbulb, 
  Zap,
  ArrowRight,
  Loader2,
  TrendingUp,
  ArrowLeft,
  UploadCloud,
  Brain,
  Eye,
  LineChart,
  Layers,
  Sparkles,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CreateWorkspaceModal from './components/CreateWorkspaceModal';
import { useAuth } from './context/AuthContext';
import { getDashboardData } from './api/mockData';
import * as workspaceApi from './api/workspaceApi';

// Map icon string names to React Lucide components
const iconMap = {
  Folder,
  Brain,
  Eye,
  Microscope,
  Sprout,
  Database,
  LineChart,
  Layers,
  FileText,
  Compass
};

// Detailed mock datasets for existing workspaces
const mockWorkspaceDatasets = {
  'brain-tumor-mri': [
    { name: 'Glioma Classification Set', format: 'JPEG', dimensions: '512 x 512', count: '1.8k images', size: '240 MB', date: '2 hours ago' },
    { name: 'Meningioma Diagnostic Scans', format: 'PNG', dimensions: '512 x 512', count: '1.5k images', size: '310 MB', date: '1 day ago' },
    { name: 'Pituitary Tumor MRI Collection', format: 'JPEG', dimensions: '256 x 256', count: '1.2k images', size: '110 MB', date: '3 days ago' },
    { name: 'Control Normal Scans', format: 'PNG', dimensions: '512 x 512', count: '20.0k images', size: '2.1 GB', date: '1 week ago' }
  ],
  'agricultural-leaf-disease': [
    { name: 'Tomato Leaf Rust Scans', format: 'JPEG', dimensions: '1024 x 768', count: '4.2k images', size: '620 MB', date: '1 day ago' },
    { name: 'Grape Leaf Rust Scans', format: 'JPEG', dimensions: '512 x 512', count: '3.5k images', size: '440 MB', date: '3 days ago' },
    { name: 'Apple Scab Collection', format: 'PNG', dimensions: '256 x 256', count: '5.1k images', size: '210 MB', date: '5 days ago' }
  ],
  'medical-image-classification': [
    { name: 'Chest X-Ray Pneumonia Dataset', format: 'JPEG', dimensions: '1024 x 1024', count: '8.5k images', size: '920 MB', date: '3 days ago' },
    { name: 'COVID-19 Chest Diagnostics', format: 'JPEG', dimensions: '512 x 512', count: '3.1k images', size: '310 MB', date: '5 days ago' },
    { name: 'Cardiomegaly Diagnostic Scans', format: 'PNG', dimensions: '1024 x 1024', count: '5.2k images', size: '640 MB', date: '1 week ago' }
  ],
  'chest-xray-pneumonia': [
    { name: 'Pneumonia Pediatric Scans', format: 'JPEG', dimensions: '1024 x 1024', count: '3.8k images', size: '410 MB', date: '5 days ago' },
    { name: 'Normal Control Pediatric Chests', format: 'JPEG', dimensions: '1024 x 1024', count: '1.8k images', size: '190 MB', date: '1 week ago' }
  ]
};

export default function App() {
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load initial workspace profile information
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await getDashboardData();
        let dbWorkspaces = [];
        try {
          dbWorkspaces = await workspaceApi.getWorkspaces();
        } catch (apiErr) {
          console.error('Failed to load workspaces from API, using mock', apiErr);
        }

        // If user has no workspaces in DB, let's pre-populate the DB with the mock workspaces!
        if (dbWorkspaces.length === 0) {
          const mockWorkspacesToCreate = [
            {
              name: 'Brain Tumor MRI Research',
              domain: 'Medical Imaging',
              description: 'Brain tumor dataset profiling, labeling and harmonization.'
            },
            {
              name: 'Agricultural Leaf Disease Study',
              domain: 'Agriculture',
              description: 'Tomato, Grape, and Apple leaf disease classification.'
            },
            {
              name: 'Medical Image Classification',
              domain: 'Medical Imaging',
              description: 'Multi-modal chest X-ray and diagnostic scan collections.'
            },
            {
              name: 'Chest X-Ray Pneumonia Diagnosis',
              domain: 'Medical Imaging',
              description: 'Pediatric chest scans control study.'
            }
          ];

          // Create mock workspaces in the DB
          for (const mockWs of mockWorkspacesToCreate) {
            try {
              await workspaceApi.createWorkspace(mockWs);
            } catch (err) {
              console.error('Error seeding mock workspace', err);
            }
          }
          
          // Re-fetch workspaces
          try {
            dbWorkspaces = await workspaceApi.getWorkspaces();
          } catch (err) {
            console.error('Error fetching after seed', err);
          }
        }

        // Map domain to dynamic category, color and icon on the frontend
        const mapDomainToVisuals = (domain) => {
          if (!domain) return { category: 'Other', color: '#64748B', iconName: 'Folder' };
          const lower = domain.toLowerCase();
          if (lower.includes('medical') || lower.includes('brain') || lower.includes('chest')) {
            return { category: 'Medical', color: '#3B82F6', iconName: 'Microscope' };
          }
          if (lower.includes('agriculture') || lower.includes('leaf') || lower.includes('crop') || lower.includes('plant')) {
            return { category: 'Agriculture', color: '#10B981', iconName: 'Sprout' };
          }
          if (lower.includes('biology') || lower.includes('clinical') || lower.includes('gene')) {
            return { category: 'Biology', color: '#8B5CF6', iconName: 'Activity' };
          }
          if (lower.includes('vision') || lower.includes('computer')) {
            return { category: 'Vision', color: '#6366F1', iconName: 'Eye' };
          }
          return { category: 'General', color: '#3B82F6', iconName: 'Folder' };
        };

        const mappedWorkspaces = dbWorkspaces.map(ws => {
          const visuals = mapDomainToVisuals(ws.research_domain);
          
          // Retain mock statistical values for the seeded original workspaces
          let datasetsCount = 0;
          let imagesCount = '0';
          let qualityScore = null;

          if (ws.name === 'Brain Tumor MRI Research') {
            datasetsCount = 6;
            imagesCount = '24.5k';
            qualityScore = 91;
          } else if (ws.name === 'Agricultural Leaf Disease Study') {
            datasetsCount = 4;
            imagesCount = '12.8k';
            qualityScore = 86;
          } else if (ws.name === 'Medical Image Classification') {
            datasetsCount = 8;
            imagesCount = '48.2k';
            qualityScore = 88;
          } else if (ws.name === 'Chest X-Ray Pneumonia Diagnosis') {
            datasetsCount = 3;
            imagesCount = '5.6k';
            qualityScore = 94;
          }

          return {
            id: ws.id,
            name: ws.name,
            domain: ws.research_domain,
            category: visuals.category,
            description: ws.description || '',
            color: visuals.color,
            iconName: visuals.iconName,
            datasetsCount: datasetsCount,
            imagesCount: imagesCount,
            imagesRaw: parseInt(imagesCount) || 0,
            qualityScore: qualityScore,
            collaborators: ['#3B82F6', '#10B981', '#6366F1'].slice(0, (datasetsCount % 3) + 1),
            status: 'Active',
            lastModified: 'Just now'
          };
        });

        // Update stats activeWorkspaces
        res.stats.activeWorkspaces.value = mappedWorkspaces.length;
        res.workspaces = mappedWorkspaces;

        setDashboardData(res);
        if (mappedWorkspaces.length > 0) {
          setActiveWorkspace(mappedWorkspaces[0].id);
        }
      } catch (err) {
        console.error('Error loading dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleCreateWorkspace = async (formData) => {
    try {
      const created = await workspaceApi.createWorkspace({
        name: formData.name,
        domain: formData.domain,
        description: formData.description
      });
      
      const mapDomainToVisuals = (domain) => {
        if (!domain) return { category: 'Other', color: '#64748B', iconName: 'Folder' };
        const lower = domain.toLowerCase();
        if (lower.includes('medical') || lower.includes('brain') || lower.includes('chest')) {
          return { category: 'Medical', color: '#3B82F6', iconName: 'Microscope' };
        }
        if (lower.includes('agriculture') || lower.includes('leaf') || lower.includes('crop') || lower.includes('plant')) {
          return { category: 'Agriculture', color: '#10B981', iconName: 'Sprout' };
        }
        if (lower.includes('biology') || lower.includes('clinical') || lower.includes('gene')) {
          return { category: 'Biology', color: '#8B5CF6', iconName: 'Activity' };
        }
        if (lower.includes('vision') || lower.includes('computer')) {
          return { category: 'Vision', color: '#6366F1', iconName: 'Eye' };
        }
        return { category: 'General', color: '#3B82F6', iconName: 'Folder' };
      };

      const visuals = mapDomainToVisuals(created.research_domain);

      const mappedCreated = {
        id: created.id,
        name: created.name,
        domain: created.research_domain,
        category: visuals.category,
        description: created.description || '',
        color: visuals.color,
        iconName: visuals.iconName,
        datasetsCount: 0,
        imagesCount: '0',
        imagesRaw: 0,
        qualityScore: null,
        collaborators: ['#3B82F6'],
        status: 'Active',
        lastModified: 'Just now'
      };

      setDashboardData(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          activeWorkspaces: {
            ...prev.stats.activeWorkspaces,
            value: prev.workspaces.length + 1
          }
        },
        workspaces: [mappedCreated, ...prev.workspaces]
      }));

      setActiveWorkspace(created.id);
      setActiveTab('workspace'); // Direct routing to empty workspace onboarding
    } catch (err) {
      console.error('Error creating workspace via backend API', err);
      alert('Failed to create workspace on backend. Check console for details.');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 size={36} className="text-blue-600 animate-spin" />
        <p className="text-slate-500 font-medium text-[14px]">
          Synthesizing workspace environment...
        </p>
      </div>
    );
  }

  const { user, stats, workspaces, insights, storage } = dashboardData;

  const displayUser = {
    name: authUser?.full_name || user.name,
    email: authUser?.email || user.email,
    role: user.role,
    avatar: user.avatar,
  };

  // Filter workspaces based on search query
  const filteredWorkspaces = workspaces.filter(ws =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (ws.domain && ws.domain.toLowerCase().includes(searchQuery.toLowerCase())) ||
    ws.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper resolving workspace categorizations
  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Medical': return Microscope;
      case 'Agriculture': return Sprout;
      case 'Biology': return Activity;
      default: return Database;
    }
  };

  // Helper resolving colors for active elements
  const getCategoryColor = (category) => {
    switch (category) {
      case 'Medical': return 'bg-blue-50 text-blue-600';
      case 'Agriculture': return 'bg-green-50 text-green-600';
      case 'Biology': return 'bg-purple-50 text-purple-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const getQualityColor = (score) => {
    if (score >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (score >= 80) return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-rose-50 text-rose-700 border-rose-100';
  };

  // Utility to render correct workspace color and icon dynamically
  const renderWorkspaceIcon = (ws, size = 18) => {
    const IconComponent = ws.iconName ? (iconMap[ws.iconName] || Folder) : getCategoryIcon(ws.category);
    const colorHex = ws.color || '#3B82F6';
    return (
      <div 
        style={{ backgroundColor: `${colorHex}12`, color: colorHex }}
        className="w-9.5 h-9.5 rounded-xl flex items-center justify-center shrink-0 border border-slate-100/10"
      >
        <IconComponent size={size} />
      </div>
    );
  };

  // Find currently active workspace
  const currentWorkspaceObj = workspaces.find(w => w.id === activeWorkspace) || workspaces[0];

  return (
    <div className="flex bg-slate-50/50 min-h-screen text-slate-800 antialiased font-sans">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Widget */}
        <Header 
          user={displayUser}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          setActiveWorkspace={(id) => {
            setActiveWorkspace(id);
            setActiveTab('workspace'); // redirects tab on select
          }}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Routing Area */}
        <main className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' ? (
            <div className="space-y-8 animate-in fade-in-50 duration-200">
              {/* Welcome banner */}
              <div>
                <h2 className="font-extrabold text-[24px] text-slate-900 tracking-tight">
                  Welcome back, {displayUser.name.split(' ')[0]}.
                </h2>
                <p className="text-[14px] text-slate-500 font-medium mt-1">
                  Continue building and engineering high-quality image datasets for your next AI project.
                </p>
              </div>

              {/* KPI metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white border border-slate-100/80 rounded-2xl p-4.5 hover:shadow-md transition-all duration-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Active Workspaces
                  </p>
                  <p className="text-[26px] font-extrabold text-slate-800 mt-2 leading-none">
                    {stats.activeWorkspaces.value}
                  </p>
                  <p className="text-[11px] font-semibold text-emerald-600 mt-2.5 flex items-center gap-1">
                    <TrendingUp size={12} />
                    <span>{stats.activeWorkspaces.change}</span>
                  </p>
                </div>

                <div className="bg-white border border-slate-100/80 rounded-2xl p-4.5 hover:shadow-md transition-all duration-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Datasets
                  </p>
                  <p className="text-[26px] font-extrabold text-slate-800 mt-2 leading-none">
                    {stats.datasets.value}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-3">
                    Connected repositories
                  </p>
                </div>

                <div className="bg-white border border-slate-100/80 rounded-2xl p-4.5 hover:shadow-md transition-all duration-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Images Managed
                  </p>
                  <p className="text-[26px] font-extrabold text-slate-800 mt-2 leading-none">
                    {stats.imagesManaged.value}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-3">
                    Unstructured files
                  </p>
                </div>

                <div className="bg-white border border-slate-100/80 rounded-2xl p-4.5 hover:shadow-md transition-all duration-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Storage
                  </p>
                  <p className="text-[26px] font-extrabold text-slate-800 mt-2 leading-none">
                    {stats.storage.value}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-3 text-slate-500 font-semibold">
                    {stats.storage.percentUsed}% consumed
                  </p>
                </div>

                <div className="bg-white border border-slate-100/80 rounded-2xl p-4.5 hover:shadow-md transition-all duration-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Merges
                  </p>
                  <p className="text-[26px] font-extrabold text-slate-800 mt-2 leading-none">
                    {stats.merges.value}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-3">
                    Unified outputs
                  </p>
                </div>

                <div className="bg-white border border-slate-100/80 rounded-2xl p-4.5 hover:shadow-md transition-all duration-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    AI Suggestions
                  </p>
                  <p className="text-[26px] font-extrabold text-purple-600 mt-2 leading-none">
                    {stats.aiSuggestions.value}
                  </p>
                  <p className="text-[11px] font-semibold text-purple-500 mt-2.5 flex items-center gap-1">
                    <Zap size={12} className="fill-purple-500" />
                    <span>{stats.aiSuggestions.actionable} actionable</span>
                  </p>
                </div>
              </div>

              {/* Grid Contents */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Left (Quick Actions + Workspaces List) */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Quick actions panel */}
                  <div className="space-y-4">
                    <h3 className="text-[12px] font-extrabold text-slate-400 uppercase tracking-widest">
                      Quick Actions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                      <div 
                        onClick={() => {
                          setActiveWorkspace(workspaces[0]?.id);
                          setActiveTab('workspace');
                        }}
                        className="bg-gradient-to-tr from-blue-600 via-blue-600 to-indigo-600 text-white rounded-2xl p-5 shadow-lg shadow-blue-600/10 hover:shadow-xl hover:shadow-blue-600/15 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between h-40 group relative overflow-hidden"
                      >
                        <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300">
                          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                          <Play size={18} className="fill-white stroke-none" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[15px] leading-tight">
                            Continue Workspace
                          </h4>
                          <p className="text-[12px] text-blue-100 font-medium mt-1">
                            {workspaces[0]?.name || 'Brain Tumor MRI Research'}
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => setActiveTab('discover')}
                        className="bg-white border border-slate-100/80 hover:border-slate-200 rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between h-40 group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <Compass size={20} className="group-hover:rotate-12 transition-transform" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[15px] text-slate-800 leading-tight">
                            Discover Dataset
                          </h4>
                          <p className="text-[12px] text-slate-400 font-medium mt-1">
                            Browse 50k+ public repos
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => setActiveTab('paper-analysis')}
                        className="bg-white border border-slate-100/80 hover:border-slate-200 rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between h-40 group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                          <FileText size={20} className="group-hover:scale-105 transition-transform" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[15px] text-slate-800 leading-tight">
                            Analyze Research Paper
                          </h4>
                          <p className="text-[12px] text-slate-400 font-medium mt-1">
                            Extract dataset specs from PDF
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Workspaces list panel */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[12px] font-extrabold text-slate-400 uppercase tracking-widest">
                        My Workspaces
                      </h3>
                      <button 
                        onClick={() => setActiveTab('workspaces')}
                        className="text-[13px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors hover:underline"
                      >
                        <span>View All</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {filteredWorkspaces.map((ws) => (
                        <div 
                          key={ws.id} 
                          onClick={() => {
                            setActiveWorkspace(ws.id);
                            setActiveTab('workspace');
                          }}
                          className="bg-white border border-slate-100/80 rounded-2xl p-5 hover:shadow-md hover:border-slate-200/80 transition-all duration-200 flex flex-col justify-between min-h-[170px] cursor-pointer group"
                        >
                          <div className="flex items-start justify-between">
                            {/* Color/Icon symbol */}
                            {renderWorkspaceIcon(ws, 18)}
                            
                            {/* Quality Score - Hidden if qualityScore is null */}
                            {ws.qualityScore !== null ? (
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getQualityColor(ws.qualityScore)}`}>
                                {ws.qualityScore}% QUALITY
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-1 rounded-md border border-slate-100 bg-slate-50 text-slate-400">
                                EMPTY
                              </span>
                            )}
                          </div>

                          <div className="mt-4">
                            <h4 className="font-bold text-slate-800 text-[16px] leading-tight group-hover:text-blue-600 transition-colors">
                              {ws.name}
                            </h4>
                            <div className="flex items-center gap-4 text-slate-400 mt-2.5">
                              <span className="flex items-center gap-1 text-[12px] font-medium">
                                <Folder size={14} className="text-slate-300" />
                                <span className="text-slate-500">{ws.datasetsCount}</span> Datasets
                              </span>
                              {ws.datasetsCount > 0 && (
                                <span className="flex items-center gap-1 text-[12px] font-medium">
                                  <ImageIcon size={14} className="text-slate-300" />
                                  <span className="text-slate-500">{ws.imagesCount}</span> Images
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-50 mt-4.5 pt-3.5">
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {ws.collaborators.map((color, idx) => (
                                <div 
                                  key={idx}
                                  style={{ backgroundColor: color }}
                                  className="w-5.5 h-5.5 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm"
                                >
                                  {String.fromCharCode(65 + idx)}
                                </div>
                              ))}
                            </div>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {ws.lastModified}
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* Dotted block creation action card */}
                      <div 
                        onClick={() => setIsModalOpen(true)}
                        className="border-2 border-dashed border-slate-200/80 hover:border-blue-400 bg-white hover:bg-blue-50/5 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[170px] cursor-pointer transition-all duration-200 group"
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 flex items-center justify-center mb-3.5 transition-colors">
                          <Plus size={20} />
                        </div>
                        <p className="font-bold text-[14px] text-slate-600 group-hover:text-blue-600 transition-colors">
                          Create New Workspace
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Setup a clean dataset workspace
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side Cards */}
                <div className="space-y-8">
                  <div className="bg-white border border-slate-100/80 rounded-2xl p-5.5 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-2 mb-4.5">
                      <Zap size={16} className="text-purple-500 fill-purple-500" />
                      <h3 className="text-[12px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                        AI Insights
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {insights.map((insight) => {
                        let badgeBg = 'bg-indigo-50 text-indigo-600';
                        let borderLeft = 'border-l-indigo-400';
                        if (insight.color === 'red') {
                          badgeBg = 'bg-rose-50 text-rose-600';
                          borderLeft = 'border-l-rose-400';
                        } else if (insight.color === 'emerald') {
                          badgeBg = 'bg-emerald-50 text-emerald-600';
                          borderLeft = 'border-l-emerald-400';
                        }
                        
                        return (
                          <div 
                            key={insight.id}
                            className={`p-4 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 border-l-4 ${borderLeft} rounded-xl transition-all duration-200`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${badgeBg}`}>
                                {insight.title}
                              </span>
                            </div>
                            <p className="text-[13px] text-slate-600 font-medium mt-2 leading-snug">
                              {insight.description}
                            </p>
                            <button className="text-[12px] font-bold text-blue-600 hover:text-blue-700 hover:underline mt-2.5 block text-left">
                              {insight.actionText}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100/80 rounded-2xl p-5.5 hover:shadow-md transition-shadow">
                    <h3 className="text-[12px] font-extrabold text-slate-400 uppercase tracking-widest">
                      Storage Overview
                    </h3>

                    <div className="flex items-baseline justify-between mt-3.5">
                      <span className="text-[13px] font-medium text-slate-500">
                        Used: <span className="text-slate-800 font-bold">{storage.used} TB</span>
                      </span>
                      <span className="text-[18px] font-extrabold text-slate-800">
                        {Math.round((storage.used / storage.total) * 100)}%
                      </span>
                    </div>

                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mt-3.5 flex">
                      <div 
                        style={{ width: `${(storage.datasetFiles / storage.total) * 100}%` }}
                        className="bg-blue-600 h-full"
                        title={`Dataset Files: ${storage.datasetFiles} TB`}
                      />
                      <div 
                        style={{ width: `${(storage.aiModels / storage.total) * 100}%` }}
                        className="bg-purple-500 h-full"
                        title={`AI Models: ${storage.aiModels} TB`}
                      />
                      <div 
                        style={{ width: `${(storage.otherFiles / storage.total) * 100}%` }}
                        className="bg-slate-300 h-full"
                        title={`Other Files: ${storage.otherFiles} TB`}
                      />
                    </div>

                    <div className="space-y-2 mt-5 border-t border-slate-50 pt-4">
                      <div className="flex items-center justify-between text-[12px] font-medium">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                          <span className="text-slate-500">Dataset Files</span>
                        </div>
                        <span className="text-slate-700 font-bold">{storage.datasetFiles} TB</span>
                      </div>

                      <div className="flex items-center justify-between text-[12px] font-medium">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                          <span className="text-slate-500">AI Models</span>
                        </div>
                        <span className="text-slate-700 font-bold">{storage.aiModels} TB</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          ) : activeTab === 'workspace' ? (
            /* Workspace Detail Page Routing */
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              
              {/* Back CTA */}
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-[13px] font-bold transition-colors group"
              >
                <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
                <span>Back to Dashboard</span>
              </button>

              {/* Workspace Header metadata */}
              <div className="bg-white border border-slate-100/80 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs">
                <div className="flex items-start gap-4">
                  {renderWorkspaceIcon(currentWorkspaceObj, 24)}
                  <div className="space-y-1">
                    <div className="flex items-center gap-3.5 flex-wrap">
                      <h2 className="font-extrabold text-[22px] text-slate-800 tracking-tight leading-tight">
                        {currentWorkspaceObj.name}
                      </h2>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-md">
                        {currentWorkspaceObj.domain || currentWorkspaceObj.category || 'General'}
                      </span>
                    </div>
                    {currentWorkspaceObj.description && (
                      <p className="text-[13px] text-slate-500 font-medium max-w-2xl leading-normal pt-1">
                        {currentWorkspaceObj.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right hand collaborators and actions */}
                <div className="flex items-center gap-4 border-t border-slate-50 md:border-t-0 pt-4 md:pt-0 shrink-0">
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Owner
                    </p>
                    <p className="text-[13px] font-bold text-slate-700 mt-0.5">
                      Keerthana Thomas
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-[12px] font-bold text-white shadow-sm ring-4 ring-blue-50">
                    KT
                  </div>
                </div>
              </div>

              {/* Check if workspace is empty (0 datasets) */}
              {currentWorkspaceObj.datasetsCount === 0 ? (
                /* Empty Onboarding State View */
                <div className="space-y-8">
                  {/* Empty onboarding notification block */}
                  <div className="bg-white border border-slate-100/80 rounded-2xl p-10 text-center max-w-3xl mx-auto shadow-xs border-dashed border-2 border-slate-200/80">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50/50 text-blue-600 flex items-center justify-center mx-auto mb-5.5">
                      <Folder size={28} className="stroke-[1.5]" />
                    </div>
                    <h3 className="font-extrabold text-[18px] text-slate-800">
                      This workspace doesn't contain any datasets yet.
                    </h3>
                    <p className="text-[13px] text-slate-400 font-medium max-w-md mx-auto mt-2 leading-relaxed">
                      Datasets are the lifeblood of DataWeaver. Import files, search repositories, or parse research specs using the pathways below.
                    </p>
                  </div>

                  {/* Three Large Action Cards */}
                  <div className="space-y-4.5 max-w-4xl mx-auto">
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest text-center">
                      Ways to Acquire Datasets
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Discover Card */}
                      <div 
                        onClick={() => setActiveTab('discover')}
                        className="bg-white border border-slate-100/80 hover:border-blue-200 rounded-2xl p-6 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group flex flex-col justify-between min-h-[190px]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 shrink-0 group-hover:rotate-12 transition-transform">
                          <Compass size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-[15px] leading-tight">
                            Discover Dataset
                          </h4>
                          <p className="text-[12px] text-slate-400 font-medium mt-2.5 leading-normal">
                            Search public repositories (Hugging Face, Kaggle, Zenodo) using semantic query descriptions.
                          </p>
                        </div>
                      </div>

                      {/* Upload Card */}
                      <div 
                        onClick={() => setActiveTab('upload')}
                        className="bg-white border border-slate-100/80 hover:border-blue-200 rounded-2xl p-6 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group flex flex-col justify-between min-h-[190px]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mb-5 shrink-0 group-hover:scale-105 transition-transform">
                          <UploadCloud size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-[15px] leading-tight">
                            Upload Dataset
                          </h4>
                          <p className="text-[12px] text-slate-400 font-medium mt-2.5 leading-normal">
                            Directly drag and drop or upload image folders from your local machine.
                          </p>
                        </div>
                      </div>

                      {/* Research Paper Card */}
                      <div 
                        onClick={() => setActiveTab('paper-analysis')}
                        className="bg-white border border-slate-100/80 hover:border-blue-200 rounded-2xl p-6 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group flex flex-col justify-between min-h-[190px]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5 shrink-0 group-hover:scale-105 transition-transform">
                          <FileText size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-[15px] leading-tight">
                            Upload Research Paper
                          </h4>
                          <p className="text-[12px] text-slate-400 font-medium mt-2.5 leading-normal">
                            Upload PDFs of research papers to extract and locate datasets referenced in studies.
                          </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                /* Loaded Workspace Detail Page (Displays mock datasets) */
                <div className="space-y-6">
                  {/* Statistics strip */}
                  <div className="grid grid-cols-3 gap-5">
                    <div className="bg-white border border-slate-100/80 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Folder size={18} />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Datasets Count
                        </p>
                        <p className="text-[17px] font-extrabold text-slate-700 mt-1 leading-none">
                          {currentWorkspaceObj.datasetsCount}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-100/80 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <ImageIcon size={18} />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Images Count
                        </p>
                        <p className="text-[17px] font-extrabold text-slate-700 mt-1 leading-none">
                          {currentWorkspaceObj.imagesCount}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-100/80 rounded-xl p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Quality Score
                        </p>
                        <p className="text-[17px] font-extrabold text-emerald-600 mt-1 leading-none">
                          {currentWorkspaceObj.qualityScore}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Datasets Table */}
                  <div className="bg-white border border-slate-100/80 rounded-2xl overflow-hidden shadow-xs">
                    <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between">
                      <h3 className="font-bold text-[15px] text-slate-800">
                        Workspace Datasets ({currentWorkspaceObj.datasetsCount})
                      </h3>
                      
                      <button 
                        onClick={() => setActiveTab('upload')}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12px] font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Plus size={14} />
                        <span>Add Dataset</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="px-5 py-3">Dataset Name</th>
                            <th className="px-5 py-3">Format</th>
                            <th className="px-5 py-3">Dimensions</th>
                            <th className="px-5 py-3">File Count</th>
                            <th className="px-5 py-3">Size</th>
                            <th className="px-5 py-3">Added</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-slate-600 font-medium">
                          {(mockWorkspaceDatasets[currentWorkspaceObj.id] || []).map((ds, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                              <td className="px-5 py-3.5 text-slate-800 font-bold">{ds.name}</td>
                              <td className="px-5 py-3.5">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-bold">
                                  {ds.format}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 font-mono text-[12px]">{ds.dimensions}</td>
                              <td className="px-5 py-3.5 text-slate-700 font-semibold">{ds.count}</td>
                              <td className="px-5 py-3.5">{ds.size}</td>
                              <td className="px-5 py-3.5 text-slate-400">{ds.date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Actions Dashboard Panel */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <button 
                      onClick={() => setActiveTab('profiling')}
                      className="p-4 bg-white border border-slate-100/80 hover:border-blue-300 rounded-xl font-bold text-slate-700 hover:text-blue-600 hover:shadow-xs transition-all flex items-center justify-between group"
                    >
                      <span className="text-[13px]">Profile Datasets</span>
                      <RefreshCw size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </button>
                    
                    <button 
                      onClick={() => setActiveTab('labels')}
                      className="p-4 bg-white border border-slate-100/80 hover:border-blue-300 rounded-xl font-bold text-slate-700 hover:text-blue-600 hover:shadow-xs transition-all flex items-center justify-between group"
                    >
                      <span className="text-[13px]">Manage AI Labels</span>
                      <ArrowRight size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </button>

                    <button 
                      onClick={() => setActiveTab('duplicates')}
                      className="p-4 bg-white border border-slate-100/80 hover:border-blue-300 rounded-xl font-bold text-slate-700 hover:text-blue-600 hover:shadow-xs transition-all flex items-center justify-between group"
                    >
                      <span className="text-[13px]">Check duplicates</span>
                      <ArrowRight size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </button>

                    <button 
                      onClick={() => setActiveTab('merge-advisor')}
                      className="p-4 bg-white border border-slate-100/80 hover:border-blue-300 rounded-xl font-bold text-slate-700 hover:text-blue-600 hover:shadow-xs transition-all flex items-center justify-between group"
                    >
                      <span className="text-[13px]">Merge Datasets</span>
                      <ArrowRight size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </button>
                  </div>

                </div>
              )}

            </div>
          ) : activeTab === 'workspaces' ? (
            /* Catalog of All Workspaces page */
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-extrabold text-[22px] text-slate-800 tracking-tight">
                    Project Workspaces
                  </h2>
                  <p className="text-[13px] text-slate-400 font-medium">
                    Select a workspace to manage or profile its underlying datasets
                  </p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/10 hover:shadow-lg transition-all"
                >
                  <Plus size={16} />
                  <span>Create Workspace</span>
                </button>
              </div>

              {/* Workspaces list */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filteredWorkspaces.map((ws) => (
                  <div 
                    key={ws.id} 
                    onClick={() => {
                      setActiveWorkspace(ws.id);
                      setActiveTab('workspace');
                    }}
                    className="bg-white border border-slate-100/80 rounded-2xl p-5 hover:shadow-md hover:border-slate-200/80 transition-all duration-200 flex flex-col justify-between min-h-[170px] cursor-pointer group"
                  >
                    <div className="flex items-start justify-between">
                      {renderWorkspaceIcon(ws, 18)}
                      {ws.qualityScore !== null ? (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getQualityColor(ws.qualityScore)}`}>
                          {ws.qualityScore}% QUALITY
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-md border border-slate-100 bg-slate-50 text-slate-400">
                          EMPTY
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      <h4 className="font-bold text-slate-800 text-[16px] leading-tight group-hover:text-blue-600 transition-colors">
                        {ws.name}
                      </h4>
                      <div className="flex items-center gap-4 text-slate-400 mt-2.5">
                        <span className="flex items-center gap-1 text-[12px] font-medium">
                          <Folder size={14} className="text-slate-300" />
                          <span className="text-slate-500">{ws.datasetsCount}</span> Datasets
                        </span>
                        {ws.datasetsCount > 0 && (
                          <span className="flex items-center gap-1 text-[12px] font-medium">
                            <ImageIcon size={14} className="text-slate-300" />
                            <span className="text-slate-500">{ws.imagesCount}</span> Images
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-50 mt-4.5 pt-3.5">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {ws.collaborators.map((color, idx) => (
                          <div 
                            key={idx}
                            style={{ backgroundColor: color }}
                            className="w-5.5 h-5.5 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm"
                          >
                            {String.fromCharCode(65 + idx)}
                          </div>
                        ))}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {ws.lastModified}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Sub-module View Placeholder */
            <div className="bg-white border border-slate-100/80 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-6 shadow-sm my-12 animate-in fade-in-50 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Database size={32} />
              </div>
              <div className="space-y-2">
                <h2 className="font-extrabold text-[20px] text-slate-800 capitalize">
                  {activeTab.replace('-', ' ')} Module
                </h2>
                <p className="text-[14px] text-slate-500 max-w-md mx-auto">
                  This sub-module handles advanced data operations. In subsequent sprints, we will hook it up directly to FastAPI schemas and ChromaDB datasets.
                </p>
              </div>
              
              <div className="border-t border-slate-50 pt-6 flex justify-center gap-3">
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[13px] font-semibold hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/5"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Creation Modal */}
      <CreateWorkspaceModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateWorkspace}
      />
    </div>
  );
}
