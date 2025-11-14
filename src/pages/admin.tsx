import { useEffect, useMemo, useState } from 'react';
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
type ClinicTimings = Record<string, { open: string; close: string; closed?: boolean }>;
type ClinicData = {
  id: string;
  name: string;
  address: string;
  timezone: string;
  contactEmail: string;
  departments: string[];
  specialties: string[];
  timings: ClinicTimings;
  permissions: Record<string, string[]>;
};
type ClinicRes = { clinic: ClinicData };
type Invite = { id: string; email: string; role: string; code: string; status: string; expires_at?: number | null; created_at: number; accepted_at?: number | null };
type InvitesRes = { invites: Invite[] };

const ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'receptionist', label: 'Receptionist' },
];

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const FEATURE_LABELS: Record<string, string> = {
  appointments: 'Appointments',
  queue: 'Waiting queue',
  encounters: 'Charts & encounters',
  labs: 'Lab orders',
  referrals: 'Referrals',
  billing: 'Billing & payments',
  analytics: 'Analytics',
  pharmacy: 'Pharmacy',
};

export default function AdminConsolePage() {
  const [clinic, setClinic] = useState<ClinicData | null>(null);
  const [clinicLoading, setClinicLoading] = useState(true);
  const [clinicSaving, setClinicSaving] = useState(false);
  const [clinicMessage, setClinicMessage] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersMessage, setUsersMessage] = useState<string | null>(null);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('doctor');
  const [inviteDays, setInviteDays] = useState(14);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [departmentsText, setDepartmentsText] = useState('');
  const [specialtiesText, setSpecialtiesText] = useState('');

  useEffect(() => {
    void loadClinic();
    void loadUsers();
    void loadInvites();
    void loadLogs();
  }, []);

  async function loadClinic() {
    setClinicLoading(true);
    try {
      const res = await apiFetch('/admin/clinic');
      const data = await getJson<ClinicRes>(res);
      setClinic(data.clinic);
      setDepartmentsText(data.clinic.departments.join(', '));
      setSpecialtiesText(data.clinic.specialties.join(', '));
    } catch {
      setClinic(null);
    } finally {
      setClinicLoading(false);
    }
  }

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

  async function loadInvites() {
    setLoadingInvites(true);
    try {
      const res = await apiFetch('/admin/invites');
      const data = await getJson<InvitesRes>(res);
      setInvites(data.invites);
    } catch {
      setInvites([]);
    } finally {
      setLoadingInvites(false);
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

  const permissions = useMemo(() => clinic?.permissions || {}, [clinic]);

  const handleClinicField = (field: keyof ClinicData, value: string) => {
    if (!clinic) return;
    setClinic({ ...clinic, [field]: value });
  };

  const handleTimingChange = (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    if (!clinic) return;
    setClinic({
      ...clinic,
      timings: {
        ...clinic.timings,
        [day]: {
          ...clinic.timings[day],
          [field]: field === 'closed' ? Boolean(value) : (value as string),
        },
      },
    });
  };

  const togglePermission = (role: string, feature: string) => {
    if (!clinic) return;
    const current = new Set(permissions[role] || []);
    if (current.has(feature)) current.delete(feature);
    else current.add(feature);
    setClinic({
      ...clinic,
      permissions: {
        ...permissions,
        [role]: Array.from(current),
      },
    });
  };

  async function handleSaveClinic(e: React.FormEvent) {
    e.preventDefault();
    if (!clinic) return;
    setClinicSaving(true);
    setClinicMessage(null);
    try {
      const payload = {
        ...clinic,
        departments: departmentsText.split(',').map((d) => d.trim()).filter(Boolean),
        specialties: specialtiesText.split(',').map((s) => s.trim()).filter(Boolean),
        permissions: clinic.permissions,
      };
      const res = await apiFetch('/admin/clinic', { method: 'PUT', json: payload });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setClinicMessage(body?.error || 'Could not save clinic settings.');
        return;
      }
      setClinicMessage('Clinic settings saved.');
      await loadClinic();
    } catch {
      setClinicMessage('Could not save clinic settings.');
    } finally {
      setClinicSaving(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMessage(null);
    try {
      const res = await apiFetch('/admin/users/invite', {
        method: 'POST',
        json: { email: inviteEmail.trim().toLowerCase(), role: inviteRole, expiresDays: inviteDays },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setInviteMessage(body?.error || 'Could not invite user.');
        return;
      }
      setInviteEmail('');
      setInviteRole('doctor');
      setInviteDays(14);
      setInviteMessage('Invitation created.');
      await Promise.all([loadInvites(), loadUsers()]);
    } catch {
      setInviteMessage('Could not invite user.');
    }
  }

  async function handleRevokeInvite(id: string) {
    await apiFetch(`/admin/invites/${id}/revoke`, { method: 'POST' });
    await loadInvites();
  }

  async function handleRoleChange(id: string, role: string) {
    setUsersMessage(null);
    try {
      const res = await apiFetch(`/admin/users/${id}`, { method: 'PATCH', json: { role } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setUsersMessage(body?.error || 'Could not update role.');
        return;
      }
      await loadUsers();
    } catch {
      setUsersMessage('Could not update role.');
    }
  }

  async function handleRemoveUser(id: string) {
    setUsersMessage(null);
    const res = await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setUsersMessage(body?.error || 'Could not remove user.');
      return;
    }
    await loadUsers();
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Admin Console</p>
            <h1 className="text-3xl font-semibold text-[#122E3A]">Clinic Administration</h1>
            <p className="text-sm text-slate-500">Configure clinic settings, manage staff, and review audit trails.</p>
          </div>
          <a href="/dashboard" className="text-sm text-[#1AA898] underline">Back to dashboard</a>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Clinic profile</h2>
              <p className="text-sm text-slate-500">Name, contact info, and availability.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadClinic}>Refresh</button>
          </div>
          {clinicLoading || !clinic ? (
            <p className="text-sm text-slate-500">Loading clinic info...</p>
          ) : (
            <form className="space-y-4" onSubmit={handleSaveClinic}>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="text-sm font-medium">
                  Clinic name
                  <input className="mt-1 w-full" value={clinic.name} onChange={(e)=>handleClinicField('name', e.target.value)} />
                </label>
                <label className="text-sm font-medium">
                  Contact email
                  <input className="mt-1 w-full" value={clinic.contactEmail} onChange={(e)=>handleClinicField('contactEmail', e.target.value)} />
                </label>
                <label className="text-sm font-medium">
                  Address
                  <input className="mt-1 w-full" value={clinic.address} onChange={(e)=>handleClinicField('address', e.target.value)} />
                </label>
                <label className="text-sm font-medium">
                  Timezone
                  <input className="mt-1 w-full" value={clinic.timezone} onChange={(e)=>handleClinicField('timezone', e.target.value)} />
                </label>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="text-sm font-medium">
                  Departments (comma separated)
                  <input className="mt-1 w-full" value={departmentsText} onChange={(e)=>setDepartmentsText(e.target.value)} placeholder="Primary Care, Diagnostics" />
                </label>
                <label className="text-sm font-medium">
                  Specialties (comma separated)
                  <input className="mt-1 w-full" value={specialtiesText} onChange={(e)=>setSpecialtiesText(e.target.value)} placeholder="General Physician, Dermatology" />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Clinic timings</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-xl">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Day</th>
                        <th className="px-3 py-2 text-left">Open</th>
                        <th className="px-3 py-2 text-left">Close</th>
                        <th className="px-3 py-2 text-left">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day) => (
                        <tr key={day.key} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium">{day.label}</td>
                          <td className="px-3 py-2">
                            <input type="time" value={clinic.timings[day.key]?.open || ''} onChange={(e)=>handleTimingChange(day.key, 'open', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="time" value={clinic.timings[day.key]?.close || ''} onChange={(e)=>handleTimingChange(day.key, 'close', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={Boolean(clinic.timings[day.key]?.closed)} onChange={(e)=>handleTimingChange(day.key, 'closed', e.target.checked)} />
                              Closed
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Permissions by role</p>
                <div className="grid md:grid-cols-3 gap-4">
                  {(['doctor', 'receptionist', 'admin'] as const).map((role) => (
                    <div key={role} className="border border-slate-200 rounded-xl p-4">
                      <p className="text-sm font-semibold mb-2 capitalize">{role}</p>
                      <div className="space-y-2 text-sm text-slate-600">
                        {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
                          <label key={feature} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={permissions[role]?.includes(feature) ?? false}
                              onChange={()=>togglePermission(role, feature)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary px-4 py-2 disabled:opacity-60" disabled={clinicSaving}>
                {clinicSaving ? 'Saving...' : 'Save clinic settings'}
              </button>
              {clinicMessage && <p className="text-sm text-[#1AA898]">{clinicMessage}</p>}
            </form>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold">Invite staff</h2>
              <p className="text-sm text-slate-500">Send doctors and receptionists a link to join your clinic.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadInvites}>Refresh</button>
          </div>
          <form className="grid md:grid-cols-4 gap-4 mb-4" onSubmit={handleInvite}>
            <label className="text-sm font-medium">
              Email
              <input className="mt-1 w-full" type="email" value={inviteEmail} onChange={(e)=>setInviteEmail(e.target.value)} required />
            </label>
            <label className="text-sm font-medium">
              Role
              <select className="mt-1 w-full" value={inviteRole} onChange={(e)=>setInviteRole(e.target.value)}>
                {ROLES.filter((role)=>role.id !== 'admin').map((role)=>(
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Expires (days)
              <input className="mt-1 w-full" type="number" min={1} max={60} value={inviteDays} onChange={(e)=>setInviteDays(Number(e.target.value))} />
            </label>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full py-2">Send invite</button>
            </div>
          </form>
          {inviteMessage && <p className="text-sm text-[#1AA898] mb-4">{inviteMessage}</p>}
          {loadingInvites ? (
            <p className="text-sm text-slate-500">Loading invites...</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-slate-500">No pending invitations.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Invite code</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{invite.email}</td>
                      <td className="px-3 py-2 capitalize">{invite.role}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">{invite.status}</span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">{invite.code}</td>
                      <td className="px-3 py-2 text-xs space-x-2">
                        <button type="button" className="text-[#1AA898]" onClick={()=>navigator.clipboard?.writeText(invite.code)}>Copy</button>
                        {invite.status === 'pending' && (
                          <button type="button" className="text-red-500" onClick={()=>handleRevokeInvite(invite.id)}>Revoke</button>
                        )}
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
              <h2 className="text-xl font-semibold">Staff</h2>
              <p className="text-sm text-slate-500">Manage active team members and their permissions.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadUsers}>Refresh</button>
          </div>
          {usersMessage && <p className="text-sm text-[#1AA898] mb-3">{usersMessage}</p>}
          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading staff...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Specialty</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{user.email}</td>
                      <td className="px-3 py-2">
                        <select className="text-sm border border-slate-300 rounded-md" value={user.role || 'doctor'} onChange={(e)=>handleRoleChange(user.id, e.target.value)}>
                          {ROLES.map((role)=>(
                            <option key={role.id} value={role.id}>{role.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">{user.specialty || '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{new Date((user.created_at || 0) * 1000).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs">
                        <button type="button" className="text-red-500" onClick={()=>handleRemoveUser(user.id)}>Remove</button>
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
              <p className="text-sm text-slate-500">Recent API actions for compliance.</p>
            </div>
            <button type="button" className="text-sm text-[#1AA898]" onClick={loadLogs}>Refresh</button>
          </div>
          {loadingLogs ? (
            <p className="text-sm text-slate-500">Loading audit logs...</p>
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
