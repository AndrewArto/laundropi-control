import React from 'react';
import { Settings, Plus, Mail, X, Trash2 } from 'lucide-react';
import { UiUser, UserRole } from '../../types';
import type { InviteInfo, InviteResult } from '../../hooks/useUsers';

interface SettingsViewProps {
  authUser: UiUser | null;
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
  // Invite props
  invites: InviteInfo[];
  invitesLoading: boolean;
  invitesError: string | null;
  inviteEmail: string;
  inviteSending: boolean;
  inviteResult: InviteResult | null;
  inviteError: string | null;
  setNewUserName: React.Dispatch<React.SetStateAction<string>>;
  setNewUserPassword: React.Dispatch<React.SetStateAction<string>>;
  setNewUserRole: React.Dispatch<React.SetStateAction<UserRole>>;
  setUserRoleDrafts: React.Dispatch<React.SetStateAction<Record<string, UserRole>>>;
  setUserPasswordDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setInviteEmail: React.Dispatch<React.SetStateAction<string>>;
  setInviteResult: React.Dispatch<React.SetStateAction<InviteResult | null>>;
  fetchUsers: () => Promise<void>;
  fetchInvites: () => Promise<void>;
  handleCreateUserFromHook: (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleRoleSaveFromHook: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handlePasswordSaveFromHook: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleSendInviteFromHook: (e: React.FormEvent, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleCancelInviteFromHook: (tokenPrefix: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  handleDeleteUserFromHook: (username: string, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
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
    // Invite state
    invites,
    invitesLoading,
    invitesError,
    inviteEmail,
    inviteSending,
    inviteResult,
    inviteError,
    setNewUserName,
    setNewUserPassword,
    setNewUserRole,
    setUserRoleDrafts,
    setUserPasswordDrafts,
    setInviteEmail,
    setInviteResult,
    fetchUsers,
    fetchInvites,
    handleCreateUserFromHook,
    handleRoleSaveFromHook,
    handlePasswordSaveFromHook,
    handleSendInviteFromHook,
    handleCancelInviteFromHook,
    handleDeleteUserFromHook,
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
                            setUserRoleDrafts(prev => ({ ...prev, [user.username]: e.target.value as UserRole }));
                          }}
                          className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="admin">admin</option>
                          <option value="user">user</option>
                          <option value="viewer">viewer</option>
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
                      {user.username !== authUser?.username && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
                              handleDeleteUserFromHook(user.username, handleAuthFailure);
                            }
                          }}
                          disabled={saving}
                          className="px-3 py-2 text-xs rounded-md border border-red-500 text-red-300 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="user">user</option>
              <option value="viewer">viewer</option>
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

        {/* Invite Viewer Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-300" />
                <h3 className="text-base font-semibold text-white">Invite Viewer</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">Send a 30-day read-only access invitation to potential clients.</p>
            </div>
            <button
              onClick={fetchInvites}
              disabled={invitesLoading}
              className="px-2 py-1 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 disabled:opacity-50"
            >
              {invitesLoading ? '...' : 'Refresh'}
            </button>
          </div>

          <form onSubmit={(e) => handleSendInviteFromHook(e, handleAuthFailure)} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={inviteSending}
              className="px-4 py-2 rounded-md text-xs font-semibold border border-emerald-500 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {inviteSending ? 'Sending...' : 'Send Invite'}
            </button>
          </form>

          {inviteError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {inviteError}
            </div>
          )}

          {inviteResult && (
            <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2">
              <div>Invitation sent to {inviteResult.invite.email}</div>
              {inviteResult.mockUrl && (
                <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                  <div className="text-amber-300 font-semibold text-xs">Dev Mode - Magic Link:</div>
                  <a href={inviteResult.mockUrl} target="_blank" rel="noopener noreferrer" className="text-amber-200 underline break-all text-xs">
                    {inviteResult.mockUrl}
                  </a>
                </div>
              )}
              <button
                onClick={() => setInviteResult(null)}
                className="mt-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Dismiss
              </button>
            </div>
          )}

          {invitesError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {invitesError}
            </div>
          )}

          {invites.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400 font-medium">Pending Invites</div>
              {invites.map(invite => (
                <div key={invite.token} className="flex items-center justify-between bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm text-slate-100">{invite.email}</div>
                    <div className="text-[11px] text-slate-500">
                      Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelInviteFromHook(invite.token.replace('...', ''), handleAuthFailure)}
                    className="p-1 text-slate-500 hover:text-red-400"
                    title="Cancel invite"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return renderSystem();
};
