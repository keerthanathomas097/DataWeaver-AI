import React, { useState } from 'react';
import { 
  X, 
  AlertCircle,
  Folder, 
  Brain, 
  Eye, 
  Microscope, 
  Sprout, 
  Database, 
  LineChart, 
  Layers 
} from 'lucide-react';

const COLORS = [
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Slate', hex: '#64748B' }
];

const ICONS = [
  { name: 'Folder', icon: Folder },
  { name: 'Brain', icon: Brain },
  { name: 'Eye', icon: Eye },
  { name: 'Microscope', icon: Microscope },
  { name: 'Sprout', icon: Sprout },
  { name: 'Database', icon: Database },
  { name: 'LineChart', icon: LineChart },
  { name: 'Layers', icon: Layers }
];

export default function CreateWorkspaceModal({ isOpen, onClose, onCreate }) {
  const [formData, setFormData] = useState({
    name: '',
    domain: 'Medical Imaging',
    description: '',
    color: '#3B82F6',
    iconName: 'Folder'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const selectColor = (hex) => {
    setFormData(prev => ({ ...prev, color: hex }));
  };

  const selectIcon = (name) => {
    setFormData(prev => ({ ...prev, iconName: name }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Workspace name is required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onCreate(formData);
      // Reset form and close
      setFormData({
        name: '',
        domain: 'Medical Imaging',
        description: '',
        color: '#3B82F6',
        iconName: 'Folder'
      });
      onClose();
    } catch (err) {
      setError('Failed to create workspace. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="bg-white border border-slate-100/60 rounded-2xl w-full max-w-md p-6 shadow-2xl relative z-10 animate-in zoom-in-95 duration-150">
        <button 
          onClick={onClose}
          className="absolute top-4.5 right-4.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-4">
          <div 
            style={{ backgroundColor: `${formData.color}15`, color: formData.color }}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300"
          >
            {React.createElement(
              ICONS.find(i => i.name === formData.iconName)?.icon || Folder, 
              { size: 22 }
            )}
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-[17px]">
              Create New Workspace
            </h2>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Create a workspace to organize and manage your dataset engineering project.
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3.5 bg-red-50 text-red-700 text-[13px] rounded-xl flex items-start gap-2 font-medium animate-in fade-in duration-200">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Workspace Name */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Workspace Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Brain Tumor MRI Classification"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all text-[14px]"
            />
          </div>

          {/* Research Domain Dropdown */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Research Domain <span className="text-red-500">*</span>
            </label>
            <select
              name="domain"
              value={formData.domain}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all text-[14px]"
            >
              <option value="Medical Imaging">Medical Imaging</option>
              <option value="Computer Vision">Computer Vision</option>
              <option value="Remote Sensing">Remote Sensing</option>
              <option value="Agriculture">Agriculture</option>
              <option value="Autonomous Driving">Autonomous Driving</option>
              <option value="Industrial Inspection">Industrial Inspection</option>
              <option value="Satellite Imaging">Satellite Imaging</option>
              <option value="General Image Dataset">General Image Dataset</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Description Textarea */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={2}
              placeholder="Briefly describe the purpose of this workspace."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all text-[14px] resize-none"
            />
          </div>

          {/* Workspace Color Circle Grid */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Workspace Color <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {COLORS.map((color) => (
                <button
                  type="button"
                  key={color.hex}
                  onClick={() => selectColor(color.hex)}
                  style={{ backgroundColor: color.hex }}
                  className={`w-6 h-6 rounded-full transition-all duration-200 cursor-pointer relative ${
                    formData.color === color.hex 
                      ? 'ring-2 ring-offset-2 ring-slate-400 scale-110 shadow-sm' 
                      : 'hover:scale-105'
                  }`}
                  title={color.name}
                >
                  {formData.color === color.hex && (
                    <span className="absolute inset-0 m-auto w-2 h-2 bg-white rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Workspace Icon Selector */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">
              Workspace Icon <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {ICONS.map((ico) => {
                const IconComponent = ico.icon;
                const isSelected = formData.iconName === ico.name;
                return (
                  <button
                    type="button"
                    key={ico.name}
                    onClick={() => selectIcon(ico.name)}
                    style={{ 
                      backgroundColor: isSelected ? `${formData.color}15` : 'transparent',
                      color: isSelected ? formData.color : '#64748B',
                      borderColor: isSelected ? `${formData.color}40` : '#E2E8F0'
                    }}
                    className="w-8.5 h-8.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-slate-50"
                    title={ico.name}
                  >
                    <IconComponent size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-100 rounded-xl text-[14px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[14px] font-semibold shadow-md shadow-blue-600/10 hover:shadow-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Create Workspace'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
