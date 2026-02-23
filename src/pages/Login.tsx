import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Music, Headphones, User, Mail, Lock, ArrowRight, Disc3 } from 'lucide-react';

type Mode = 'login' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const { login, register, continueAsGuest } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      navigate('/dj');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    continueAsGuest();
    navigate('/dj');
  };

  return (
    <div className="min-h-screen bg-dark-bg relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary-600/20 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-secondary-600/20 rounded-full blur-[120px] animate-pulse-slow animation-delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-neon-purple/5 rounded-full blur-[150px]" />
      </div>

      {/* Floating music notes (decorative) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[15%] left-[10%] opacity-10 animate-float">
          <Music className="w-8 h-8 text-neon-cyan" />
        </div>
        <div className="absolute top-[25%] right-[15%] opacity-10 animate-float animation-delay-500">
          <Headphones className="w-10 h-10 text-neon-pink" />
        </div>
        <div className="absolute bottom-[20%] left-[20%] opacity-10 animate-float animation-delay-1000">
          <Disc3 className="w-9 h-9 text-primary-400" />
        </div>
        <div className="absolute bottom-[30%] right-[10%] opacity-10 animate-float animation-delay-1500">
          <Music className="w-7 h-7 text-neon-purple" />
        </div>
      </div>

      {/* Main card */}
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-music shadow-neon-purple mb-4">
            <Headphones className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-music bg-clip-text text-transparent">
            AI DJ
          </h1>
          <p className="text-white/50 mt-1 text-sm">Your intelligent music companion</p>
        </div>

        {/* Glass card */}
        <div className="bg-dark-surface/80 backdrop-blur-xl border border-dark-border rounded-2xl p-8 shadow-2xl">
          {/* Mode toggle */}
          <div className="flex mb-6 bg-dark-bg/60 rounded-xl p-1">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                mode === 'login'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                mode === 'register'
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 bg-dark-bg/60 border border-dark-border rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all text-sm"
              />
            </div>

            {/* Email (register only) */}
            {mode === 'register' && (
              <div className="relative animate-fade-in">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 bg-dark-bg/60 border border-dark-border rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all text-sm"
                />
              </div>
            )}

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-11 pr-4 py-3 bg-dark-bg/60 border border-dark-border rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all text-sm"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2.5 animate-fade-in">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-music rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-lg shadow-primary-600/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-dark-border" />
            <span className="text-white/30 text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-dark-border" />
          </div>

          {/* Guest button */}
          <button
            type="button"
            onClick={handleGuest}
            className="w-full py-3 bg-dark-bg/60 border border-dark-border rounded-xl text-white/60 text-sm font-medium hover:text-white hover:border-white/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            Continue as Guest
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-6">
          Powered by AI-driven music mixing
        </p>
      </div>
    </div>
  );
}
