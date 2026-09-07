import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { AuditLog, User } from '../types/index.js';
import { ShieldCheck, UserCheck, UserX, History, RefreshCw } from 'lucide-react';

export const StaffView: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'staff' | 'audit'>('staff');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStaffAndLogs = async () => {
    setIsLoading(true);
    try {
      // Fetch users
      const uRes = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        setUsers(uData.users);
      }

      // Fetch audit logs
      const aRes = await fetch('/api/audit-logs?limit=30', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (aRes.ok) {
        const aData = await aRes.json();
        setAuditLogs(aData.logs);
      }
    } catch (err) {
      console.error('Error fetching staff data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffAndLogs();
  }, [token]);

  const toggleUserStatus = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !user.isActive })
      });

      if (res.ok) {
        setMessage(`User ${user.username} status updated.`);
        fetchStaffAndLogs();
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Staff & Security Management</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Role-Based Access Control, Staff Credentials & Immutable Audit Trail
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchStaffAndLogs} className="btn btn-secondary btn-sm" disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {message && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('staff')}
          className={`btn ${activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
        >
          <ShieldCheck size={16} />
          <span>Staff Accounts ({users.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
        >
          <History size={16} />
          <span>System Audit Trail ({auditLogs.length})</span>
        </button>
      </div>

      {activeTab === 'staff' ? (
        <div className="card" style={{ padding: '0' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>#{u.id}</td>
                    <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                    <td><code>{u.username}</code></td>
                    <td>
                      <span className={`badge ${u.roleName === 'Admin' ? 'badge-primary' : 'badge-warning'}`}>
                        {u.roleName}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.phone || 'N/A'}</td>
                    <td>
                      <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => toggleUserStatus(u)}
                          className={`btn btn-sm ${u.isActive ? 'btn-secondary' : 'btn-primary'}`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {u.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                          <span>{u.isActive ? 'Disable' : 'Activate'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '0' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User / Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Entity ID</th>
                  <th>IP Address</th>
                  <th>Details / Changes</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {log.full_name || log.username || 'System'}
                    </td>
                    <td>
                      <span className="badge badge-primary">{log.action}</span>
                    </td>
                    <td><code>{log.entity}</code></td>
                    <td>{log.entity_id || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.ip_address || '127.0.0.1'}</td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.new_values || log.old_values || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
