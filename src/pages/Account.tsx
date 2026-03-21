import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  UserCircle,
  Music,
  Upload,
  MessageSquare,
  ListMusic,
  Calendar,
  LogOut,
  ArrowLeft,
  Disc3,
} from 'lucide-react';
import axios from 'axios';

interface Stats {
  songs_played: number;
  songs_uploaded: number;
  prompts_sent: number;
  playlists_generated: number;
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, token, isAuthenticated, logout } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setStatsLoading(true);
    axios
      .get('/api/auth/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [token]);

  const handleLogout = () => {
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
    <div className="min-h-screen bg-[#0a0118] text-white">
      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Back button */}
        <button
          onClick={() => navigate('/dj')}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to DJ</span>
        </button>

        {/* Header */}
        <h2 className="text-lg font-semibold text-white mb-8">Account</h2>

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
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">Actions</h3>
        <div className="bg-dark-surface/80 border border-dark-border rounded-xl overflow-hidden mb-4">
          <button
            onClick={() => navigate('/mixer')}
            className="w-full px-4 py-3.5 flex items-center gap-3 text-neon-purple hover:bg-neon-purple/10 transition-colors cursor-pointer"
          >
            <Disc3 className="w-4 h-4" />
            <span className="text-sm font-medium">Go to Mixer</span>
          </button>
        </div>

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
  );
}
