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
  CheckCircle2,
  Users,
  Shield,
  Search,
  Lock,
  X,
  Check,
  Tag,
  Trash2
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import CreateWorkspaceModal from './components/CreateWorkspaceModal';
import DiscoverDatasets from './components/DiscoverDatasets';
import DuplicatesDashboard from './components/DuplicatesDashboard';
import { useAuth } from './context/AuthContext';
import { getDashboardData } from './api/mockData';
import * as workspaceApi from './api/workspaceApi';
import * as authApi from './api/authApi';
import { getWorkspaceDatasets, detectDuplicates, getDatasetErrorMessage, getDuplicateStatus, getDuplicateGroups, cancelJob } from './api/datasetApi';

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

function AdminDashboardView({ setActiveTab }) {
  const [stats, setStats] = useState({
    totalUsers: 0,
    responseTime: '14ms',
    dbStatus: 'Connected',
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchAdminStats = async () => {
      try {
        const usersList = await authApi.getUsers();
        setStats(prev => ({
          ...prev,
          totalUsers: usersList.length,
        }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchAdminStats();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-200">
      <div>
        <h2 className="font-extrabold text-[24px] text-slate-900 tracking-tight">
          Admin Command Center
        </h2>
        <p className="text-[14px] text-slate-500 font-medium mt-1">
          System status monitoring, security logging, and enterprise user access control.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Users</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users size={16} />
            </div>
          </div>
          <p className="text-[28px] font-extrabold text-slate-800 mt-3">
            {loadingStats ? <Loader2 size={20} className="animate-spin text-slate-400" /> : stats.totalUsers}
          </p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-2">Active registered accounts</p>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">System Health</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Activity size={16} />
            </div>
          </div>
          <p className="text-[28px] font-extrabold text-slate-800 mt-3">Healthy</p>
          <p className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            All nodes online
          </p>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Database Status</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Database size={16} />
            </div>
          </div>
          <p className="text-[28px] font-extrabold text-slate-800 mt-3">{stats.dbStatus}</p>
          <p className="text-[11px] text-purple-600 font-semibold mt-2">PostgreSQL 15 Cluster</p>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">API Latency</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Zap size={16} />
            </div>
          </div>
          <p className="text-[28px] font-extrabold text-slate-800 mt-3">{stats.responseTime}</p>
          <p className="text-[11px] text-slate-400 font-medium mt-2">Average response threshold</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white border border-slate-100/80 rounded-2xl p-6 space-y-4">
          <h3 className="text-[15px] font-bold text-slate-800">System Activity Log</h3>
          <div className="divide-y divide-slate-50 text-[13px]">
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-700">API GET /auth/users called</p>
                <p className="text-slate-400 text-[11px]">System Administrator fetched user directory</p>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">Just now</span>
            </div>
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-700">Database Connection verified</p>
                <p className="text-slate-400 text-[11px]">Connection active pool size: 8</p>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">5 min ago</span>
            </div>
            <div className="py-3 flex justify-between items-center">
              <div>
                <p className="font-semibold text-slate-700">Token Issuer verified</p>
                <p className="text-slate-400 text-[11px]">Enforced JWT signature validation HS256</p>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">10 min ago</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-100/80 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-slate-800">Administrative Tasks</h3>
            <p className="text-[13px] text-slate-400 mt-1">Quick links to platform utilities.</p>
          </div>
          <div className="space-y-3">
            <button 
              onClick={() => setActiveTab('admin-users')}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-100 rounded-xl text-slate-700 hover:text-blue-600 transition-all font-bold text-[13px] group"
            >
              <span>Manage Users & Roles</span>
              <ArrowRight size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            </button>
            <button 
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-100 rounded-xl text-slate-700 hover:text-blue-600 transition-all font-bold text-[13px] group"
              onClick={() => alert("Enterprise backup created successfully!")}
            >
              <span>Backup System Registry</span>
              <ArrowRight size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminUsersView() {
  const { user: authUser } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState(null);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const data = await authApi.getUsers();
      setUsersList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleAdmin = async (userId, currentIsAdmin) => {
    if (userId === authUser?.id) {
      alert("You cannot revoke your own administrator privileges.");
      return;
    }
    try {
      setTogglingId(userId);
      await authApi.toggleAdmin(userId);
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, is_admin: !currentIsAdmin } : u));
    } catch (err) {
      console.error("Failed to toggle admin role", err);
      alert(err?.response?.data?.detail || "Failed to update user role.");
    } finally {
      setTogglingId(null);
    }
  };

  const filteredUsers = usersList.filter(u => 
    u.email.toLowerCase().includes(search.toLowerCase()) || 
    (u.full_name && u.full_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[22px] text-slate-800 tracking-tight">
            User Directory
          </h2>
          <p className="text-[13px] text-slate-400 font-medium">
            View registered credentials, monitor roles, and assign administrative capabilities.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-100/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9.5 pr-4 py-2 text-[13px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all"
            />
          </div>
          <div className="text-[12px] text-slate-400 font-medium">
            Showing {filteredUsers.length} of {usersList.length} users
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                <th className="px-6 py-3.5 text-[10px]">Name</th>
                <th className="px-6 py-3.5 text-[10px]">Email Address</th>
                <th className="px-6 py-3.5 text-[10px]">Role Status</th>
                <th className="px-6 py-3.5 text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-600">
              {loadingUsers ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="animate-spin text-blue-600" size={24} />
                      <span className="text-slate-400 text-[13px]">Fetching user records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-400">
                    No matching user accounts found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(userItem => (
                  <tr key={userItem.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {userItem.full_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono">
                      {userItem.email}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        userItem.is_admin 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                          : 'bg-slate-50 text-slate-500 border border-slate-200'
                      }`}>
                        {userItem.is_admin ? 'ADMINISTRATOR' : 'RESEARCHER'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        disabled={togglingId === userItem.id || userItem.id === authUser?.id}
                        onClick={() => handleToggleAdmin(userItem.id, userItem.is_admin)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          userItem.is_admin
                            ? 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100'
                            : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {togglingId === userItem.id ? (
                          <Loader2 size={12} className="animate-spin mx-auto" />
                        ) : userItem.is_admin ? (
                          'Demote to User'
                        ) : (
                          'Promote to Admin'
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  useEffect(() => {
    if (authUser && !hasInitializedTab) {
      setActiveTab(authUser.is_admin ? 'admin-dashboard' : 'dashboard');
      setHasInitializedTab(true);
    }
  }, [authUser, hasInitializedTab]);
  const [activeWorkspace, setActiveWorkspace] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workspaceDatasets, setWorkspaceDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [secondMergeDataset, setSecondMergeDataset] = useState(null);
  const [detectingDuplicates, setDetectingDuplicates] = useState(false);
  const [pollingDatasetId, setPollingDatasetId] = useState(null);
  const [pollingStatus, setPollingStatus] = useState(null);
  const [justCompletedScanDatasetId, setJustCompletedScanDatasetId] = useState(null);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [showDuplicatesDashboard, setShowDuplicatesDashboard] = useState(false);
  const [loadingDuplicateGroups, setLoadingDuplicateGroups] = useState(false);
  const [cancellingJob, setCancellingJob] = useState(false);
  const [removingDataset, setRemovingDataset] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);

  // Poll for duplicate detection progress
  useEffect(() => {
    if (!pollingDatasetId) return;

    let intervalId = setInterval(async () => {
      try {
        const data = await getDuplicateStatus(pollingDatasetId);
        const status = data.dataset_status;
        setPollingStatus(status);
        
        // Update in the datasets list
        setWorkspaceDatasets(prev => 
          prev.map(ds => ds.dataset_id === pollingDatasetId ? { ...ds, dataset_status: status } : ds)
        );
        
        // If selected dataset is the one being polled, update its status
        if (selectedDataset && selectedDataset.dataset_id === pollingDatasetId) {
          setSelectedDataset(prev => ({ ...prev, dataset_status: status }));
        }

        if (status === 'duplicates_detected') {
          clearInterval(intervalId);
          setPollingDatasetId(null);
          setPollingStatus(null);
          setJustCompletedScanDatasetId(pollingDatasetId);
          // Automatically fetch duplicate groups and show dashboard
          setLoadingDuplicateGroups(true);
          try {
            const groups = await getDuplicateGroups(pollingDatasetId);
            setDuplicateGroups(groups);
            setShowDuplicatesDashboard(true);
          } catch (err) {
            console.error("Failed to fetch duplicate groups:", err);
          } finally {
            setLoadingDuplicateGroups(false);
          }
        } else if (status === 'duplicate_detection_failed' || status === 'cancelled') {
          clearInterval(intervalId);
          setPollingDatasetId(null);
          setPollingStatus(null);
        }
      } catch (err) {
        console.error("Error polling duplicate status:", err);
      }
    }, 2500);

    return () => clearInterval(intervalId);
  }, [pollingDatasetId, selectedDataset]);

  // Monitor selectedDataset changes to resume polling automatically if needed
  useEffect(() => {
    if (selectedDataset) {
      const status = selectedDataset.dataset_status;
      if (['downloading', 'downloaded', 'detecting_duplicates'].includes(status)) {
        setPollingDatasetId(selectedDataset.dataset_id);
        setPollingStatus(status);
      } else {
        setPollingStatus(null);
      }
    } else {
      setPollingStatus(null);
      setShowDuplicatesDashboard(false);
    }
    setJustCompletedScanDatasetId(null);
  }, [selectedDataset?.dataset_id]);

  useEffect(() => {
    setSelectedDataset(null);
    setMergeMode(false);
    setSecondMergeDataset(null);
    setIsAddMenuOpen(false);
    setShowDuplicatesDashboard(false);
    setDuplicateGroups([]);
  }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace || activeTab !== 'workspace') {
      return;
    }
    let isMounted = true;
    const fetchDatasets = async () => {
      setLoadingDatasets(true);
      try {
        const data = await getWorkspaceDatasets(activeWorkspace);
        if (isMounted) {
          setWorkspaceDatasets(data);
        }
      } catch (err) {
        console.error('Failed to load workspace datasets:', err);
      } finally {
        if (isMounted) {
          setLoadingDatasets(false);
        }
      }
    };
    fetchDatasets();
    return () => {
      isMounted = false;
    };
  }, [activeWorkspace, activeTab]);

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

        const mappedWorkspaces = await Promise.all(dbWorkspaces.map(async ws => {
          const visuals = mapDomainToVisuals(ws.research_domain);
          
          let datasetsCount = 0;
          let imagesCount = '0';
          let imagesRaw = 0;
          let qualityScore = null;

          try {
            const datasets = await getWorkspaceDatasets(ws.id);
            datasetsCount = datasets.length;
            imagesRaw = datasets.reduce((sum, ds) => sum + (ds.dataset_image_count || 0), 0);
            imagesCount = imagesRaw >= 1000 ? (imagesRaw / 1000).toFixed(1) + 'k' : imagesRaw.toString();
            qualityScore = datasetsCount > 0 ? 85 : null;
          } catch (apiErr) {
            console.error('Failed to load datasets for workspace', ws.id, apiErr);
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
            imagesRaw: imagesRaw,
            qualityScore: qualityScore,
            collaborators: ['#3B82F6', '#10B981', '#6366F1'].slice(0, (datasetsCount % 3) + 1),
            status: 'Active',
            lastModified: 'Just now'
          };
        }));

        // Calculate dynamic dashboard stats
        const totalWorkspaces = mappedWorkspaces.length;
        const totalDatasetsCount = mappedWorkspaces.reduce((sum, w) => sum + w.datasetsCount, 0);
        const totalImagesCountRaw = mappedWorkspaces.reduce((sum, w) => sum + w.imagesRaw, 0);

        res.stats.activeWorkspaces.value = totalWorkspaces;
        res.stats.datasets.value = totalDatasetsCount;
        res.stats.imagesManaged.value = totalImagesCountRaw >= 1000 
          ? (totalImagesCountRaw / 1000).toFixed(1) + 'k' 
          : totalImagesCountRaw.toString();

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

  const handleDetectDuplicates = async (dataset) => {
    if (!dataset || detectingDuplicates) return;
    setDetectingDuplicates(true);
    setPollingStatus('downloading');
    try {
      const data = await detectDuplicates(dataset.dataset_id);
      setPollingDatasetId(dataset.dataset_id);
      setPollingStatus(data.dataset_status || 'detecting_duplicates');
      
      // Update in the datasets list
      setWorkspaceDatasets(prev => 
        prev.map(ds => ds.dataset_id === dataset.dataset_id ? { ...ds, dataset_status: data.dataset_status || 'detecting_duplicates' } : ds)
      );
      setSelectedDataset(prev => ({ ...prev, dataset_status: data.dataset_status || 'detecting_duplicates' }));
    } catch (err) {
      console.error('Failed to detect duplicates:', err);
      const errMsg = getDatasetErrorMessage(err);
      alert(errMsg);
      setPollingStatus(null);
    } finally {
      setDetectingDuplicates(false);
    }
  };

  const handleViewDuplicates = async (datasetId) => {
    setLoadingDuplicateGroups(true);
    try {
      const groups = await getDuplicateGroups(datasetId);
      setDuplicateGroups(groups);
      setShowDuplicatesDashboard(true);
    } catch (err) {
      console.error("Failed to load duplicate groups", err);
      alert("Failed to load duplicate groups");
    } finally {
      setLoadingDuplicateGroups(false);
    }
  };

  const handleCancelJob = async () => {
    if (!selectedDataset || cancellingJob) return;
    setCancellingJob(true);
    try {
      await cancelJob(selectedDataset.dataset_id);
      
      // Update local states
      setPollingDatasetId(null);
      setPollingStatus(null);
      
      setWorkspaceDatasets(prev => 
        prev.map(ds => ds.dataset_id === selectedDataset.dataset_id ? { ...ds, dataset_status: 'cancelled' } : ds)
      );
      setSelectedDataset(prev => ({ ...prev, dataset_status: 'cancelled' }));
      alert("Job cancellation requested successfully.");
    } catch (err) {
      console.error("Failed to cancel job:", err);
      alert("Failed to cancel job: " + (err.response?.data?.detail || err.message));
    } finally {
      setCancellingJob(false);
    }
  };

  const handleRemoveDataset = async () => {
    if (!selectedDataset || !activeWorkspace || removingDataset) return;
    setRemovingDataset(true);
    try {
      await workspaceApi.removeDatasetFromWorkspace(activeWorkspace, selectedDataset.dataset_id);
      
      // Update local states
      setWorkspaceDatasets(prev => prev.filter(d => d.dataset_id !== selectedDataset.dataset_id));
      setSelectedDataset(null);
      setIsRemoveConfirmOpen(false);
      alert("Dataset removed from workspace successfully.");
    } catch (err) {
      console.error("Failed to remove dataset:", err);
      alert(err.response?.data?.detail || "Failed to remove dataset from workspace.");
    } finally {
      setRemovingDataset(false);
    }
  };

  const renderProgressUI = () => {
    const stages = [
      { key: 'downloading', label: 'Downloading' },
      { key: 'downloaded', label: 'Preparing' },
      { key: 'detecting_duplicates', label: 'Analyzing' }
    ];

    const currentIdx = stages.findIndex(s => s.key === pollingStatus);
    
    return (
      <div className="w-full bg-slate-50 border border-slate-200/60 rounded-xl p-4.5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[11.5px] font-bold text-slate-500">
            Duplicate Detection Pipeline
          </span>
          <span className="text-[11px] font-bold text-blue-600 animate-pulse flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            {pollingStatus === 'downloading' && 'Downloading dataset...'}
            {pollingStatus === 'downloaded' && 'Preparing analysis...'}
            {pollingStatus === 'detecting_duplicates' && 'Analyzing images...'}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500 rounded-full"
            style={{
              width: pollingStatus === 'downloading' ? '30%' :
                     pollingStatus === 'downloaded' ? '60%' :
                     pollingStatus === 'detecting_duplicates' ? '90%' : '0%'
            }}
          />
        </div>

        {/* Steps list */}
        <div className="grid grid-cols-3 gap-2 pt-1.5 border-b border-slate-200/60 pb-3.5">
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentIdx;
            const isActive = idx === currentIdx;
            return (
              <div key={stage.key} className="text-center space-y-1">
                <div className="flex items-center justify-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    isCompleted ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    isActive ? 'bg-blue-600 text-white border border-blue-500 shadow-sm animate-pulse' :
                    'bg-slate-50 text-slate-400 border border-slate-200'
                  }`}>
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                </div>
                <p className={`text-[10px] font-bold truncate transition-colors ${
                  isActive ? 'text-slate-800' : isCompleted ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  {stage.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Cancel Button */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleCancelJob}
            disabled={cancellingJob}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {cancellingJob && <Loader2 size={11} className="animate-spin" />}
            <span>{cancellingJob ? 'Cancelling...' : 'Cancel Job'}</span>
          </button>
        </div>
      </div>
    );
  };

  const renderCancelledUI = () => {
    return (
      <div className="w-full bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 border border-slate-200/30">
            <X size={18} />
          </div>
          <div>
            <h4 className="font-bold text-[13.5px] text-slate-800">Job Cancelled</h4>
            <p className="text-[11.5px] text-slate-500 mt-1 font-semibold leading-normal">
              The job was cancelled. Database and vector indices have been cleaned up.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleDetectDuplicates(selectedDataset)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[12.5px] rounded-xl transition-all cursor-pointer shadow-md shadow-blue-600/10 shrink-0"
          >
            Restart Detection
          </button>
          <button 
            onClick={() => setSelectedDataset(null)}
            className="px-3 py-2 text-slate-400 hover:text-slate-600 text-[13px] font-bold transition-all cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderErrorUI = () => {
    return (
      <div className="w-full bg-rose-50/50 border border-rose-100/80 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <h4 className="font-bold text-[13.5px] text-slate-800">Duplicate Detection Failed</h4>
            <p className="text-[11.5px] text-rose-600/90 mt-1 font-semibold">An unexpected exception occurred during execution.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleDetectDuplicates(selectedDataset)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-[12.5px] rounded-xl transition-all cursor-pointer shadow-md shadow-red-600/10 shrink-0 animate-in zoom-in-95 duration-100"
          >
            Retry Detection
          </button>
          <button 
            onClick={() => setSelectedDataset(null)}
            className="px-3 py-2 text-slate-400 hover:text-slate-600 text-[13px] font-bold transition-all cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderSuccessUI = () => {
    return (
      <div className="w-full bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="font-bold text-[13.5px] text-slate-800">Duplicates Checked</h4>
            <p className="text-[11.5px] text-emerald-600 mt-1 font-semibold">Duplication scan is complete and groups are indexed.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              await handleViewDuplicates(selectedDataset.dataset_id);
              setJustCompletedScanDatasetId(null);
            }}
            disabled={loadingDuplicateGroups}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12.5px] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-600/10 shrink-0"
          >
            {loadingDuplicateGroups ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            <span>View Duplicate Results</span>
          </button>
          <button 
            onClick={() => setJustCompletedScanDatasetId(null)}
            className="px-3 py-2 text-slate-400 hover:text-slate-600 text-[13px] font-bold transition-all cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

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
    role: authUser?.is_admin ? 'System Administrator' : (user.role || 'Lead Researcher'),
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
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={authUser?.is_admin} />

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
          {authUser?.is_admin ? (
            activeTab === 'admin-users' ? (
              <AdminUsersView />
            ) : (
              <AdminDashboardView setActiveTab={setActiveTab} />
            )
          ) : activeTab === 'dashboard' ? (
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

              {/* Check if workspace datasets are loading or showing duplicates */}
              {showDuplicatesDashboard ? (
                <DuplicatesDashboard
                  dataset={selectedDataset}
                  duplicateGroups={duplicateGroups}
                  onBack={() => {
                    setShowDuplicatesDashboard(false);
                    setDuplicateGroups([]);
                  }}
                />
              ) : loadingDatasets ? (
                <div className="bg-white border border-slate-100/80 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-blue-600" size={24} />
                  <span className="text-slate-400 text-[13px] font-medium">Retrieving workspace datasets...</span>
                </div>
              ) : workspaceDatasets.length === 0 ? (
                /* Empty Onboarding State View */
                <div className="space-y-8 animate-in fade-in-50 duration-200">
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
                /* Loaded Workspace Detail Page (Displays dynamic datasets) */
                <div className="space-y-6 animate-in fade-in-50 duration-200">
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
                          {workspaceDatasets.length}
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
                          {(() => {
                            const sum = workspaceDatasets.reduce((acc, ds) => acc + (ds.dataset_image_count || 0), 0);
                            return sum >= 1000 ? (sum / 1000).toFixed(1) + 'k' : sum.toString();
                          })()}
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
                          {currentWorkspaceObj.qualityScore !== null && currentWorkspaceObj.qualityScore !== undefined
                            ? `${currentWorkspaceObj.qualityScore}%`
                            : '85%'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Datasets Table */}
                  <div className="bg-white border border-slate-100/80 rounded-2xl overflow-hidden shadow-xs">
                    <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between">
                      <h3 className="font-bold text-[15px] text-slate-800">
                        Workspace Datasets ({workspaceDatasets.length})
                      </h3>
                      
                      <div className="relative">
                        <button 
                          onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[12px] font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>Add Dataset</span>
                        </button>

                        {isAddMenuOpen && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setIsAddMenuOpen(false)} 
                            />
                            <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-20 animate-in fade-in slide-in-from-top-1 duration-100">
                              <button
                                onClick={() => {
                                  setActiveTab('discover');
                                  setIsAddMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-700 hover:bg-slate-50 font-semibold transition-colors text-left cursor-pointer"
                              >
                                <Compass size={15} className="text-blue-500" />
                                <span>Discover Datasets</span>
                              </button>
                              <button
                                onClick={() => {
                                  setActiveTab('upload');
                                  setIsAddMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-700 hover:bg-slate-50 font-semibold transition-colors text-left cursor-pointer"
                              >
                                <UploadCloud size={15} className="text-green-500" />
                                <span>Upload Dataset</span>
                              </button>
                              <button
                                onClick={() => {
                                  setActiveTab('paper-analysis');
                                  setIsAddMenuOpen(false);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-700 hover:bg-slate-50 font-semibold transition-colors text-left cursor-pointer"
                              >
                                <FileText size={15} className="text-purple-500" />
                                <span>Analyze Research Paper</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[13px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="px-4 py-3 w-10"></th>
                            <th className="px-5 py-3">Dataset Name</th>
                            <th className="px-5 py-3">Format</th>
                            <th className="px-5 py-3">Dimensions</th>
                            <th className="px-5 py-3">File Count</th>
                            <th className="px-5 py-3">Size</th>
                            <th className="px-5 py-3">Added</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-slate-600 font-medium">
                          {workspaceDatasets.map((ds, idx) => {
                            const isSelected = selectedDataset?.dataset_id === ds.dataset_id;
                            const isFirstMergeDataset = mergeMode && isSelected;
                            const isSecondMergeDatasetCandidate = mergeMode && !isSelected;

                            return (
                              <tr 
                                key={ds.dataset_id || idx} 
                                onClick={() => {
                                  if (mergeMode) {
                                    if (ds.dataset_id === selectedDataset?.dataset_id) return;
                                    setSecondMergeDataset(ds);
                                  } else {
                                    if (isSelected) {
                                      setSelectedDataset(null);
                                    } else {
                                      setSelectedDataset(ds);
                                    }
                                  }
                                }}
                                className={`cursor-pointer transition-colors ${
                                  isFirstMergeDataset 
                                    ? 'bg-blue-50/70 border-l-4 border-l-blue-500' 
                                    : isSelected
                                    ? 'bg-blue-50/60 hover:bg-blue-50/80'
                                    : isSecondMergeDatasetCandidate
                                    ? 'hover:bg-amber-50/30'
                                    : 'hover:bg-slate-50/40'
                                }`}
                              >
                                <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={() => {
                                      if (mergeMode) {
                                        if (ds.dataset_id === selectedDataset?.dataset_id) return;
                                        setSecondMergeDataset(ds);
                                      } else {
                                        if (isSelected) {
                                          setSelectedDataset(null);
                                        } else {
                                          setSelectedDataset(ds);
                                        }
                                      }
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </td>
                                <td className="px-5 py-3.5 text-slate-800 font-bold">{ds.dataset_name}</td>
                                <td className="px-5 py-3.5">
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-bold">
                                    {ds.dataset_source_type}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 font-mono text-[12px]">Variable</td>
                                <td className="px-5 py-3.5 text-slate-700 font-semibold">
                                  {ds.dataset_image_count >= 1000 
                                    ? (ds.dataset_image_count / 1000).toFixed(1) + 'k images' 
                                    : (ds.dataset_image_count || 0) + ' images'}
                                </td>
                                <td className="px-5 py-3.5">
                                  {ds.dataset_image_count ? `${(ds.dataset_image_count * 0.15).toFixed(0)} MB` : '0 MB'}
                                </td>
                                <td className="px-5 py-3.5 text-slate-400">
                                  {ds.dataset_created_at 
                                    ? new Date(ds.dataset_created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                    : 'Just now'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Contextual Actions Panel */}
                  {selectedDataset && (
                    <div className="bg-gradient-to-r from-white via-blue-50/15 to-white text-slate-800 border border-blue-100/40 rounded-2xl p-5 shadow-lg shadow-blue-900/5 animate-in slide-in-from-bottom-2 duration-200">
                      {mergeMode ? (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0 animate-pulse">
                              <Sparkles size={20} />
                            </div>
                            <div>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Merge Mode Active</p>
                              <h4 className="font-extrabold text-[15px] text-slate-800 mt-1.5">
                                Select a second dataset to merge with <span className="text-blue-600 font-black">"{selectedDataset.dataset_name}"</span>
                              </h4>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => {
                              setMergeMode(false);
                            }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[13px] font-bold transition-all shrink-0 cursor-pointer"
                          >
                            Cancel Merge
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                          {pollingStatus ? (
                            <div className="flex-1 w-full">
                              {renderProgressUI()}
                            </div>
                          ) : selectedDataset.dataset_status === 'duplicate_detection_failed' ? (
                            <div className="flex-1 w-full">
                              {renderErrorUI()}
                            </div>
                          ) : selectedDataset.dataset_status === 'cancelled' ? (
                            <div className="flex-1 w-full">
                              {renderCancelledUI()}
                            </div>
                          ) : selectedDataset.dataset_id === justCompletedScanDatasetId ? (
                            <div className="flex-1 w-full">
                              {renderSuccessUI()}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                                  <Database size={20} />
                                </div>
                                <div>
                                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-none">Selected Dataset</p>
                                  <h4 className="font-extrabold text-[15px] text-slate-800 mt-1.5">{selectedDataset.dataset_name}</h4>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 flex-wrap">
                                <button 
                                  onClick={() => alert(`Starting Dataset Profiling for "${selectedDataset.dataset_name}". (Coming Soon)`)}
                                  className="px-4 py-2 bg-slate-50 hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 border border-slate-200/70 hover:border-blue-200 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  <RefreshCw size={14} />
                                  <span>Profile</span>
                                </button>
                                {selectedDataset.dataset_status === 'duplicates_detected' ? (
                                   <button 
                                     onClick={() => handleViewDuplicates(selectedDataset.dataset_id)}
                                     disabled={loadingDuplicateGroups}
                                     className={`px-4 py-2 bg-slate-50 text-slate-700 border border-slate-200/70 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                                       loadingDuplicateGroups ? 'opacity-75 cursor-not-allowed' : 'hover:bg-blue-50/50 hover:text-blue-700 hover:border-blue-200 cursor-pointer'
                                     }`}
                                   >
                                     {loadingDuplicateGroups ? (
                                       <Loader2 size={14} className="animate-spin" />
                                     ) : (
                                       <Sparkles size={14} />
                                     )}
                                     <span>View Duplicates</span>
                                   </button>
                                 ) : (
                                   <button 
                                     onClick={() => handleDetectDuplicates(selectedDataset)}
                                     disabled={detectingDuplicates}
                                     className={`px-4 py-2 bg-slate-50 text-slate-700 border border-slate-200/70 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                                       detectingDuplicates ? 'opacity-75 cursor-not-allowed' : 'hover:bg-blue-50/50 hover:text-blue-700 hover:border-blue-200 cursor-pointer'
                                     }`}
                                   >
                                     {detectingDuplicates ? (
                                       <Loader2 size={14} className="animate-spin" />
                                     ) : (
                                       <AlertTriangle size={14} />
                                     )}
                                     <span>{detectingDuplicates ? 'Detecting...' : 'Detect Duplicates'}</span>
                                   </button>
                                 )}
                                <button 
                                  onClick={() => alert(`Opening AI Label Manager for "${selectedDataset.dataset_name}". (Coming Soon)`)}
                                  className="px-4 py-2 bg-slate-50 hover:bg-blue-50/50 text-slate-700 hover:text-blue-700 border border-slate-200/70 hover:border-blue-200 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  <Tag size={14} />
                                  <span>Manage Labels</span>
                                </button>
                                <button 
                                  onClick={() => setMergeMode(true)}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Sparkles size={14} />
                                  <span>Merge</span>
                                </button>
                                <button 
                                  onClick={() => setIsRemoveConfirmOpen(true)}
                                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200/50 hover:border-red-300 rounded-xl text-[13px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  <Trash2 size={14} />
                                  <span>Remove</span>
                                </button>
                                <button 
                                  onClick={() => setSelectedDataset(null)}
                                  className="px-3 py-2 text-slate-400 hover:text-slate-600 text-[13px] font-bold transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Merge Confirmation Modal Dialog */}
                  {secondMergeDataset && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-150">
                      <div 
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" 
                        onClick={() => setSecondMergeDataset(null)}
                      />

                      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl relative z-10 p-6 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                          <h3 className="font-extrabold text-[18px] text-slate-900 flex items-center gap-2">
                            <Sparkles className="text-blue-500" size={20} />
                            <span>Merge Datasets</span>
                          </h3>
                          <button
                            onClick={() => setSecondMergeDataset(null)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <X size={20} />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <p className="text-[13px] text-slate-500 font-medium">
                            You have selected the following two datasets from the workspace to merge:
                          </p>
                          
                          <div className="flex items-center justify-between gap-4 bg-slate-50 p-4.5 rounded-xl border border-slate-100">
                            <div className="flex-1 text-center bg-white p-3 rounded-lg border border-slate-200/60">
                              <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Dataset A</span>
                              <span className="font-bold text-slate-800 text-[13px] block mt-1 truncate">{selectedDataset?.dataset_name}</span>
                            </div>
                            <div className="p-1 bg-slate-200 rounded-full text-slate-500 shrink-0">
                              <ArrowRight size={14} />
                            </div>
                            <div className="flex-1 text-center bg-white p-3 rounded-lg border border-slate-200/60">
                              <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Dataset B</span>
                              <span className="font-bold text-slate-800 text-[13px] block mt-1 truncate">{secondMergeDataset?.dataset_name}</span>
                            </div>
                          </div>

                          <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl text-[12px] text-blue-600 font-semibold leading-relaxed">
                            Note: Interactive merging algorithms, duplicate resolution, and consolidated vector index synthesis will be completed in the next sprint.
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                          <button
                            onClick={() => setSecondMergeDataset(null)}
                            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              alert(`Interactive merge request initiated for "${selectedDataset?.dataset_name}" and "${secondMergeDataset?.dataset_name}". (Coming Soon)`);
                              setSecondMergeDataset(null);
                              setMergeMode(false);
                              setSelectedDataset(null);
                            }}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-blue-600/10 cursor-pointer"
                          >
                            Initialize Merge
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Remove Dataset Confirmation Modal Dialog */}
                  {isRemoveConfirmOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-150">
                      <div 
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" 
                        onClick={() => setIsRemoveConfirmOpen(false)}
                      />

                      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 p-6 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                          <h3 className="font-extrabold text-[18px] text-slate-900 flex items-center gap-2">
                            <AlertTriangle className="text-red-500" size={20} />
                            <span>Remove Dataset?</span>
                          </h3>
                          <button
                            onClick={() => setIsRemoveConfirmOpen(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <X size={20} />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <p className="text-[13.5px] text-slate-600 font-medium leading-relaxed">
                            Are you sure you want to remove <span className="font-bold text-slate-800">"{selectedDataset?.dataset_name}"</span> from this workspace?
                          </p>
                          <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-[12px] text-amber-700 font-semibold leading-relaxed">
                            This dataset will be removed from the current workspace. This action does not delete the original dataset from MinIO storage or external sources.
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                          <button
                            onClick={() => setIsRemoveConfirmOpen(false)}
                            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRemoveDataset}
                            disabled={removingDataset}
                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-[13px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-red-600/10"
                          >
                            {removingDataset ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                <span>Removing...</span>
                              </>
                            ) : (
                              <span>Remove Dataset</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

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
          ) : activeTab === 'discover' ? (
            <DiscoverDatasets 
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              setActiveWorkspace={setActiveWorkspace}
              setActiveTab={setActiveTab}
            />
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
