import React from 'react';

interface LoginFormProps {
  authLogin: string;
  authPassword: string;
  authError: string;
  brandLogoUrl: string;
  setAuthLogin: (value: string) => void;
  setAuthPassword: (value: string) => void;
  handleLoginSubmit: (e: React.FormEvent) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  authLogin,
  authPassword,
  authError,
  brandLogoUrl,
  setAuthLogin,
  setAuthPassword,
  handleLoginSubmit,
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm bg-slate-800/70 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col items-center text-center gap-4">
          <img
            src={brandLogoUrl}
            alt="WashControl"
            className="w-full max-w-[240px] sm:max-w-[320px] lg:max-w-[360px] h-auto"
          />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Secure Access</p>
            <h2 className="text-lg font-semibold text-white">LaundroPi Control</h2>
          </div>
        </div>
        <form className="space-y-4" onSubmit={handleLoginSubmit}>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Username</label>
            <input
              value={authLogin}
              onChange={(e) => setAuthLogin(e.target.value)}
              className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter username"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Password</label>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          {authError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {authError}
            </p>
          )}
          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
};
