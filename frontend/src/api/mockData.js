// Mock Data Service for DataWeaver AI

// Initial mock workspaces data
let workspaces = [
  {
    id: 'brain-tumor-mri',
    name: 'Brain Tumor MRI Research',
    datasetsCount: 6,
    imagesCount: '24.5k',
    imagesRaw: 24500,
    qualityScore: 91,
    category: 'Medical',
    collaborators: ['#3B82F6', '#10B981', '#6366F1'], // color codes for avatars
    status: 'Active',
    lastModified: '2 hours ago'
  },
  {
    id: 'agricultural-leaf-disease',
    name: 'Agricultural Leaf Disease Study',
    datasetsCount: 4,
    imagesCount: '12.8k',
    imagesRaw: 12800,
    qualityScore: 86,
    category: 'Agriculture',
    collaborators: ['#EC4899', '#8B5CF6'],
    status: 'Active',
    lastModified: '1 day ago'
  },
  {
    id: 'medical-image-classification',
    name: 'Medical Image Classification',
    datasetsCount: 8,
    imagesCount: '48.2k',
    imagesRaw: 48200,
    qualityScore: 88,
    category: 'Medical',
    collaborators: ['#10B981', '#F59E0B', '#3B82F6', '#8B5CF6'],
    status: 'Active',
    lastModified: '3 days ago'
  },
  {
    id: 'chest-xray-pneumonia',
    name: 'Chest X-Ray Pneumonia Diagnosis',
    datasetsCount: 3,
    imagesCount: '5.6k',
    imagesRaw: 5600,
    qualityScore: 94,
    category: 'Medical',
    collaborators: ['#EF4444', '#6366F1'],
    status: 'Active',
    lastModified: '5 days ago'
  }
];

// Initial mock stats data
let stats = {
  activeWorkspaces: { value: 4, change: '+1 this week' },
  datasets: { value: 128, change: null },
  imagesManaged: { value: '1.2M', change: null },
  storage: { value: '4.2 TB', percentUsed: 84 },
  merges: { value: 14, change: null },
  aiSuggestions: { value: 892, actionable: 42 }
};

// Initial mock AI insights
let insights = [
  {
    id: 'insight-1',
    type: 'duplicate',
    title: 'Duplicate Detection',
    description: "420 duplicates found in 'Leaf Disease Study'.",
    actionText: 'Review Now',
    color: 'indigo'
  },
  {
    id: 'insight-2',
    type: 'inconsistency',
    title: 'Label Inconsistency',
    description: "Class 'Glioma' has high labeling variance (12%).",
    actionText: 'Run Auto-Labeler',
    color: 'red'
  },
  {
    id: 'insight-3',
    type: 'recommendation',
    title: 'Workspace Recommendation',
    description: "Merge 'Histopathology Core A' and 'Core B'.",
    actionText: 'Analyze Merge',
    color: 'emerald'
  }
];

// Storage detailed distribution
let storageDistribution = {
  used: 4.2,
  total: 5.0,
  datasetFiles: 2.8,
  aiModels: 0.6,
  otherFiles: 0.8
};

// Simulation helper for network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const getDashboardData = async () => {
  await delay(150); // Simulate API latency
  return {
    user: {
      name: 'Keerthana Thomas',
      role: 'Lead Researcher',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=120'
    },
    stats: {
      ...stats,
      activeWorkspaces: {
        value: workspaces.length,
        change: workspaces.length > 4 ? `+${workspaces.length - 3} this week` : '+1 this week'
      }
    },
    workspaces: [...workspaces],
    insights: [...insights],
    storage: { ...storageDistribution }
  };
};

export const createWorkspace = async (newWorkspace) => {
  await delay(300); // Simulate network roundtrip
  const created = {
    id: newWorkspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: newWorkspace.name,
    domain: newWorkspace.domain,
    category: newWorkspace.domain, // fallback/legacy mapping
    description: newWorkspace.description || '',
    color: newWorkspace.color || '#3B82F6',
    iconName: newWorkspace.iconName || 'Folder',
    datasetsCount: 0,
    imagesCount: '0',
    imagesRaw: 0,
    qualityScore: null,
    collaborators: ['#3B82F6'], // Owner avatar color
    status: 'Active',
    lastModified: 'Just now'
  };

  workspaces = [created, ...workspaces];
  
  return created;
};
