import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Moon,
  Sun,
  LogOut,
  Bell,
  Check,
  AlertTriangle,
  Info,
  Ban,
  KeyRound,
  Eye,
  EyeOff,
  X,
  BookOpen,
  RefreshCw,
  Search,
  Pill,
  Users,
  FileText,
  ChevronDown
} from 'lucide-react';
import { AdminGuideModal } from './AdminGuideModal.js';
import { CashOutModal } from './CashOutModal.js';
import { NavView } from './Sidebar.js';
import { getOfflineSalesQueue, syncOfflineSalesToServer } from '../services/offlineSync.js';

interface HeaderProps {
  currentView?: NavView;
  onNavigate?: (view: NavView) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView = 'pos', onNavigate }) => {
  const { user, logout, theme, toggleTheme, token } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Network & Sync State
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getOfflineSalesQueue().length);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Global Search State
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Operations Guide & Cash Out State
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [showCashOutModal, setShowCashOutModal] = useState<boolean>(false);

  // Change Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // Network & Sync listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleTriggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    const handleQueueChange = () => {
      setPendingSyncCount(getOfflineSalesQueue().length);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('nmp-offline-queue-changed', handleQueueChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('nmp-offline-queue-changed', handleQueueChange);
    };
  }, [token]);

  const handleTriggerSync = async () => {
    if (!token || isSyncing) return;
    setIsSyncing(true);
    setSyncStatusMsg('Syncing offline sales...');
    try {
      const result = await syncOfflineSalesToServer(token);
      setPendingSyncCount(getOfflineSalesQueue().length);
      setSyncStatusMsg(result.message);
      setTimeout(() => setSyncStatusMsg(null), 3500);
    } catch (err: any) {
      setSyncStatusMsg('Sync failed: ' + err.message);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Global Search API call
  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.trim().length < 2) {
      setGlobalSearchResults(null);
      setShowSearchResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/catalog/global-search?q=${encodeURIComponent(globalSearchQuery.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setGlobalSearchResults(data.results || null);
          setShowSearchResults(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [globalSearchQuery, token]);

  // Click outside to dismiss search results and user menu
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [token]);

  const handleMarkAsRead = async (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 6) {
      setPasswordStatus({ text: 'New password must be at least 6 characters long.', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }

    setIsChanging(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordStatus({ text: data.error || 'Failed to update password.', type: 'error' });
        return;
      }

      setPasswordStatus({ text: 'Password successfully updated!', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordStatus(null);
      }, 1500);
    } catch (err: any) {
      setPasswordStatus({ text: err.message || 'Network error', type: 'error' });
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <>
      <header className="top-header">
        {/* Left: Branch & Terminal Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(2, 132, 199, 0.08)',
              border: '1px solid rgba(2, 132, 199, 0.2)',
              fontSize: '0.75rem'
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>🏥</span>
            <div>
              <div style={{ fontWeight: 700, lineHeight: 1.1, fontSize: '0.76rem' }}>Hospital Road Branch</div>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Counter 01 • Active</div>
            </div>
          </div>
        </div>

        {/* Center: Flexible Global Search Bar */}
        <div ref={searchContainerRef} style={{ position: 'relative', flex: 1, maxWidth: '440px', margin: '0 0.5rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input input-sm"
              style={{ paddingLeft: '2.1rem', paddingRight: '2rem', height: '36px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)' }}
              placeholder="Search Medicines, Barcode, Patients (F2)..."
              value={globalSearchQuery}
              onChange={e => setGlobalSearchQuery(e.target.value)}
              onFocus={() => {
                if (globalSearchResults) setShowSearchResults(true);
              }}
            />
            {isSearching && (
              <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
          </div>

          {/* Global Search Popup Dropdown */}
          {showSearchResults && globalSearchResults && (
            <div
              style={{
                position: 'absolute',
                top: '115%',
                left: 0,
                width: '100%',
                minWidth: '380px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-glass)',
                zIndex: 200,
                maxHeight: '400px',
                overflowY: 'auto',
                padding: '0.5rem'
              }}
            >
              {/* Medicines */}
              {globalSearchResults.medicines?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0.2rem 0.5rem' }}>
                    Medicines & Barcodes
                  </div>
                  {globalSearchResults.medicines.map((m: any) => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setShowSearchResults(false);
                        if (onNavigate) onNavigate('medicines');
                      }}
                      style={{ padding: '0.4rem 0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}
                      className="hover-bg"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Pill size={14} style={{ color: 'var(--primary)' }} />
                        <div>
                          <strong>{m.title}</strong> {m.strength} ({m.generic_name})
                        </div>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: m.total_stock > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {m.total_stock} in stock
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Customers */}
              {globalSearchResults.customers?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0.2rem 0.5rem' }}>
                    Patients / Customers
                  </div>
                  {globalSearchResults.customers.map((c: any) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setShowSearchResults(false);
                        if (onNavigate) onNavigate('patients');
                      }}
                      style={{ padding: '0.4rem 0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}
                      className="hover-bg"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Users size={14} style={{ color: '#06b6d4' }} />
                        <span><strong>{c.title}</strong> ({c.subtitle})</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: c.current_balance > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
                        Udhar: Rs. {c.current_balance}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Invoices */}
              {globalSearchResults.sales?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '0.2rem 0.5rem' }}>
                    Sales Invoices
                  </div>
                  {globalSearchResults.sales.map((s: any) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setShowSearchResults(false);
                        if (onNavigate) onNavigate('pos');
                      }}
                      style={{ padding: '0.4rem 0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}
                      className="hover-bg"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FileText size={14} style={{ color: '#8b5cf6' }} />
                        <span><strong>{s.title}</strong> — {s.customer_name || 'Walk-in'}</span>
                      </div>
                      <span style={{ fontWeight: 700 }}>Rs. {s.total_amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {/* Real-Time Online / Offline Status Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: isOnline ? 'var(--success)' : 'var(--danger)',
              fontSize: '0.72rem',
              fontWeight: 700
            }}
            title={isOnline ? 'Connected to local/network server' : 'Running in Local Offline Mode'}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isOnline ? 'var(--success)' : 'var(--danger)', boxShadow: isOnline ? '0 0 6px var(--success)' : 'none' }} />
            <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          {/* Pending Offline Sync Counter & Trigger */}
          {pendingSyncCount > 0 && (
            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="btn btn-warning btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', padding: '0.35rem 0.65rem' }}
              title="Click to synchronize queued offline sales to server"
            >
              <RefreshCw size={13} className={isSyncing ? 'spin-anim' : ''} />
              <span>Sync: {pendingSyncCount}</span>
            </button>
          )}

          {syncStatusMsg && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {syncStatusMsg}
            </span>
          )}

          {/* Udhaar Quick Action Button */}
          <button
            onClick={() => onNavigate && onNavigate('udhaar')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              fontSize: '0.78rem',
              background: currentView === 'udhaar' ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)',
              cursor: 'pointer'
            }}
            title="Open Customer Udhaar & Credit Management"
          >
            <Users size={14} />
            <span>Udhaar</span>
          </button>

          {/* Cash Out Quick Action Button */}
          <button
            onClick={() => setShowCashOutModal(true)}
            className="btn btn-secondary btn-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.65rem',
              fontSize: '0.78rem',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              fontWeight: 700
            }}
            title="Record Expense or Fund Transfer from Cash Drawer"
          >
            <span>💸 Cash Out</span>
          </button>

          {/* Operations Guide Button */}
          <button
            onClick={() => setShowGuideModal(true)}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
            title="Open Step-by-Step Operations Manual"
          >
            <BookOpen size={14} />
            <span>Manual</span>
          </button>

          {/* Notifications Center */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="btn btn-secondary btn-sm"
              style={{ width: '34px', height: '34px', padding: 0, position: 'relative' }}
              title="Notification Center"
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    backgroundColor: 'var(--danger)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '16px',
                    height: '16px',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 2px var(--bg-surface)'
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  width: '340px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-glass)',
                  zIndex: 100,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Pharmacy Alerts ({unreadCount})</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      style={{ fontSize: '0.72rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      No notifications at this time.
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        style={{
                          padding: '0.75rem 1rem',
                          borderBottom: '1px solid var(--border)',
                          backgroundColor: n.is_read ? 'transparent' : 'rgba(2, 132, 199, 0.04)',
                          display: 'flex',
                          gap: '0.75rem',
                          alignItems: 'start'
                        }}
                      >
                        <div style={{ marginTop: '2px' }}>
                          {n.type === 'DANGER' ? (
                            <Ban size={15} style={{ color: 'var(--danger)' }} />
                          ) : n.type === 'WARNING' ? (
                            <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />
                          ) : (
                            <Info size={15} style={{ color: 'var(--primary)' }} />
                          )}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{n.title}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: '1.4' }}>
                            {n.message}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                            {new Date(n.created_at).toLocaleTimeString()}
                          </div>
                        </div>

                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkAsRead(n.id)}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            title="Mark read"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="btn btn-secondary btn-sm"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            style={{ width: '34px', height: '34px', padding: 0 }}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* User Profile Pill & Actions Dropdown */}
          {user && (
            <div ref={userMenuRef} style={{ position: 'relative', marginLeft: '0.25rem' }}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border)'
                }}
                title="Account Menu"
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.72rem'
                  }}
                >
                  {user.username.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                    {user.fullName ? user.fullName.split(' ')[0] : user.username}
                  </div>
                </div>
                <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '120%',
                    right: 0,
                    width: '220px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-glass)',
                    zIndex: 150,
                    padding: '0.4rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem'
                  }}
                >
                  <div style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{user.fullName || user.username}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Role: <span className="badge badge-primary" style={{ fontSize: '0.62rem', padding: '0.05rem 0.35rem' }}>{user.roleName}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowPasswordModal(true);
                      setPasswordStatus(null);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'none', padding: '0.45rem 0.65rem' }}
                  >
                    <KeyRound size={14} />
                    <span>Change Password</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'none', color: 'var(--danger)', padding: '0.45rem 0.65rem' }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* CHANGE PASSWORD MODAL */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              padding: '1.75rem',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <KeyRound size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Change Password</h3>
              </div>
              <button
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {passwordStatus && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: passwordStatus.type === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
                  color: passwordStatus.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}
              >
                {passwordStatus.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Current Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    className="input"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  New Password (min. 6 characters)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    placeholder="Enter new password"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Confirm New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="input"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn btn-secondary"
                  disabled={isChanging}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isChanging}
                >
                  {isChanging ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OPERATIONS GUIDE MODAL */}
      <AdminGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialTab={currentView}
        onNavigateToTab={onNavigate}
      />

      {/* CASHOUT MODAL */}
      <CashOutModal
        isOpen={showCashOutModal}
        onClose={() => setShowCashOutModal(false)}
      />
    </>
  );
};
