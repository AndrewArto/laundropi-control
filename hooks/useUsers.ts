import { useState, useCallback } from 'react';
import { UiUser } from '../types';
import { ApiService } from '../services/api';

export interface UseUsersReturn {
  users: UiUser[];
  usersLoading: boolean;
  usersError: string | null;
  userCreateError: string | null;
  userCreateLoading: boolean;
  newUserName: string;
  newUserPassword: string;
  newUserRole: 'admin' | 'user';
  userRoleDrafts: Record<string, 'admin' | 'user'>;
  userPasswordDrafts: Record<string, string>;
  userSaving: Record<string, boolean>;
  userSaveErrors: Record<string, string | null>;
  setUsers: React.Dispatch<React.SetStateAction<UiUser[]>>;
  setUsersLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUsersError: React.Dispatch<React.SetStateAction<string | null>>;
  setUserCreateError: React.Dispatch<React.SetStateAction<string | null>>;
  setUserCreateLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setNewUserName: React.Dispatch<React.SetStateAction<string>>;
  setNewUserPassword: React.Dispatch<React.SetStateAction<string>>;
  setNewUserRole: React.Dispatch<React.SetStateAction<'admin' | 'user'>>;
  setUserRoleDrafts: React.Dispatch<React.SetStateAction<Record<string, 'admin' | 'user'>>>;
  setUserPasswordDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setUserSaving: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setUserSaveErrors: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  fetchUsers: (handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleCreateUser: (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleRoleSave: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handlePasswordSave: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
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
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, 'admin' | 'user'>>({});
  const [userPasswordDrafts, setUserPasswordDrafts] = useState<Record<string, string>>({});
  const [userSaving, setUserSaving] = useState<Record<string, boolean>>({});
  const [userSaveErrors, setUserSaveErrors] = useState<Record<string, string | null>>({});

  const fetchUsers = useCallback(async (handleAuthFailure: (err: unknown) => boolean) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await ApiService.listUsers();
      setUsers(list);
      const roleDrafts: Record<string, 'admin' | 'user'> = {};
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
    fetchUsers,
    handleCreateUser,
    handleRoleSave,
    handlePasswordSave,
    resetUsersState,
  };
}
