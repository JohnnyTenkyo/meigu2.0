import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface AuthState {
  isLoggedIn: boolean;
  username: string | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => {
    const saved = localStorage.getItem('auth');
    return saved ? JSON.parse(saved) : { isLoggedIn: false, username: null };
  });

  useEffect(() => {
    localStorage.setItem('auth', JSON.stringify(auth));
  }, [auth]);

  const login = useCallback((username: string, password: string) => {
    if (username === 'admin' && password === '141225') {
      setAuth({ isLoggedIn: true, username });
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setAuth({ isLoggedIn: false, username: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
