import express = require('express');
import { getUiUser, updateUiUserLastLogin } from '../db';
import { getSession, signSession, setSessionCookie, clearSessionCookie, SessionPayload } from '../middleware/auth';

const router = express.Router();

// Password verification - needs to be imported from main or passed
let verifyPasswordFn: (password: string, stored: string) => boolean;
let normalizeRoleFn: (role: string) => 'admin' | 'user';
let SESSION_TTL_MS: number;

export const initAuthRoutes = (
  verifyPassword: (password: string, stored: string) => boolean,
  normalizeRole: (role: string) => 'admin' | 'user',
  sessionTtlMs: number
) => {
  verifyPasswordFn = verifyPassword;
  normalizeRoleFn = normalizeRole;
  SESSION_TTL_MS = sessionTtlMs;
};

/**
 * GET /auth/session
 * Check current session status
 */
router.get('/session', (req, res) => {
  const session = getSession(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    user: session ? { username: session.sub, role: session.role } : null,
  });
});

/**
 * POST /auth/login
 * Authenticate user and create session
 */
router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const user = getUiUser(username);
  if (!user || !verifyPasswordFn(password, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const role = normalizeRoleFn(user.role);
  updateUiUserLastLogin(user.username, Date.now());

  const payload: SessionPayload = {
    sub: user.username,
    role,
    exp: Date.now() + SESSION_TTL_MS,
  };

  const token = signSession(payload);
  setSessionCookie(res, token, SESSION_TTL_MS);

  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, user: { username: user.username, role } });
});

/**
 * POST /auth/logout
 * Clear session cookie
 */
router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

export default router;
