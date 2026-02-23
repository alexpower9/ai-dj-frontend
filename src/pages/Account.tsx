import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X,
  UserCircle,
  Music,
  Upload,
  MessageSquare,
  ListMusic,
  Calendar,
  LogOut,
} from 'lucide-react';
import axios from 'axios';

interface Stats {
  songs_played: number;
  songs_uploaded: number;
  prompts_sent: number;
  playlists_generated: number;
}

interface AccountPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AccountPanel({ open, onClose }: AccountPanelProps) {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!open || !token) return;
    setStatsLoading(true);
    axios
      .get('/api/auth/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [open, token]);

  const handleLogout = () => {
    onClose();
    logout();
    navigate('/login');
  };

  if (!isAuthenticated) return null;

  const statCards = [
    { label: 'Songs Played', value: stats?.songs_played ?? 0, icon: Music, color: 'text-neon-cyan' },
    { label: 'Songs Uploaded', value: stats?.songs_uploaded ?? 0, icon: Upload, color: 'text-neon-pink' },
    { label: 'Prompts Sent', value: stats?.prompts_sent ?? 0, icon: MessageSquare, color: 'text-neon-purple' },
    { label: 'Playlists Generated', value: stats?.playlists_generated ?? 0, icon: ListMusic, color: 'text-neon-green' },
  ];

  const joinDate = user?.created_at
    ? new Date(user.created_at + 'Z').toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 left-0 h-full w-full max-w-md z-50 transform transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full bg-dark-bg/95 backdrop-blur-xl border-r border-dark-border overflow-y-auto">
          <div className="px-6 py-6">
            {/* Header with close button */}
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-semibold text-white">Account</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Profile header */}
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-music flex items-center justify-center shadow-neon-purple shrink-0">
                <UserCircle className="w-8 h-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-white truncate">{user?.username}</h1>
                <p className="text-white/40 text-sm truncate">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1 text-white/30 text-xs">
                  <Calendar className="w-3 h-3" />
                  <span>Joined {joinDate}</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Activity</h3>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {statCards.map((card) => (
                <div
                  key={card.label}
                  className="bg-dark-surface/80 border border-dark-border rounded-xl p-4 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                    <span className="text-white/40 text-[11px]">{card.label}</span>
                  </div>
                  {statsLoading ? (
                    <div className="w-8 h-5 bg-white/5 rounded animate-pulse" />
                  ) : (
                    <span className="text-xl font-bold text-white">{card.value}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Settings</h3>
            <div className="bg-dark-surface/80 border border-dark-border rounded-xl overflow-hidden">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-3.5 flex items-center gap-3 text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
