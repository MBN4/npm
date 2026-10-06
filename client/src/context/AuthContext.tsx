import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthResponse } from '../types/index.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('nmp_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('nmp_theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nmp_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (url.startsWith('/api')) {
        return await fetch(`http://127.0.0.1:5000${url}`, options);
      }
      throw err;
    }
  }

  // Server may be mid-restart (e.g. dev proxy with backend still compiling), which can
  // yield a connection reset with an empty body — parse defensively instead of letting
  // res.json() throw a raw "Unexpected end of JSON input" at the caller.
  async function safeJson(res: Response): Promise<any> {
    const text = await res.text();
    if (!text) {
      return { error: `Server is not responding yet (status ${res.status}). Please wait a moment and try again.` };
    }
    try {
      return JSON.parse(text);
    } catch {
      return { error: 'Received an unexpected response from the server. Please try again.' };
    }
  }

  useEffect(() => {
    async function verifyAuth() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await apiFetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await safeJson(res);
          setUser(data.user);
        } else {
          // Token expired or invalid
          localStorage.removeItem('nmp_token');
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Failed to verify token:', err);
      } finally {
        setIsLoading(false);
      }
    }

    verifyAuth();
  }, [token]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await safeJson(res);
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }

      const authData = data as AuthResponse;
      localStorage.setItem('nmp_token', authData.token);
      setToken(authData.token);
      setUser(authData.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network connection failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('nmp_token');
    setToken(null);
    setUser(null);
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.roleName === 'Admin') return true;
    return user.permissions.includes(permission);
  };

  const hasRole = (roles: string[]): boolean => {
    if (!user) return false;
    if (user.roleName === 'Admin') return true;
    return roles.includes(user.roleName);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        theme,
        toggleTheme,
        login,
        logout,
        hasPermission,
        hasRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
