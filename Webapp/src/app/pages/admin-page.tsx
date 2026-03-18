import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, Trash2, ShieldCheck, ShieldX, Loader2, Clock, Crown } from 'lucide-react';
import { authFetch, isAdmin } from '../services/auth-service';

interface UserRecord {
  id: number;
  username: string;
  role: string;
  approved: number;
  session_minutes: number;
  created_at: string;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [editingSession, setEditingSession] = useState<number | null>(null);
  const [sessionValue, setSessionValue] = useState('');

  // Redirect non-admins
  useEffect(() => {
    if (!isAdmin()) navigate('/');
  }, [navigate]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/users?search=${encodeURIComponent(search)}`);
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleApproval = async (userId: number, approved: boolean) => {
    setActionLoading(userId);
    try {
      await authFetch(`/api/admin/users/${userId}/approve?approved=${approved}`, { method: 'PATCH' });
      await fetchUsers();
    } catch (err) {
      console.error('Failed to update user:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: number, username: string) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setActionLoading(userId);
    try {
      await authFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      await fetchUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetSession = async (userId: number) => {
    const minutes = parseInt(sessionValue);
    if (isNaN(minutes) || minutes < 0) return;
    setActionLoading(userId);
    try {
      await authFetch(`/api/admin/users/${userId}/session`, {
        method: 'PATCH',
        body: JSON.stringify({ minutes }),
      });
      setEditingSession(null);
      await fetchUsers();
    } catch (err) {
      console.error('Failed to set session:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetRole = async (userId: number, role: string) => {
    if (!confirm(`${role === 'admin' ? 'Promote' : 'Demote'} this user?`)) return;
    setActionLoading(userId);
    try {
      await authFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await fetchUsers();
    } catch (err) {
      console.error('Failed to change role:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatSession = (minutes: number) => {
    if (minutes === 0) return '∞';
    if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d`;
    if (minutes >= 60) return `${Math.floor(minutes / 60)}h`;
    return `${minutes}m`;
  };

  return (
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-xs px-2 py-1 border border-[var(--border)] hover:border-[var(--text-muted)]"
          >
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent)]" />
            <span className="text-sm tracking-wider">
              BIS <span className="text-[var(--text-muted)] text-[10px] tracking-widest">ADMIN PANEL</span>
            </span>
          </div>
        </div>
        <span className="text-[var(--text-muted)] text-[10px]">{users.length} users</span>
      </header>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-card-header)] shrink-0">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-xs pl-8 pr-3 py-1.5 focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">
            No users found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--bg-card-header)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] text-xs tracking-wider uppercase font-normal">User</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] text-xs tracking-wider uppercase font-normal">Role</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] text-xs tracking-wider uppercase font-normal">Status</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] text-xs tracking-wider uppercase font-normal">Session</th>
                <th className="text-left px-4 py-3 text-[var(--text-muted)] text-xs tracking-wider uppercase font-normal">Created</th>
                <th className="text-right px-4 py-3 text-[var(--text-muted)] text-xs tracking-wider uppercase font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-card-header)] transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="text-[var(--text-primary)]">{user.username}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2 py-1 text-xs tracking-wider uppercase ${user.role === 'admin'
                        ? 'bg-amber-900/30 text-amber-400 border border-amber-700/40'
                        : 'bg-[var(--bg-card-header)] text-[var(--text-secondary)] border border-[var(--border)]'
                      }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${user.approved ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className={`text-xs ${user.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                        {user.approved ? 'APPROVED' : 'PENDING'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {editingSession === user.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={sessionValue}
                          onChange={e => setSessionValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSetSession(user.id)}
                          className="w-16 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-xs px-1.5 py-0.5 focus:outline-none focus:border-[var(--accent)]"
                          placeholder="0=∞"
                          min={0}
                          autoFocus
                        />
                        <button onClick={() => handleSetSession(user.id)} className="text-emerald-400 text-[10px] hover:text-emerald-300">✓</button>
                        <button onClick={() => setEditingSession(null)} className="text-[var(--text-muted)] text-[10px] hover:text-[var(--text-primary)]">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingSession(user.id); setSessionValue(String(user.session_minutes)); }}
                        className="flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                        title="Edit session duration"
                      >
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px]">{formatSession(user.session_minutes)}</span>
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-muted)]">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {actionLoading === user.id ? (
                        <Loader2 className="w-4 h-4 text-[var(--text-muted)] animate-spin" />
                      ) : (
                        <>
                          {/* Promote/demote */}
                          <button
                            onClick={() => handleSetRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                            className={`p-1.5 transition-colors ${
                              user.role === 'admin'
                                ? 'text-amber-400 hover:text-[var(--text-muted)]'
                                : 'text-[var(--text-muted)] hover:text-amber-400'
                            }`}
                            title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                          >
                            <Crown className="w-4 h-4" />
                          </button>
                          {user.role !== 'admin' && (
                            <>
                              <button
                                onClick={() => toggleApproval(user.id, !user.approved)}
                                className={`p-1.5 transition-colors ${user.approved
                                    ? 'text-emerald-600 hover:text-red-400'
                                    : 'text-[var(--text-muted)] hover:text-emerald-400'
                                  }`}
                                title={user.approved ? 'Revoke access' : 'Approve user'}
                              >
                                {user.approved ? <ShieldX className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDelete(user.id, user.username)}
                                className="p-1.5 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                                title="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
