import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';

describe('SettingsView', () => {
  const mockAdminUser = {
    username: 'admin',
    role: 'admin' as const,
    lastLoginAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockProps = {
    authUser: mockAdminUser,
    users: [mockAdminUser],
    usersLoading: false,
    usersError: null,
    userCreateError: null,
    userCreateLoading: false,
    newUserName: '',
    newUserPassword: '',
    newUserRole: 'user' as const,
    userRoleDrafts: {},
    userPasswordDrafts: {},
    userSaving: {},
    userSaveErrors: {},
    setNewUserName: vi.fn(),
    setNewUserPassword: vi.fn(),
    setNewUserRole: vi.fn(),
    setUserRoleDrafts: vi.fn(),
    setUserPasswordDrafts: vi.fn(),
    fetchUsers: vi.fn(),
    handleCreateUserFromHook: vi.fn(),
    handleRoleSaveFromHook: vi.fn(),
    handlePasswordSaveFromHook: vi.fn(),
    handleAuthFailure: vi.fn(),
    formatLastLogin: vi.fn(() => 'Just now'),
  };

  it('should render System header for admin', () => {
    render(<SettingsView {...mockProps} />);
    expect(screen.getByText('System')).toBeTruthy();
  });

  it('should show admin-only message for non-admin users', () => {
    const nonAdminProps = {
      ...mockProps,
      authUser: { ...mockAdminUser, role: 'user' as const },
    };
    render(<SettingsView {...nonAdminProps} />);
    expect(screen.getByText(/Admin access is required/i)).toBeTruthy();
  });

  it('should render user management section', () => {
    render(<SettingsView {...mockProps} />);
    expect(screen.getByText('User Management')).toBeTruthy();
  });

  it('should render without crashing when users array is empty', () => {
    const emptyProps = {
      ...mockProps,
      users: [],
    };
    render(<SettingsView {...emptyProps} />);
    expect(screen.getByText('System')).toBeTruthy();
  });
});
