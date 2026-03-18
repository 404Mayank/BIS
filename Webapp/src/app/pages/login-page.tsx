import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye } from 'lucide-react';
import { login, register, isLoggedIn, getUser, guestLogin } from '../services/auth-service';

export function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoggedIn()) {
    const user = getUser();
    if (user?.approved) {
      navigate('/');
      return null;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isRegister) {
        const data = await register(username, password);
        if (data.user.approved) {
          navigate('/');
        } else {
          setSuccess('Account created! Waiting for admin approval.');
        }
      } else {
        await login(username, password, rememberMe);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestPreview = async () => {
    setError('');
    setLoading(true);
    try {
      await guestLogin();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Guest access failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-[var(--bg-primary)] font-mono flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-3 h-3 bg-[var(--accent)]" />
            <h1 className="text-xl text-[var(--text-primary)] tracking-wider">BIS</h1>
          </div>
          <p className="text-[var(--text-muted)] text-[10px] tracking-[0.3em] uppercase">
            Blister Inspection System
          </p>
        </div>

        {/* Form */}
        <div className="border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-card-header)]">
            <span className="text-[var(--accent-muted)] text-[10px] tracking-widest uppercase">
              {isRegister ? 'Register' : 'Login'}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-neutral-400 text-[10px] tracking-wider uppercase">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                required
                minLength={3}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="Enter username"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-neutral-400 text-[10px] tracking-wider uppercase">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={4}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm px-3 py-2 focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="Enter password"
              />
            </div>

            {/* Remember me (login only) */}
            {!isRegister && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="w-3 h-3 accent-cyan-500"
                />
                <span className="text-neutral-400 text-[10px] tracking-wider uppercase">Remember me</span>
              </label>
            )}

            {error && (
              <div className="px-3 py-2 bg-red-950/50 border border-red-800/50 text-red-400 text-xs">
                {error}
              </div>
            )}

            {success && (
              <div className="px-3 py-2 bg-emerald-950/50 border border-emerald-800/50 text-emerald-400 text-xs">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-cyan-900/50 hover:bg-cyan-800/60 border border-cyan-600/40 text-cyan-300 text-xs tracking-wider uppercase transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between">
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); setSuccess(''); }}
              className="text-neutral-500 hover:text-neutral-300 text-xs transition-colors"
            >
              {isRegister ? 'Sign in instead' : 'Register'}
            </button>
            <button
              onClick={handleGuestPreview}
              disabled={loading}
              className="flex items-center gap-1 text-amber-500/70 hover:text-amber-400 text-xs transition-colors disabled:opacity-50"
            >
              <Eye className="w-3 h-3" /> 5-min Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
