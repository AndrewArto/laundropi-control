import express = require('express');
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';
import {
  createInviteToken,
  getInviteToken,
  listPendingInvites,
  markInviteTokenUsed,
  deleteInviteToken,
  createUiUser,
  getUiUser,
  InviteTokenRow,
  UserRole,
} from '../db';
import { getSession } from '../middleware/auth';
import { sendInviteEmail } from '../services/email';

const router = express.Router();

// Default viewer expiry in days (30 days)
const VIEWER_DEFAULT_EXPIRY_DAYS = Number(process.env.VIEWER_DEFAULT_EXPIRY_DAYS || 30);

// Password hashing using scrypt (same as main auth)
const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

/**
 * POST /api/invites
 * Create invite and send email (admin only)
 */
router.post('/', async (req, res) => {
  const session = getSession(req);
  if (!session?.sub || session.role !== 'admin') {
    return res.status(403).json({ error: 'admin_required' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const expiryDays = Number(req.body?.expiryDays || VIEWER_DEFAULT_EXPIRY_DAYS);
  const role: UserRole = 'viewer'; // Only viewers can be invited for now

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'valid_email_required' });
  }

  // Check if user already exists with this email as username
  if (getUiUser(email)) {
    return res.status(409).json({ error: 'user_already_exists' });
  }

  // Generate secure token
  const token = uuid();
  const now = Date.now();
  const tokenExpiresAt = now + (7 * 24 * 60 * 60 * 1000); // Token valid for 7 days
  const accountExpiresAt = now + (expiryDays * 24 * 60 * 60 * 1000);

  const invite: InviteTokenRow = {
    token,
    email,
    role,
    expiresAt: tokenExpiresAt,
    createdBy: session.sub,
    createdAt: now,
    usedAt: null,
  };

  if (!createInviteToken(invite)) {
    return res.status(500).json({ error: 'failed_to_create_invite' });
  }

  // Send email (or log in mock mode)
  try {
    const emailResult = await sendInviteEmail(email, token, accountExpiresAt);
    res.json({
      ok: true,
      invite: { email, expiryDays },
      mockUrl: emailResult.mockUrl, // Only present in mock mode
    });
  } catch (err) {
    // Clean up the invite token if email fails
    deleteInviteToken(token);
    console.error('[invites] Failed to send email:', err);
    return res.status(500).json({ error: 'failed_to_send_email' });
  }
});

/**
 * GET /api/invites
 * List pending invites (admin only)
 */
router.get('/', (req, res) => {
  const session = getSession(req);
  if (!session?.sub || session.role !== 'admin') {
    return res.status(403).json({ error: 'admin_required' });
  }

  const invites = listPendingInvites();
  res.json(invites.map(inv => ({
    token: inv.token.slice(0, 8) + '...', // Don't expose full token
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt,
    createdBy: inv.createdBy,
    createdAt: inv.createdAt,
  })));
});

/**
 * DELETE /api/invites/:token
 * Cancel invite (admin only)
 * Note: We only need first 8 chars of token to match
 */
router.delete('/:tokenPrefix', (req, res) => {
  const session = getSession(req);
  if (!session?.sub || session.role !== 'admin') {
    return res.status(403).json({ error: 'admin_required' });
  }

  const tokenPrefix = req.params.tokenPrefix;
  const invites = listPendingInvites();
  const invite = invites.find(i => i.token.startsWith(tokenPrefix));

  if (!invite) {
    return res.status(404).json({ error: 'invite_not_found' });
  }

  deleteInviteToken(invite.token);
  res.json({ ok: true });
});

/**
 * GET /api/invites/validate/:token
 * Validate token (public - for setup page)
 */
router.get('/validate/:token', (req, res) => {
  const token = req.params.token;
  const invite = getInviteToken(token);

  if (!invite) {
    return res.status(404).json({ error: 'invalid_token' });
  }

  if (invite.usedAt) {
    return res.status(410).json({ error: 'token_already_used' });
  }

  if (Date.now() > invite.expiresAt) {
    return res.status(410).json({ error: 'token_expired' });
  }

  res.json({
    valid: true,
    email: invite.email,
    role: invite.role,
  });
});

/**
 * POST /api/invites/complete/:token
 * Set password and create account (public - for setup page)
 */
router.post('/complete/:token', (req, res) => {
  const token = req.params.token;
  const password = String(req.body?.password || '');

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'password_min_8_chars' });
  }

  const invite = getInviteToken(token);

  if (!invite) {
    return res.status(404).json({ error: 'invalid_token' });
  }

  if (invite.usedAt) {
    return res.status(410).json({ error: 'token_already_used' });
  }

  if (Date.now() > invite.expiresAt) {
    return res.status(410).json({ error: 'token_expired' });
  }

  // Calculate account expiry based on the configured expiry days
  const accountExpiresAt = Date.now() + (VIEWER_DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const now = Date.now();

  // Create user account with email as username
  const passwordHash = hashPassword(password);
  const success = createUiUser({
    username: invite.email,
    role: invite.role,
    passwordHash,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    expiresAt: accountExpiresAt,
    invitedBy: invite.createdBy,
  });

  if (!success) {
    return res.status(500).json({ error: 'failed_to_create_account' });
  }

  // Mark invite as used
  markInviteTokenUsed(token);

  res.json({
    ok: true,
    username: invite.email,
  });
});

export default router;
