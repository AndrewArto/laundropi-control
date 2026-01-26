import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsView } from '../views/SettingsView';
import type { UserRole } from '../../types';

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
    newUserRole: 'user' as UserRole,
    userRoleDrafts: {},
    userPasswordDrafts: {},
    userSaving: {},
    userSaveErrors: {},
    // Invite props
    invites: [],
    invitesLoading: false,
    invitesError: null,
    inviteEmail: '',
    inviteSending: false,
    inviteResult: null,
    inviteError: null,
    setNewUserName: vi.fn(),
    setNewUserPassword: vi.fn(),
    setNewUserRole: vi.fn(),
    setUserRoleDrafts: vi.fn(),
    setUserPasswordDrafts: vi.fn(),
    setInviteEmail: vi.fn(),
    setInviteResult: vi.fn(),
    fetchUsers: vi.fn(),
    fetchInvites: vi.fn(),
    handleCreateUserFromHook: vi.fn(),
    handleRoleSaveFromHook: vi.fn(),
    handlePasswordSaveFromHook: vi.fn(),
    handleSendInviteFromHook: vi.fn(),
    handleCancelInviteFromHook: vi.fn(),
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
