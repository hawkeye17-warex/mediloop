import { useEffect, useState } from 'react';
import { apiFetch, getJson } from '../lib/api';

type AdminUser = { id: string; email: string; role: string; specialty?: string | null; clinic_id?: string | null; created_at: number };
type UsersRes = { users: AdminUser[] };
type AuditLog = {
  id: string;
  user_id: string | null;
  email?: string | null;
  method: string;
  path: string;
  ip?: string | null;
  user_agent?: string | null;
  status: number;
  created_at: number;
};
type AuditRes = { logs: AuditLog[] };

const ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'receptionist', label: 'Receptionist' },
];

export default function AdminConsolePage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('doctor');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadUsers();
    void loadLogs();
  }, []);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await apiFetch('/admin/users');
      const data = await getJson<UsersRes>(res);
      setUsers(data.users);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadLogs() {
    setLoadingLogs(true);
    try {
      const res = await apiFetch('/admin/audit');
      const data = await getJson<AuditRes>(res);
      setLogs(data.logs);
    } catch {
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await apiFetch('/admin/users/invite', {
        method: 'POST',
        json: { email: inviteEmail.trim().toLowerCase(), role: inviteRole },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(body?.error || 'Could not invite user.');
        return;
      }
      setInviteEmail('');
      setInviteRole('doctor');
      setMessage('Invitation saved.');
      await loadUsers();
    } catch {
      setMessage('Could not invite user.');
    }
  }

  async function handleRoleChange(id: string, role: string) {
    setMessage(null);
    try {
      const res = await apiFetch(`/admin/users/${id}`, { method: 'PATCH', json: { role } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessage(body?.error || 'Could not update role.');
        return;
      }
      await loadUsers();
    } catch {
      setMessage('Could not update role.');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admin Console</p>
            <h1 className="text-3xl font-semibold text-[#122E3A]">Clinic & Staff Management</h1>
            <p className="text-sm text-slate-500">Invite staff, manage permissions, and review audit logs.</p>
          </div>
          <a href="/dashboard" className="text-sm text-[#1AA898] underline">Back to dashboard</a>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Invite user</h2>
          <form className="grid md:grid-cols-3 gap-4" onSubmit={handleInvite}>
            <label className="text-sm font-medium">
              Email
              <input className="mt-1 w-full" type="email" value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)} required />
            </label>
            <label className="text-sm font-medium">
              Role
              <select className="mt-1 w-full" value={inviteRole} onChange={(e)=>setInviteRole(e.target.value)}>
                {ROLES.map((role)=>(
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full py-2">Send invite</button>
            </div>
          </form>
          {message && <p className="text-sm text-[#1AA898] mt-3">{message}</p>}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Staff</h2>
              <p className="text-sm text-slate-500">Manage active users and their permissions.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadUsers}>Refresh</button>
          </div>
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading staff…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Specialty</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{user.email}</td>
                      <td className="px-3 py-2">
                        <select
                          className="text-sm border border-slate-300 rounded-md"
                          value={user.role || 'doctor'}
                          onChange={(e)=>handleRoleChange(user.id, e.target.value)}
                        >
                          {ROLES.map((role)=>(
                            <option key={role.id} value={role.id}>{role.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">{user.specialty || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date((user.created_at || 0) * 1000).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Audit activity</h2>
              <p className="text-sm text-slate-500">Recent actions recorded for compliance.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadLogs}>Refresh</button>
          </div>
          {loadingLogs ? (
            <p className="text-sm text-slate-500">Loading audit logs…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-600">
                <thead className="text-left border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-1">Time</th>
                    <th className="px-2 py-1">User</th>
                    <th className="px-2 py-1">Action</th>
                    <th className="px-2 py-1">IP</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100">
                      <td className="px-2 py-1">{new Date((log.created_at || 0) * 1000).toLocaleString()}</td>
                      <td className="px-2 py-1">{log.email || log.user_id || '—'}</td>
                      <td className="px-2 py-1">{log.method} {log.path}</td>
                      <td className="px-2 py-1">{log.ip || '—'}</td>
                      <td className="px-2 py-1">{log.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
