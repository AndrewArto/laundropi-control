import express = require('express');
import * as crypto from 'crypto';
import type { UserRole } from '../../../types';

export interface SessionPayload {
  sub: string;
  role: UserRole;
  exp: number;
}

// These will be passed from the main server setup
let SESSION_SECRET: Buffer;
let REQUIRE_UI_AUTH: boolean;

export const initAuthMiddleware = (secret: string, requireAuth: boolean) => {
  SESSION_SECRET = Buffer.from(secret, 'utf8');
  REQUIRE_UI_AUTH = requireAuth;
};

const signSession = (payload: SessionPayload): string => {
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${Buffer.from(data, 'utf8').toString('base64url')}.${sig}`;
};

const verifySession = (token: string): SessionPayload | null => {
  const [dataB64, sigB64] = token.split('.');
  if (!dataB64 || !sigB64) return null;
  const data = Buffer.from(dataB64, 'base64url').toString('utf8');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sigB64 !== expected) return null;
  try {
    const payload = JSON.parse(data) as SessionPayload;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getSession = (req: express.Request): SessionPayload | null => {
  const token = req.cookies?.session;
  if (!token) {
    // When auth is disabled, allow anonymous access for read operations only
    // Write operations should still check for valid session
    if (!REQUIRE_UI_AUTH) return { sub: 'anonymous', role: 'admin', exp: Date.now() + 86400000 };
    return null;
  }
  return verifySession(token);
};

export const setSessionCookie = (res: express.Response, token: string, ttlMs: number) => {
  res.cookie('session', token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: ttlMs,
    path: '/',
  });
};

export const clearSessionCookie = (res: express.Response) => {
  res.clearCookie('session', { path: '/' });
};

export const requireUiAuth: express.RequestHandler = (req, res, next) => {
  if (!REQUIRE_UI_AUTH) return next();
  if (req.method === 'OPTIONS') return next();
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  res.locals.user = session;
  return next();
};

export const requireAdmin: express.RequestHandler = (_req, res, next) => {
  if (!REQUIRE_UI_AUTH) return next();
  const session = res.locals.user as SessionPayload | undefined;
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
};

// Blocks viewers from write operations (allows admin and user)
export const requireAdminOrUser: express.RequestHandler = (_req, res, next) => {
  if (!REQUIRE_UI_AUTH) return next();
  const session = res.locals.user as SessionPayload | undefined;
  if (!session || session.role === 'viewer') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
};

// Allows GET requests for all authenticated users, but blocks non-GET for non-admins
export const requireAdminForWrites: express.RequestHandler = (req, res, next) => {
  if (!REQUIRE_UI_AUTH) return next();
  // GET requests allowed for all authenticated users (including viewers)
  if (req.method === 'GET') return next();
  // Non-GET requests require admin
  const session = res.locals.user as SessionPayload | undefined;
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
};

export { signSession, verifySession };
