import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { ApiService } from '../../services/api';

// Mock ApiService
vi.mock('../../services/api', () => ({
  ApiService: {
    getSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAuthReady).toBe(false);
    expect(result.current.authUser).toBe(null);
    expect(result.current.authLogin).toBe('');
    expect(result.current.authPassword).toBe('');
    expect(result.current.authError).toBe('');
  });

  it('should check session on mount', async () => {
    const mockUser = {
      username: 'admin',
      role: 'admin' as const,
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(ApiService.getSession).mockResolvedValueOnce({ user: mockUser });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthReady).toBe(true);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.authUser).toEqual(mockUser);
  });

  it('should handle login success', async () => {
    const mockUser = {
      username: 'testuser',
      role: 'user' as const,
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(ApiService.getSession).mockResolvedValueOnce({ user: null });
    vi.mocked(ApiService.login).mockResolvedValueOnce({ user: mockUser });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthReady).toBe(true);
    });

    act(() => {
      result.current.setAuthLogin('testuser');
      result.current.setAuthPassword('password');
    });

    await act(async () => {
      const mockEvent = { preventDefault: vi.fn() } as any;
      await result.current.handleLoginSubmit(mockEvent);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.authUser).toEqual(mockUser);
    expect(result.current.authError).toBe('');
  });

  it('should handle login failure', async () => {
    vi.mocked(ApiService.getSession).mockResolvedValueOnce({ user: null });
    vi.mocked(ApiService.login).mockRejectedValueOnce({
      status: 401,
      message: 'Invalid credentials'
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthReady).toBe(true);
    });

    act(() => {
      result.current.setAuthLogin('wronguser');
      result.current.setAuthPassword('wrongpass');
    });

    await act(async () => {
      const mockEvent = { preventDefault: vi.fn() } as any;
      await result.current.handleLoginSubmit(mockEvent);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authUser).toBe(null);
    expect(result.current.authError).toContain('Invalid');
  });

  it('should handle logout', async () => {
    const mockUser = {
      username: 'admin',
      role: 'admin' as const,
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(ApiService.getSession).mockResolvedValueOnce({ user: mockUser });
    vi.mocked(ApiService.logout).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authUser).toBe(null);
    expect(result.current.authLogin).toBe('');
    expect(result.current.authPassword).toBe('');
  });

  it('should handle auth failure with 401 status', async () => {
    const mockUser = {
      username: 'admin',
      role: 'admin' as const,
      lastLoginAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    vi.mocked(ApiService.getSession).mockResolvedValueOnce({ user: mockUser });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    const error = { status: 401 };
    let handled: boolean;

    act(() => {
      handled = result.current.handleAuthFailure(error);
    });

    expect(handled!).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.authUser).toBe(null);
  });

  it('should not handle auth failure with non-401 status', async () => {
    vi.mocked(ApiService.getSession).mockResolvedValueOnce({ user: null });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthReady).toBe(true);
    });

    const error = { status: 500 };
    const handled = result.current.handleAuthFailure(error);

    expect(handled).toBe(false);
  });
});
