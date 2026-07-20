import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Settings as SettingsIcon, ChevronDown, Check, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function getInitials(name) {
  if (!name) return 'R';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function Header({
  user,
  workspaces,
  activeWorkspace,
  setActiveWorkspace,
  searchQuery,
  setSearchQuery,
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const selectedWorkspace = workspaces.find((w) => w.id === activeWorkspace) || workspaces[0];

  const handleSignOut = () => {
    setProfileOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-18 border-b border-slate-100 bg-white px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-6 flex-1 max-w-lg">
        <div className="relative w-full">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search datasets, workspaces..."
            className="w-full pl-10 pr-4 py-2 text-[14px] bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-400 focus:bg-white transition-all duration-200 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 h-9 border-r border-slate-100 pr-6">
          <div className="text-right">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Active Workspace
            </p>
          </div>

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[13px] font-semibold hover:bg-blue-100/80 transition-colors duration-200"
            >
              <span className="truncate max-w-[150px]">
                {selectedWorkspace?.name.toUpperCase()}
              </span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 rounded-xl shadow-xl py-1.5 z-50">
                  <div className="px-3 py-1.5 border-b border-slate-50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Switch Workspace
                    </p>
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => {
                          setActiveWorkspace(ws.id);
                          setDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-[13px] hover:bg-slate-50 transition-colors"
                      >
                        <span
                          className={`truncate font-medium ${
                            ws.id === activeWorkspace ? 'text-blue-600' : 'text-slate-700'
                          }`}
                        >
                          {ws.name}
                        </span>
                        {ws.id === activeWorkspace && (
                          <Check size={14} className="text-blue-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4.5">
          <button className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors group">
            <Bell size={20} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white group-hover:scale-110 transition-transform" />
          </button>

          <button className="p-2 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors">
            <SettingsIcon size={20} />
          </button>
        </div>

        <div className="w-px h-8 bg-slate-100" />

        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[13px] font-bold text-slate-800 leading-tight">
                {user?.name || 'Researcher'}
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                {user?.role || 'Researcher'}
              </p>
            </div>
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt="User Profile"
                className="w-9.5 h-9.5 rounded-full object-cover border border-slate-100 ring-2 ring-slate-100/50"
              />
            ) : (
              <div className="w-9.5 h-9.5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[12px] font-bold border border-slate-100 ring-2 ring-slate-100/50">
                {getInitials(user?.name)}
              </div>
            )}
            <ChevronDown
              size={14}
              className={`text-slate-400 hidden sm:block transition-transform duration-200 ${
                profileOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-100 rounded-xl shadow-xl py-1.5 z-50">
                <div className="px-3.5 py-2.5 border-b border-slate-50">
                  <p className="text-[13px] font-bold text-slate-800 truncate">{user?.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => setProfileOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User size={15} className="text-slate-400" />
                  View Profile
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
