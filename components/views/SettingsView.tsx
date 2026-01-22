import React from 'react';
import { Settings, Plus } from 'lucide-react';
import { UiUser } from '../../types';

interface SettingsViewProps {
  authUser: UiUser | null;
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
  setNewUserName: React.Dispatch<React.SetStateAction<string>>;
  setNewUserPassword: React.Dispatch<React.SetStateAction<string>>;
  setNewUserRole: React.Dispatch<React.SetStateAction<'admin' | 'user'>>;
  setUserRoleDrafts: React.Dispatch<React.SetStateAction<Record<string, 'admin' | 'user'>>>;
  setUserPasswordDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fetchUsers: () => Promise<void>;
  handleCreateUserFromHook: (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleRoleSaveFromHook: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handlePasswordSaveFromHook: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleAuthFailure: (err: unknown) => boolean;
  formatLastLogin: (ts: number | null) => string;
}

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
  const {
    authUser,
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
    setNewUserName,
    setNewUserPassword,
    setNewUserRole,
    setUserRoleDrafts,
    setUserPasswordDrafts,
    fetchUsers,
    handleCreateUserFromHook,
    handleRoleSaveFromHook,
    handlePasswordSaveFromHook,
    handleAuthFailure,
    formatLastLogin,
  } = props;

  const renderSystem = () => {
    if (authUser?.role !== 'admin') {
      return (
        <div className="text-center py-20 text-slate-500">
          <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg text-slate-300 font-medium mb-2">System</h3>
          <p className="text-sm max-w-sm mx-auto">Admin access is required to manage users.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-300" />
            <h2 className="text-xl font-bold text-white">System</h2>
          </div>
          <button
            onClick={fetchUsers}
            disabled={usersLoading}
            className="px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            {usersLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">User Management</h3>
            <p className="text-xs text-slate-400">Create users, set passwords, and manage roles.</p>
          </div>

          {usersError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {usersError}
            </div>
          )}

          {usersLoading && (
            <div className="text-sm text-slate-400">Loading users...</div>
          )}

          {!usersLoading && (
            <div className="space-y-3">
              {users.length === 0 && (
                <div className="text-sm text-slate-500 bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                  No users yet.
                </div>
              )}
              {users.map(user => {
                const saving = Boolean(userSaving[user.username]);
                const roleValue = userRoleDrafts[user.username] ?? user.role;
                const passwordValue = userPasswordDrafts[user.username] ?? '';
                return (
                  <div key={user.username} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-100 font-medium">{user.username}</div>
                        <div className="text-[11px] text-slate-500">Last login: {formatLastLogin(user.lastLoginAt)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={roleValue}
                          onChange={(e) => {
                            const value = e.target.value === 'admin' ? 'admin' : 'user';
                            setUserRoleDrafts(prev => ({ ...prev, [user.username]: value }));
                          }}
                          className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="admin">admin</option>
                          <option value="user">user</option>
                        </select>
                        <button
                          onClick={() => handleRoleSaveFromHook(user.username, handleAuthFailure)}
                          disabled={saving}
                          className="px-2 py-1 text-xs rounded-md border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Update role'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2">
                      <input
                        type="password"
                        value={passwordValue}
                        onChange={(e) => setUserPasswordDrafts(prev => ({ ...prev, [user.username]: e.target.value }))}
                        placeholder="New password"
                        className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={() => handlePasswordSaveFromHook(user.username, handleAuthFailure)}
                        disabled={saving}
                        className="px-3 py-2 text-xs rounded-md border border-amber-500 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Set password'}
                      </button>
                    </div>

                    {userSaveErrors[user.username] && (
                      <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1">
                        {userSaveErrors[user.username]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <form onSubmit={(e) => handleCreateUserFromHook(e, handleAuthFailure)} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-300" />
            <h3 className="text-base font-semibold text-white">Add user</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Username"
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Password"
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value === 'admin' ? 'admin' : 'user')}
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>

          {userCreateError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {userCreateError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={userCreateLoading}
              className="px-4 py-2 rounded-md text-xs font-semibold border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              {userCreateLoading ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  return renderSystem();
};
