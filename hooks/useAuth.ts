import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiService } from '../services/api';

export interface AuthUser {
  username: string;
  role: string;
}

export interface UseAuthReturn {
  // State
  isAuthenticated: boolean;
  isAuthReady: boolean;
  authUser: AuthUser | null;
  authLogin: string;
  authPassword: string;
  authError: string;

  // Setters for form inputs
  setAuthLogin: (value: string) => void;
  setAuthPassword: (value: string) => void;
  setAuthError: (value: string) => void;

  // Actions
  handleLoginSubmit: (e: React.FormEvent) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleAuthFailure: (err: unknown) => boolean;

  // Ref for other components to check auth status
  isAuthenticatedRef: React.MutableRefObject<boolean>;
}

export const useAuth = (onStateReset?: () => void): UseAuthReturn => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const isAuthenticatedRef = useRef(false);

  // Check session on mount
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const session = await ApiService.getSession();
        if (cancelled) return;

        if (session?.user) {
          setIsAuthenticated(true);
          isAuthenticatedRef.current = true;
          setAuthUser(session.user);
        } else {
          setIsAuthenticated(false);
          isAuthenticatedRef.current = false;
          setAuthUser(null);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
          isAuthenticatedRef.current = false;
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsAuthReady(true);
        }
      }
    };

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  const handleAuthFailure = useCallback((err: unknown): boolean => {
    const status = (err as any)?.status;
    if (status !== 401) return false;

    setAuthError('Session expired. Please sign in again.');
    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    setAuthUser(null);
    setAuthPassword('');

    // Call the state reset callback if provided
    if (onStateReset) {
      onStateReset();
    }

    return true;
  }, [onStateReset]);

  const handleLoginSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    try {
      const login = await ApiService.login(authLogin.trim(), authPassword);
      setIsAuthenticated(true);
      isAuthenticatedRef.current = true;
      const nextUser = login.user || { username: authLogin.trim(), role: 'user' };
      setAuthUser(nextUser);
      setAuthPassword('');

      // Call the state reset callback if provided
      if (onStateReset) {
        onStateReset();
      }
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 401) {
        setAuthError('Invalid username or password.');
      } else {
        setAuthError('Could not sign in. Please try again.');
      }
    }
  }, [authLogin, authPassword, onStateReset]);

  const handleLogout = useCallback(async () => {
    try {
      await ApiService.logout();
    } catch {
      // ignore logout failures
    }

    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    setAuthUser(null);
    setAuthLogin('');
    setAuthPassword('');
    setAuthError('');

    // Call the state reset callback if provided
    if (onStateReset) {
      onStateReset();
    }
  }, [onStateReset]);

  return {
    isAuthenticated,
    isAuthReady,
    authUser,
    authLogin,
    authPassword,
    authError,
    setAuthLogin,
    setAuthPassword,
    setAuthError,
    handleLoginSubmit,
    handleLogout,
    handleAuthFailure,
    isAuthenticatedRef,
  };
};
