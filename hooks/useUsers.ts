import { useState, useCallback } from 'react';
import { UiUser, UserRole } from '../types';
import { ApiService } from '../services/api';

export interface InviteInfo {
  token: string;
  email: string;
  role: string;
  expiresAt: number;
  createdBy: string;
  createdAt: number;
}

export interface InviteResult {
  ok: boolean;
  invite: { email: string; expiryDays: number };
  mockUrl?: string;
}

export interface UseUsersReturn {
  users: UiUser[];
  usersLoading: boolean;
  usersError: string | null;
  userCreateError: string | null;
  userCreateLoading: boolean;
  newUserName: string;
  newUserPassword: string;
  newUserRole: UserRole;
  userRoleDrafts: Record<string, UserRole>;
  userPasswordDrafts: Record<string, string>;
  userSaving: Record<string, boolean>;
  userSaveErrors: Record<string, string | null>;
  // Invite state
  invites: InviteInfo[];
  invitesLoading: boolean;
  invitesError: string | null;
  inviteEmail: string;
  inviteSending: boolean;
  inviteResult: InviteResult | null;
  inviteError: string | null;
  setUsers: React.Dispatch<React.SetStateAction<UiUser[]>>;
  setUsersLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUsersError: React.Dispatch<React.SetStateAction<string | null>>;
  setUserCreateError: React.Dispatch<React.SetStateAction<string | null>>;
  setUserCreateLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setNewUserName: React.Dispatch<React.SetStateAction<string>>;
  setNewUserPassword: React.Dispatch<React.SetStateAction<string>>;
  setNewUserRole: React.Dispatch<React.SetStateAction<UserRole>>;
  setUserRoleDrafts: React.Dispatch<React.SetStateAction<Record<string, UserRole>>>;
  setUserPasswordDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setUserSaving: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUserSaveErrors: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  setInviteEmail: React.Dispatch<React.SetStateAction<string>>;
  setInviteResult: React.Dispatch<React.SetStateAction<InviteResult | null>>;
  fetchUsers: (handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleCreateUser: (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleRoleSave: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handlePasswordSave: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  fetchInvites: (handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleSendInvite: (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleCancelInvite: (tokenPrefix: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleDeleteUser: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  resetUsersState: () => void;
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<UiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userCreateError, setUserCreateError] = useState<string | null>(null);
  const [userCreateLoading, setUserCreateLoading] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, UserRole>>({});
  const [userPasswordDrafts, setUserPasswordDrafts] = useState<Record<string, string>>({});
  const [userSaving, setUserSaving] = useState<Record<string, boolean>>({});
  const [userSaveErrors, setUserSaveErrors] = useState<Record<string, string | null>>({});

  // Invite state
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (handleAuthFailure: (err: unknown) => boolean) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await ApiService.listUsers();
      setUsers(list);
      const roleDrafts: Record<string, UserRole> = {};
      list.forEach(user => {
        roleDrafts[user.username] = user.role;
      });
      setUserRoleDrafts(roleDrafts);
      setUserSaveErrors({});
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('User list fetch failed', err);
      setUsersError('Unable to load users.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const handleCreateUser = useCallback(async (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => {
    e.preventDefault();
    const username = newUserName.trim();
    const password = newUserPassword;
    if (!username || !password) {
      setUserCreateError('Username and password are required.');
      return;
    }
    setUserCreateError(null);
    setUserCreateLoading(true);
    try {
      await ApiService.createUser(username, password, newUserRole);
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRole('user');
      await fetchUsers(handleAuthFailure);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('User create failed', err);
      const status = (err as any)?.status;
      if (status === 409) {
        setUserCreateError('User already exists.');
      } else if (status === 400) {
        setUserCreateError('Username must be 1–64 chars with no spaces, and password is required.');
      } else {
        setUserCreateError('Failed to create user.');
      }
    } finally {
      setUserCreateLoading(false);
    }
  }, [newUserName, newUserPassword, newUserRole, fetchUsers]);

  const handleRoleSave = useCallback(async (username: string, handleAuthFailure: (err: unknown) => boolean) => {
    const role = userRoleDrafts[username] || 'user';
    setUserSaveErrors(prev => ({ ...prev, [username]: null }));
    setUserSaving(prev => ({ ...prev, [username]: true }));
    try {
      await ApiService.updateUserRole(username, role);
      await fetchUsers(handleAuthFailure);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Role update failed', err);
      setUserSaveErrors(prev => ({ ...prev, [username]: 'Failed to update role.' }));
    } finally {
      setUserSaving(prev => ({ ...prev, [username]: false }));
    }
  }, [userRoleDrafts, fetchUsers]);

  const handlePasswordSave = useCallback(async (username: string, handleAuthFailure: (err: unknown) => boolean) => {
    const password = userPasswordDrafts[username] || '';
    if (!password) {
      setUserSaveErrors(prev => ({ ...prev, [username]: 'Password cannot be empty.' }));
      return;
    }
    setUserSaveErrors(prev => ({ ...prev, [username]: null }));
    setUserSaving(prev => ({ ...prev, [username]: true }));
    try {
      await ApiService.updateUserPassword(username, password);
      setUserPasswordDrafts(prev => ({ ...prev, [username]: '' }));
      await fetchUsers(handleAuthFailure);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Password update failed', err);
      setUserSaveErrors(prev => ({ ...prev, [username]: 'Failed to update password.' }));
    } finally {
      setUserSaving(prev => ({ ...prev, [username]: false }));
    }
  }, [userPasswordDrafts, fetchUsers]);

  // Invite functions
  const fetchInvites = useCallback(async (handleAuthFailure: (err: unknown) => boolean) => {
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const list = await ApiService.listInvites();
      setInvites(list);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Invite list fetch failed', err);
      setInvitesError('Unable to load invites.');
    } finally {
      setInvitesLoading(false);
    }
  }, []);

  const handleSendInvite = useCallback(async (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setInviteError('Please enter a valid email address.');
      return;
    }
    setInviteError(null);
    setInviteResult(null);
    setInviteSending(true);
    try {
      const result = await ApiService.createInvite(email);
      setInviteResult(result);
      setInviteEmail('');
      await fetchInvites(handleAuthFailure);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Invite send failed', err);
      const status = (err as any)?.status;
      if (status === 409) {
        setInviteError('User with this email already exists.');
      } else {
        setInviteError('Failed to send invite.');
      }
    } finally {
      setInviteSending(false);
    }
  }, [inviteEmail, fetchInvites]);

  const handleCancelInvite = useCallback(async (tokenPrefix: string, handleAuthFailure: (err: unknown) => boolean) => {
    try {
      await ApiService.cancelInvite(tokenPrefix);
      await fetchInvites(handleAuthFailure);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Invite cancel failed', err);
      setInvitesError('Failed to cancel invite.');
    }
  }, [fetchInvites]);

  const handleDeleteUser = useCallback(async (username: string, handleAuthFailure: (err: unknown) => boolean) => {
    setUserSaving(prev => ({ ...prev, [username]: true }));
    setUserSaveErrors(prev => ({ ...prev, [username]: null }));
    try {
      await ApiService.deleteUser(username);
      await fetchUsers(handleAuthFailure);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('User delete failed', err);
      const status = (err as any)?.status;
      if (status === 400) {
        setUserSaveErrors(prev => ({ ...prev, [username]: 'Cannot delete own account.' }));
      } else {
        setUserSaveErrors(prev => ({ ...prev, [username]: 'Failed to delete user.' }));
      }
    } finally {
      setUserSaving(prev => ({ ...prev, [username]: false }));
    }
  }, [fetchUsers]);

  const resetUsersState = useCallback(() => {
    setUsers([]);
    setUsersLoading(false);
    setUsersError(null);
    setUserCreateError(null);
    setUserCreateLoading(false);
    setNewUserName('');
    setNewUserPassword('');
    setNewUserRole('user');
    setUserRoleDrafts({});
    setUserPasswordDrafts({});
    setUserSaving({});
    setUserSaveErrors({});
    // Reset invite state
    setInvites([]);
    setInvitesLoading(false);
    setInvitesError(null);
    setInviteEmail('');
    setInviteSending(false);
    setInviteResult(null);
    setInviteError(null);
  }, []);

  return {
    users,
    usersLoading,
    usersError,
    userCreateError,
    userCreateLoading,
    newUserName,
    newUserPassword,
    newUserRole,
    userRoleDrafts,
    userPasswordDrafts,
    userSaving,
    userSaveErrors,
    // Invite state
    invites,
    invitesLoading,
    invitesError,
    inviteEmail,
    inviteSending,
    inviteResult,
    inviteError,
    setUsers,
    setUsersLoading,
    setUsersError,
    setUserCreateError,
    setUserCreateLoading,
    setNewUserName,
    setNewUserPassword,
    setNewUserRole,
    setUserRoleDrafts,
    setUserPasswordDrafts,
    setUserSaving,
    setUserSaveErrors,
    setInviteEmail,
    setInviteResult,
    fetchUsers,
    handleCreateUser,
    handleRoleSave,
    handlePasswordSave,
    fetchInvites,
    handleSendInvite,
    handleCancelInvite,
    handleDeleteUser,
    resetUsersState,
  };
}
