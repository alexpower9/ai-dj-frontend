import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import axios from 'axios';

export interface User {
  id: number;
  username: string;
  email: string;
  created_at?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isGuest: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  continueAsGuest: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('aidj_token'),
    isGuest: localStorage.getItem('aidj_guest') === 'true',
    isLoading: true,
  });

  // On mount, verify stored token
  useEffect(() => {
    const token = localStorage.getItem('aidj_token');
    if (token) {
      axios
        .get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          setState({ user: res.data, token, isGuest: false, isLoading: false });
        })
        .catch(() => {
          // Token invalid/expired — clear it
          localStorage.removeItem('aidj_token');
          setState({ user: null, token: null, isGuest: false, isLoading: false });
        });
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await axios.post('/api/auth/login', { username, password });
    const { token, user } = res.data;
    localStorage.setItem('aidj_token', token);
    localStorage.removeItem('aidj_guest');
    setState({ user, token, isGuest: false, isLoading: false });
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await axios.post('/api/auth/register', { username, email, password });
    const { token, user } = res.data;
    localStorage.setItem('aidj_token', token);
    localStorage.removeItem('aidj_guest');
    setState({ user, token, isGuest: false, isLoading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('aidj_token');
    localStorage.removeItem('aidj_guest');
    setState({ user: null, token: null, isGuest: false, isLoading: false });
  }, []);

  const continueAsGuest = useCallback(() => {
    localStorage.setItem('aidj_guest', 'true');
    localStorage.removeItem('aidj_token');
    setState({ user: null, token: null, isGuest: true, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        continueAsGuest,
        isAuthenticated: !!state.token && !!state.user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
