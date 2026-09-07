import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Pill, Lock, User as UserIcon, AlertCircle, ShieldCheck, Eye, EyeOff, KeyRound, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();

  // Mode: 'login' | 'forgot' | 'verify-otp'
  const [mode, setMode] = useState<'login' | 'forgot' | 'verify-otp'>('login');

  // Login credentials
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password & OTP state
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Feedback states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    const result = await login(username, password);
    setIsLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: username || 'admin' })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to dispatch security OTP.');
        return;
      }

      setSuccessMessage(data.message);
      if (data.otpPreview) {
        setOtp(data.otpPreview);
        setOtpNotice(`Security OTP generated: ${data.otpPreview}`);
      }
      setMode('verify-otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error while contacting authentication service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation password do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/verify-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to verify OTP or update password.');
        return;
      }

      setSuccessMessage('Password has been successfully updated! Please sign in with your new password.');
      setPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setOtp('');
      setOtpNotice(null);
      setMode('login');
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error during password reset.');
    } finally {
      setIsLoading(false);
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
        padding: '1.5rem',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '450px',
          padding: '2.5rem',
          backgroundColor: '#111827',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          border: '1px solid #1f2937'
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              border: '1px solid #334155'
            }}
          >
            {mode === 'login' ? <Pill size={28} /> : <KeyRound size={28} />}
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.02em' }}>
            Naveed Medical Pharmacy
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            {mode === 'login' && 'Enterprise POS, Inventory & Clinical Safety Terminal'}
            {mode === 'forgot' && 'Administrator Password Recovery'}
            {mode === 'verify-otp' && 'Verify OTP & Set New Password'}
          </p>
        </div>

        {/* Alerts */}
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
              gap: '0.6rem',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}
          >
            <AlertCircle size={17} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#6ee7b7',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
          >
            <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {otpNotice && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              color: '#7dd3fc',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={16} />
              <span>{otpNotice}</span>
            </div>
          </div>
        )}

        {/* 1. SIGN IN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
                Administrator Username
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  style={{
                    width: '100%',
                    padding: '0.7rem 1rem 0.7rem 2.5rem',
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.9rem'
                  }}
                />
                <UserIcon size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setMode('forgot');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Forgot Password?
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  style={{
                    width: '100%',
                    padding: '0.7rem 2.8rem 0.7rem 2.5rem',
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.9rem'
                  }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                
                {/* Eye Icon Button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginTop: '0.5rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: '8px'
              }}
            >
              {isLoading ? 'Signing In...' : 'Sign In as Administrator'}
            </button>
          </form>
        )}

        {/* 2. FORGOT PASSWORD REQUEST FORM */}
        {mode === 'forgot' && (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '8px',
                fontSize: '0.82rem',
                color: '#cbd5e1',
                lineHeight: 1.5
              }}
            >
              For security compliance, verification OTP codes are strictly dispatched only to the authorized pharmacy administrator email:
              <div style={{ marginTop: '0.4rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                bn73147@gmail.com
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
                Confirm Administrator Account
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="input"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  style={{
                    width: '100%',
                    padding: '0.7rem 1rem 0.7rem 2.5rem',
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.9rem'
                  }}
                />
                <UserIcon size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              <Mail size={16} />
              <span>{isLoading ? 'Dispatching OTP...' : 'Send Security OTP to bn73147@gmail.com'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
                setMode('login');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem'
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Sign In</span>
            </button>
          </form>
        )}

        {/* 3. VERIFY OTP & SET NEW PASSWORD FORM */}
        {mode === 'verify-otp' && (
          <form onSubmit={handleVerifyOtpAndReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
                6-Digit Security OTP
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 748291"
                  required
                  style={{
                    width: '100%',
                    padding: '0.7rem 1rem 0.7rem 2.5rem',
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#38bdf8',
                    borderRadius: '8px',
                    fontSize: '1.1rem',
                    letterSpacing: '4px',
                    fontWeight: 700,
                    fontFamily: 'monospace'
                  }}
                />
                <KeyRound size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.3rem', display: 'block' }}>
                Code dispatched to bn73147@gmail.com (Valid for 10 min)
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
                New Administrator Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  style={{
                    width: '100%',
                    padding: '0.7rem 2.8rem 0.7rem 2.5rem',
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.9rem'
                  }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: '#cbd5e1' }}>
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  style={{
                    width: '100%',
                    padding: '0.7rem 2.8rem 0.7rem 2.5rem',
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '0.9rem'
                  }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.8rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || otp.length < 6}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: '8px',
                marginTop: '0.5rem'
              }}
            >
              {isLoading ? 'Resetting Password...' : 'Verify OTP & Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setSuccessMessage(null);
                setMode('login');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem'
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Sign In</span>
            </button>
          </form>
        )}

        {/* Security Footer Notice */}
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
            <div style={{ fontWeight: 700, color: '#f1f5f9' }}>Administrator Role (All Operations)</div>
            <div style={{ color: '#64748b', marginTop: '0.15rem' }}>
              Full system control • Password recovery OTP bound to <code style={{ color: '#38bdf8' }}>bn73147@gmail.com</code>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
