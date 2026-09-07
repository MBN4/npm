import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Pill, Lock, User as UserIcon, AlertCircle, ShieldCheck } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const result = await login(username, password);
    setIsLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Authentication failed');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#090d16',
        padding: '1.5rem'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '2.5rem',
          backgroundColor: '#111827',
          borderRadius: '14px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          border: '1px solid #1f2937'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              border: '1px solid #334155'
            }}
          >
            <Pill size={28} />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.02em' }}>
            Naveed Medical Pharmacy
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Enterprise POS, Inventory & Management System
          </p>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#fca5a5',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                style={{ paddingLeft: '2.5rem', backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
              />
              <UserIcon size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                style={{ paddingLeft: '2.5rem', backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', fontSize: '0.95rem' }}
          >
            {isLoading ? 'Authenticating...' : 'Sign In as Administrator'}
          </button>
        </form>

        {/* Administrator Credentials & Security Badge */}
        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#94a3b8',
            fontSize: '0.75rem'
          }}
        >
          <ShieldCheck size={20} style={{ color: '#10b981', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#f1f5f9' }}>Administrator Role (All Capabilities)</div>
            <div style={{ color: '#64748b', marginTop: '0.15rem' }}>
              Credentials: <code style={{ color: '#38bdf8' }}>admin</code> / <code style={{ color: '#38bdf8' }}>admin123</code> with unrestricted access to POS, Inventory, Accounts, Purchases, AI & Backups.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
