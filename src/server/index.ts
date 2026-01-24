import * as http from 'http';
import * as path from 'path';
import express = require('express');
import cors = require('cors');
import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { listAgents, updateHeartbeat, saveMeta, getAgent, updateRelayMeta, listSchedules, upsertSchedule, deleteSchedule, listGroups, listGroupsForMembership, upsertGroup, deleteGroup, GroupRow, deleteAgent, upsertAgent, upsertCommand, listPendingCommands, deleteCommand, updateCommandsForRelay, expireOldCommands, insertLead, getLastLeadTimestampForIp, listLeads, getRevenueEntry, listRevenueEntriesBetween, listRevenueEntries, listRevenueEntryDatesBetween, listRevenueEntryDatesWithInfo, upsertRevenueEntry, insertRevenueAudit, listRevenueAudit, RevenueEntryRow, listUiUsers, getUiUser, createUiUser, updateUiUserRole, updateUiUserPassword, updateUiUserLastLogin, countUiUsers, listCameras, getCamera, upsertCamera, deleteCamera, upsertIntegrationSecret, getIntegrationSecret, deleteIntegrationSecret, CameraRow, listInventory, getInventory, updateInventory, getInventoryAudit, getLastInventoryChange, DetergentType } from './db';
import expenditureRoutes from './routes/expenditure';


const asBool = (val: string | undefined, fallback = false) => {
  if (val === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(val.toLowerCase());
};

const parseCsv = (val?: string) => (val || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const parseDurationMs = (val: string | undefined, fallback: number) => {
  const trimmed = val?.trim();
  if (!trimmed) return fallback;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const parseAgentSecrets = (val?: string) => {
  const map = new Map<string, string>();
  parseCsv(val).forEach((pair) => {
    const [agentId, secret] = pair.split(':').map((part) => part.trim());
    if (agentId && secret) {
      map.set(agentId, secret);
    }
  });
  return map;
};

const safeEqual = (a: Buffer, b: Buffer) => {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const verifyPassword = (password: string, stored: string) => {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (!salt.length || !expected.length) return false;
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  return safeEqual(actual, expected);
};

const hashPassword = (password: string) => {
  const N = 16384;
  const r = 8;
  const p = 1;
  const keylen = 64;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
};

const INTEGRATION_SECRETS_KEY = (process.env.INTEGRATION_SECRETS_KEY || process.env.CAMERA_SECRETS_KEY || '').trim();

const getIntegrationKey = () => {
  if (!INTEGRATION_SECRETS_KEY) return null;
  return crypto.createHash('sha256').update(INTEGRATION_SECRETS_KEY).digest();
};

const encryptSecret = (value: string) => {
  const key = getIntegrationKey();
  if (!key) throw new Error('INTEGRATION_SECRETS_KEY is required to store secrets');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSecret = (ciphertext: string) => {
  const key = getIntegrationKey();
  if (!key) throw new Error('INTEGRATION_SECRETS_KEY is required to read secrets');
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid secret payload');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};

// Escape XML/SVG special characters to prevent XSS
const escapeXml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const parseCookies = (header?: string) => {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key) return;
    out[key] = decodeURIComponent(value || '');
  });
  return out;
};

const normalizeSameSite = (val?: string) => {
  const value = (val || 'lax').toLowerCase();
  if (value === 'none' || value === 'strict' || value === 'lax') return value;
  return 'lax';
};

type UserRole = 'admin' | 'user';

const normalizeRole = (val?: string): UserRole => (val === 'admin' ? 'admin' : 'user');

const isValidUsername = (val: string) => {
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 64) return false;
  return !/\s/.test(trimmed);
};

const ALLOW_INSECURE = asBool(process.env.ALLOW_INSECURE, false);
const REQUIRE_UI_AUTH = asBool(process.env.REQUIRE_UI_AUTH, true) && !ALLOW_INSECURE;
const CAMERA_ALLOW_NON_RTSP = asBool(process.env.CAMERA_ALLOW_NON_RTSP, false);
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'laundropi_session';
const SESSION_COOKIE_SAMESITE = normalizeSameSite(process.env.SESSION_COOKIE_SAMESITE);
const SESSION_COOKIE_SECURE = asBool(process.env.SESSION_COOKIE_SECURE, !ALLOW_INSECURE);
const REQUIRE_CORS_ORIGINS = asBool(process.env.REQUIRE_CORS_ORIGINS, true) && !ALLOW_INSECURE;
const CORS_ORIGINS = parseCsv(process.env.CORS_ORIGINS);
const LEAD_FORM_ENABLED = asBool(process.env.LEAD_FORM_ENABLED, true);
const LEAD_RATE_LIMIT_MS = Number(process.env.LEAD_RATE_LIMIT_MS || 60_000);
const REQUIRE_KNOWN_AGENT = asBool(process.env.REQUIRE_KNOWN_AGENT, true) && !ALLOW_INSECURE;
const ALLOW_DYNAMIC_AGENT_REGISTRATION = asBool(process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION, false);
const ALLOW_LEGACY_AGENT_SECRET = asBool(process.env.ALLOW_LEGACY_AGENT_SECRET, false);
const AGENT_SECRET_MAP = parseAgentSecrets(process.env.AGENT_SECRETS);
const LEGACY_AGENT_SECRET = process.env.CENTRAL_AGENT_SECRET || '';
const KNOWN_LAUNDRY_IDS = (() => {
  const explicit = parseCsv(process.env.LAUNDRY_IDS);
  if (explicit.length) return explicit;
  if (AGENT_SECRET_MAP.size) return Array.from(AGENT_SECRET_MAP.keys());
  return [];
})();
const KNOWN_LAUNDRY_SET = new Set(KNOWN_LAUNDRY_IDS);
const PRIMARY_LAUNDRY_ID = (process.env.PRIMARY_LAUNDRY_ID || KNOWN_LAUNDRY_IDS[0] || '').trim();
const PRIMARY_CAMERAS_DEFAULT_ENABLED = asBool(process.env.PRIMARY_CAMERAS_DEFAULT_ENABLED, false);
const PRIMARY_CAMERA_FRONT_RTSP_URL = (process.env.PRIMARY_CAMERA_FRONT_RTSP_URL || '').trim();
const PRIMARY_CAMERA_BACK_RTSP_URL = (process.env.PRIMARY_CAMERA_BACK_RTSP_URL || '').trim();

const isKnownLaundry = (agentId: string) => KNOWN_LAUNDRY_SET.size === 0 || KNOWN_LAUNDRY_SET.has(agentId) || agentId === 'FixCost' || agentId === GENERAL_AGENT_ID;
const isPrimaryLaundry = (agentId: string) => Boolean(PRIMARY_LAUNDRY_ID) && agentId === PRIMARY_LAUNDRY_ID;

if (REQUIRE_UI_AUTH && !SESSION_SECRET) {
  console.error('[central] SESSION_SECRET is required when REQUIRE_UI_AUTH is enabled.');
  process.exit(1);
}

if (REQUIRE_CORS_ORIGINS && CORS_ORIGINS.length === 0) {
  console.error('[central] CORS_ORIGINS must be set when REQUIRE_CORS_ORIGINS is enabled.');
  process.exit(1);
}

if (!ALLOW_INSECURE && AGENT_SECRET_MAP.size === 0) {
  console.warn('[central] AGENT_SECRETS is empty; only agents already stored in the DB can connect.');
}

const DEFAULT_ADMIN_USERNAME = 'admin';

// Generate a secure random password for the default admin
const generateSecurePassword = (): string => {
  // Generate a 16-character alphanumeric password
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(16);
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
};

const ensureDefaultAdmin = () => {
  if (countUiUsers() > 0) return;
  const now = Date.now();

  // Use environment variable for initial password, or generate a secure random one
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim() || generateSecurePassword();
  const passwordWasGenerated = !process.env.INITIAL_ADMIN_PASSWORD;

  const created = createUiUser({
    username: DEFAULT_ADMIN_USERNAME,
    role: 'admin',
    passwordHash: hashPassword(initialPassword),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  if (created) {
    if (passwordWasGenerated) {
      console.warn('━'.repeat(80));
      console.warn('[central] ⚠️  DEFAULT ADMIN CREDENTIALS CREATED');
      console.warn('[central]');
      console.warn(`[central] Username: ${DEFAULT_ADMIN_USERNAME}`);
      console.warn(`[central] Password: ${initialPassword}`);
      console.warn('[central]');
      console.warn('[central] ⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN');
      console.warn('[central] Change the password immediately in Settings > User Management');
      console.warn('━'.repeat(80));
    } else {
      console.warn('[central] Default admin user created with password from INITIAL_ADMIN_PASSWORD env var.');
      console.warn('[central] Change the password in Settings > User Management for security.');
    }
  }
};

const ensureKnownAgents = () => {
  if (!KNOWN_LAUNDRY_SET.size) return;
  KNOWN_LAUNDRY_IDS.forEach(agentId => {
    const existing = getAgent(agentId);
    const secret = AGENT_SECRET_MAP.get(agentId) || existing?.secret || '';
    if (existing) {
      if (secret && secret !== existing.secret) {
        upsertAgent({ ...existing, secret });
      }
      return;
    }
    upsertAgent({
      agentId,
      secret,
      lastHeartbeat: null,
      lastStatus: null,
      lastMeta: null,
      desiredState: null,
      reportedState: null,
      scheduleVersion: null,
    });
  });
};

const PORT = Number(process.env.CENTRAL_PORT || 4000);
const HEARTBEAT_STALE_MS = 30_000;
const CAMERA_FRAME_TIMEOUT_MS = parseDurationMs(process.env.CAMERA_FRAME_TIMEOUT_MS, 4000);
const CAMERA_FRAME_CACHE_MS = parseDurationMs(process.env.CAMERA_FRAME_CACHE_MS, 5000);
const CAMERA_FRAME_MIN_INTERVAL_MS = parseDurationMs(process.env.CAMERA_FRAME_MIN_INTERVAL_MS, CAMERA_FRAME_CACHE_MS);
const PRIMARY_CAMERA_FRAME_CACHE_MS = parseDurationMs(process.env.PRIMARY_CAMERA_FRAME_CACHE_MS, CAMERA_FRAME_CACHE_MS);
const PRIMARY_CAMERA_FRAME_MIN_INTERVAL_MS = parseDurationMs(
  process.env.PRIMARY_CAMERA_FRAME_MIN_INTERVAL_MS,
  PRIMARY_CAMERA_FRAME_CACHE_MS
);

console.log('[central] Camera cache settings:', {
  CAMERA_FRAME_CACHE_MS,
  CAMERA_FRAME_MIN_INTERVAL_MS,
  PRIMARY_CAMERA_FRAME_CACHE_MS,
  PRIMARY_CAMERA_FRAME_MIN_INTERVAL_MS
});

const getCameraFrameCacheMs = (agentId: string) => (
  isPrimaryLaundry(agentId) ? PRIMARY_CAMERA_FRAME_CACHE_MS : CAMERA_FRAME_CACHE_MS
);

const getCameraFrameMinIntervalMs = (agentId: string) => (
  isPrimaryLaundry(agentId) ? PRIMARY_CAMERA_FRAME_MIN_INTERVAL_MS : CAMERA_FRAME_MIN_INTERVAL_MS
);

type AgentSocketRecord = { socket: WebSocket; lastHeartbeat: number };
const agents: Map<string, AgentSocketRecord> = new Map();
const relayStateCache: Map<string, Map<number, string>> = new Map();

type CameraFrameResult = { contentType: string; data: Buffer };
type CameraFrameCacheEntry = { contentType: string; data: Buffer; ts: number };
type PendingCameraFrame = {
  resolve: (result: CameraFrameResult) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  cacheKey: string;
};

const pendingCameraFrames: Map<string, PendingCameraFrame> = new Map();
const cameraFrameCache: Map<string, CameraFrameCacheEntry> = new Map();
const cameraFrameInFlight: Map<string, Promise<CameraFrameResult>> = new Map();
const cameraFrameLastFetch: Map<string, number> = new Map();

const normalizeTime = (val?: string | null): string | null => {
  if (!val) return null;
  const raw = val.trim();
  // Handle AM/PM formats like "5:30 PM" (optionally with seconds)
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let hh = parseInt(ampm[1], 10);
    const mm = ampm[2];
    const suffix = ampm[3].toUpperCase();
    if (suffix === 'PM' && hh !== 12) hh += 12;
    if (suffix === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    const hh = Math.min(Math.max(parseInt(hhmm[1], 10), 0), 23);
    const mm = Math.min(Math.max(parseInt(hhmm[2], 10), 0), 59);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return null;
};

const normalizeGroupTimes = (group: GroupRow): GroupRow => {
  const onTime = normalizeTime(group.onTime);
  const offTime = normalizeTime(group.offTime);
  const entries = Array.isArray(group.entries)
    ? group.entries.map(e => ({
        agentId: e.agentId,
        relayIds: Array.isArray(e.relayIds) ? e.relayIds.map((rid: any) => Number(rid)) : [],
      })).filter(e => e.agentId && e.relayIds.length)
    : (Array.isArray(group.relayIds) && group.relayIds.length
      ? [{ agentId: group.agentId, relayIds: group.relayIds }]
      : []);
  const normalized: GroupRow = {
    ...group,
    agentId: group.agentId || entries[0]?.agentId || '',
    entries,
    relayIds: Array.isArray(group.relayIds) ? group.relayIds : [],
    days: Array.isArray(group.days) ? group.days : [],
    onTime,
    offTime,
    active: Boolean(group.active),
  };

  // Persist cleanup so future reads return valid HH:mm strings
  const entriesChanged = JSON.stringify(entries) !== JSON.stringify(group.entries || []);
  if (onTime !== group.onTime || offTime !== group.offTime || entriesChanged) {
    upsertGroup(normalized);
  }

  return normalized;
};

const getNormalizedGroups = (ownerId?: string): GroupRow[] => {
  return listGroups(ownerId).map(normalizeGroupTimes);
};

const CAMERA_POSITIONS = ['front', 'back'] as const;
const DEFAULT_CAMERA_NAMES: Record<string, string> = {
  front: 'Front',
  back: 'Back',
};

const normalizeCameraPosition = (value?: string | null) => {
  const raw = (value || '').trim().toLowerCase();
  if (raw === 'front' || raw === 'back') return raw;
  return 'front';
};

const normalizeCameraName = (value: string | undefined, position: string) => {
  const trimmed = (value || '').trim();
  if (trimmed) return trimmed.slice(0, 64);
  return DEFAULT_CAMERA_NAMES[position] || 'Camera';
};

const normalizeRtspUrl = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'rtsp:') {
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    }
    if (CAMERA_ALLOW_NON_RTSP) {
      return trimmed;
    }
    return null;
  } catch {
    return CAMERA_ALLOW_NON_RTSP ? trimmed : null;
  }
};

type PrimaryCameraDefaults = {
  enabled?: boolean;
  sourceType?: 'rtsp';
  rtspUrl?: string;
};

const parseFfmpegDevice = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'ffmpeg:' || parsed.pathname !== 'device') return null;
    const video = parsed.searchParams.get('video');
    if (!video) return null;
    return { video };
  } catch {
    return null;
  }
};

const isSameFfmpegDevice = (a: string | null, b: string | null) => {
  const left = parseFfmpegDevice(a);
  const right = parseFfmpegDevice(b);
  if (!left || !right) return false;
  return left.video === right.video;
};

const getPrimaryCameraDefaults = (agentId: string, position: string): PrimaryCameraDefaults | null => {
  if (!isPrimaryLaundry(agentId)) return null;
  const raw = position === 'front'
    ? PRIMARY_CAMERA_FRONT_RTSP_URL
    : position === 'back'
      ? PRIMARY_CAMERA_BACK_RTSP_URL
      : '';
  const rtspUrl = raw ? normalizeRtspUrl(raw) : null;
  if (rtspUrl) {
    return { sourceType: 'rtsp', rtspUrl, enabled: true };
  }
  if (PRIMARY_CAMERAS_DEFAULT_ENABLED) {
    return { enabled: true };
  }
  return null;
};

const buildCameraId = (agentId: string, position: string) => `${agentId}:${position}`;

const buildStreamKey = (camera: CameraRow) => {
  const raw = `cam_${camera.agentId}_${camera.position}`.toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || `cam_${camera.id.replace(/[^a-z0-9]+/gi, '_')}`;
};

const attachRtspCredentials = (rtspUrl: string, username?: string | null, password?: string | null) => {
  try {
    const parsed = new URL(rtspUrl);

    // Only attach credentials to RTSP URLs, pass through other protocols (ffmpeg:, etc.)
    if (parsed.protocol !== 'rtsp:') {
      return rtspUrl;
    }

    // URL constructor automatically encodes credentials to prevent injection
    if (username) parsed.username = encodeURIComponent(username);
    if (password) parsed.password = encodeURIComponent(password);
    return parsed.toString();
  } catch (err) {
    console.error('[central] Failed to parse RTSP URL:', err instanceof Error ? err.message : err);
    return rtspUrl;
  }
};

const readSecretValue = (secretId: string | null) => {
  if (!secretId) return null;
  const row = getIntegrationSecret(secretId);
  if (!row) return null;
  try {
    return decryptSecret(row.cipher);
  } catch (err) {
    console.warn('[central] failed to decrypt secret', secretId, err);
    return null;
  }
};

const saveSecretValue = (secretId: string, kind: string, value: string) => {
  const now = Date.now();
  const existing = getIntegrationSecret(secretId);
  const cipher = encryptSecret(value);
  upsertIntegrationSecret({
    id: secretId,
    kind,
    cipher,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
};

function ensureDefaultCameras(agentId: string) {
  const existing = listCameras(agentId);
  const existingByPosition = new Map(existing.map(camera => [camera.position, camera]));
  const now = Date.now();
  CAMERA_POSITIONS.forEach(position => {
    const current = existingByPosition.get(position);
    const defaults = getPrimaryCameraDefaults(agentId, position);
    const isUntouched = current ? current.createdAt === current.updatedAt : false;
    const isUnconfigured = current ? current.sourceType === 'pattern' && !current.rtspUrl : false;
    if (current) {
      if (defaults) {
        let next = current;
        let changed = false;
        const shouldUpdateRtsp = Boolean(
          defaults.sourceType === 'rtsp'
            && defaults.rtspUrl
            && (
              (current.sourceType === 'pattern' && !current.rtspUrl)
              || (current.sourceType === 'rtsp'
                && current.rtspUrl
                && isSameFfmpegDevice(current.rtspUrl, defaults.rtspUrl)
                && current.rtspUrl !== defaults.rtspUrl)
            )
        );
        if (shouldUpdateRtsp) {
          next = { ...next, sourceType: 'rtsp', rtspUrl: defaults.rtspUrl };
          if (defaults.enabled && isUntouched) {
            next = { ...next, enabled: true };
          }
          changed = true;
        } else if (defaults.enabled && isUntouched && isUnconfigured && !current.enabled) {
          next = { ...next, enabled: true };
          changed = true;
        }
        if (changed) {
          upsertCamera({ ...next, updatedAt: now });
        }
        return;
      }
      if (isUntouched && isUnconfigured && current.enabled) {
        upsertCamera({ ...current, enabled: false, updatedAt: now });
      }
      return;
    }
    const id = buildCameraId(agentId, position);
    upsertCamera({
      id,
      agentId,
      name: DEFAULT_CAMERA_NAMES[position],
      position,
      sourceType: defaults?.sourceType ?? 'pattern',
      rtspUrl: defaults?.rtspUrl ?? null,
      usernameSecretId: null,
      passwordSecretId: null,
      enabled: defaults?.enabled ?? false,
      createdAt: now,
      updatedAt: now,
    });
  });
}

ensureDefaultAdmin();
ensureKnownAgents();
if (KNOWN_LAUNDRY_SET.size) {
  KNOWN_LAUNDRY_IDS.forEach(ensureDefaultCameras);
}

const buildCameraAgentPayload = (camera: CameraRow) => {
  const streamKey = buildStreamKey(camera);
  const username = readSecretValue(camera.usernameSecretId);
  const password = readSecretValue(camera.passwordSecretId);
  const rtspUrl = camera.sourceType === 'rtsp' && camera.rtspUrl
    ? attachRtspCredentials(camera.rtspUrl, username, password)
    : null;
  return {
    id: camera.id,
    agentId: camera.agentId,
    name: camera.name,
    position: camera.position,
    sourceType: camera.sourceType,
    enabled: camera.enabled,
    streamKey,
    rtspUrl,
  };
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseEntryDate = (value?: string | null) => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date);
};

const resolveEntryDate = (value?: string | null) => parseEntryDate(value) || formatDate(new Date());

const roundMoney = (val: number) => Math.round(val * 100) / 100;

const parseMoney = (value: any) => {
  if (value === '' || value === null || value === undefined) return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return roundMoney(num);
};

const parseCount = (value: any) => {
  if (value === '' || value === null || value === undefined) return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
  return num;
};

const normalizeDeductions = (input: any) => {
  const list = Array.isArray(input) ? input : [];
  const normalized: { amount: number; comment: string }[] = [];
  for (const item of list) {
    const rawAmount = item?.amount;
    const rawComment = typeof item?.comment === 'string' ? item.comment : String(item?.comment || '');
    const comment = rawComment.trim();
    const hasAmount = rawAmount !== '' && rawAmount !== null && rawAmount !== undefined;
    const hasComment = comment.length > 0;
    if (!hasAmount && !hasComment) continue;
    const amount = parseMoney(rawAmount);
    if (!hasComment) {
      return { error: 'deduction comment required', list: [] };
    }
    if (amount === null) {
      return { error: 'invalid deduction amount', list: [] };
    }
    normalized.push({ amount, comment });
  }
  return { error: null, list: normalized };
};

const buildRevenueSummary = (entries: RevenueEntryRow[]) => {
  const totalsByAgent: Record<string, number> = {};
  const profitLossByAgent: Record<string, number> = {};
  entries.forEach(entry => {
    // coinsTotal is the main revenue field (includes cash + Stripe)
    const revenue = entry.coinsTotal > 0 ? roundMoney(entry.coinsTotal) : 0;
    const deductionsTotal = roundMoney(entry.deductionsTotal || 0);
    totalsByAgent[entry.agentId] = roundMoney((totalsByAgent[entry.agentId] || 0) + revenue);
    profitLossByAgent[entry.agentId] = roundMoney((profitLossByAgent[entry.agentId] || 0) + roundMoney(revenue - deductionsTotal));
  });
  const overall = roundMoney(Object.values(totalsByAgent).reduce((sum, val) => sum + val, 0));
  const profitLossOverall = roundMoney(Object.values(profitLossByAgent).reduce((sum, val) => sum + val, 0));
  return { totalsByAgent, overall, profitLossByAgent, profitLossOverall };
};

// Fix cost agent ID for business-wide costs (not tied to specific laundromat)
const GENERAL_AGENT_ID = 'General';

const filterEntriesByKnownAgents = (entries: RevenueEntryRow[]) => {
  if (!KNOWN_LAUNDRY_SET.size) return entries;
  // Always include FixCost agent for business-wide costs
  return entries.filter(entry => KNOWN_LAUNDRY_SET.has(entry.agentId) || entry.agentId === GENERAL_AGENT_ID);
};

const desiredStateKey = (agentId: string, relayId: number) => `${agentId}::${relayId}`;

const updateDesiredState = (agentId: string, relayId: number, desired: 'on' | 'off') => {
  const agent = getAgent(agentId);
  const desiredMap = new Map<string, 'on' | 'off'>();
  if (agent?.desiredState) {
    Object.entries(agent.desiredState).forEach(([k, v]) => {
      if (v === 'on' || v === 'off') desiredMap.set(k, v);
    });
  }
  desiredMap.set(desiredStateKey(agentId, relayId), desired);
  upsertAgent({
    agentId,
    secret: agent?.secret || '',
    lastHeartbeat: agent?.lastHeartbeat || null,
    lastStatus: agent?.lastStatus || null,
    lastMeta: agent?.lastMeta || null,
    desiredState: Object.fromEntries(desiredMap),
    reportedState: agent?.reportedState || null,
  });
};

const reconcileOnConnect = (agentId: string) => {
  const agent = getAgent(agentId);
  if (!agent?.desiredState || !agents.has(agentId)) return;
  const target = agents.get(agentId);
  if (!target || target.socket.readyState !== WebSocket.OPEN) return;
  const desiredEntries = Object.entries(agent.desiredState) as [string, any][];
  desiredEntries.forEach(([key, val]) => {
    const [aId, ridStr] = key.split('::');
    if (aId !== agentId) return;
    const rid = Number(ridStr);
    if (!Number.isFinite(rid)) return;
    if (val === 'on' || val === 'off') {
      target.socket.send(JSON.stringify({ type: 'set_relay', relayId: rid, state: val }));
    }
  });
};

const reconcileOnHeartbeat = (agentId: string, reportedRelays: any[]) => {
  const agent = getAgent(agentId);
  if (!agent) return;
  const desiredMap = new Map<string, 'on' | 'off'>();
  if (agent.desiredState) {
    Object.entries(agent.desiredState).forEach(([k, v]) => {
      if (v === 'on' || v === 'off') desiredMap.set(k, v);
    });
  }
  const reportedMap = new Map<number, string>();
  reportedRelays.forEach((r: any) => {
    if (r && typeof r.id === 'number' && (r.state === 'on' || r.state === 'off')) {
      reportedMap.set(r.id, r.state);
    }
  });

  const target = agents.get(agentId);
  const socketReady = target?.socket.readyState === WebSocket.OPEN;

  desiredMap.forEach((desired, key) => {
    const [aId, ridStr] = key.split('::');
    if (aId !== agentId) return;
    const rid = Number(ridStr);
    if (!Number.isFinite(rid)) return;
    const reported = reportedMap.get(rid);
    if (reported === desired) {
      // ack and clear
      updateCommandsForRelay(agentId, rid, 'acked');
      desiredMap.delete(key);
    } else if (socketReady) {
      // resend
      target!.socket.send(JSON.stringify({ type: 'set_relay', relayId: rid, state: desired }));
      const cmdId = uuidv4(); // Use UUID to prevent collision
      upsertCommand({ id: cmdId, agentId, relayId: rid, desiredState: desired, status: 'sent', createdAt: Date.now(), expiresAt: Date.now() + 30_000 });
    }
  });

  expireOldCommands();

  upsertAgent({
    ...agent,
    desiredState: Object.fromEntries(desiredMap),
    reportedState: { relays: reportedRelays },
  });
};

const buildSchedulePayload = (agentId: string) => {
  // Merge explicit schedules + derived from groups with on/off time
  const explicit = listSchedules(agentId).map(s => ({
    relayId: s.relayId,
    entries: [{ days: s.days, from: s.from, to: s.to }]
  }));
  const groupBased = listGroupsForMembership(agentId)
    .map(normalizeGroupTimes)
    .filter(g => g.active && g.onTime && g.offTime)
    .flatMap(g => {
      const entry = (g.entries || []).find(e => e.agentId === agentId);
      const relays = entry?.relayIds || [];
      const days = g.days && g.days.length ? g.days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      return relays.map(rid => ({
        relayId: rid,
        entries: [{ days, from: g.onTime!, to: g.offTime! }]
      }));
  });
  return [...explicit, ...groupBased];
};

const pushSchedulesToAgent = (agentId: string) => {
  const target = agents.get(agentId);
  if (target?.socket.readyState === WebSocket.OPEN) {
    const scheds = buildSchedulePayload(agentId);
    const version = crypto.createHash('md5').update(JSON.stringify(scheds)).digest('hex');
    const agent = getAgent(agentId);
    upsertAgent({
      agentId,
      secret: agent?.secret || '',
      lastHeartbeat: agent?.lastHeartbeat || null,
      lastStatus: agent?.lastStatus || null,
      lastMeta: agent?.lastMeta || null,
      desiredState: agent?.desiredState || null,
      reportedState: agent?.reportedState || null,
      scheduleVersion: version,
    });
    if (process.env.SCHEDULE_DEBUG === '1' || process.env.SCHEDULE_DEBUG === 'true') {
      console.log('[central] pushSchedulesToAgent', agentId, version, JSON.stringify(scheds, null, 2));
    }
    target.socket.send(JSON.stringify({ type: 'update_schedule', schedules: scheds, version }));
  }
};

const pushCameraConfigToAgent = (agentId: string) => {
  const target = agents.get(agentId);
  if (!target || target.socket.readyState !== WebSocket.OPEN) return;
  ensureDefaultCameras(agentId);
  const cameras = listCameras(agentId).map(buildCameraAgentPayload);
  console.log('[central] pushCameraConfigToAgent', agentId, JSON.stringify(cameras, null, 2));
  target.socket.send(JSON.stringify({ type: 'update_cameras', cameras }));
};

const requestCameraFrame = (agentId: string, cameraId: string): Promise<CameraFrameResult> => {
  const cacheKey = `${agentId}::${cameraId}`;
  const now = Date.now();
  const cached = cameraFrameCache.get(cacheKey);
  const cacheMs = getCameraFrameCacheMs(agentId);

  // Check cache freshness
  if (cacheMs > 0 && cached && now - cached.ts <= cacheMs) {
    return Promise.resolve({ contentType: cached.contentType, data: cached.data });
  }

  // Check in-flight request
  const inflight = cameraFrameInFlight.get(cacheKey);
  if (inflight) return inflight;

  // Check minimum interval
  const minIntervalMs = getCameraFrameMinIntervalMs(agentId);
  const lastFetch = cameraFrameLastFetch.get(cacheKey);
  if (minIntervalMs > 0 && cached && lastFetch && (now - lastFetch) < minIntervalMs) {
    return Promise.resolve({ contentType: cached.contentType, data: cached.data });
  }

  cameraFrameLastFetch.set(cacheKey, now);

  const target = agents.get(agentId);
  if (!target || target.socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('agent not connected'));
  }
  const requestId = crypto.randomUUID();
  const promise = new Promise<CameraFrameResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCameraFrames.delete(requestId);
      cameraFrameInFlight.delete(cacheKey);
      reject(new Error('camera frame timeout'));
    }, CAMERA_FRAME_TIMEOUT_MS);
    pendingCameraFrames.set(requestId, { resolve, reject, timer, cacheKey });
    target.socket.send(JSON.stringify({ type: 'camera_frame_request', cameraId, requestId }));
  });
  cameraFrameInFlight.set(cacheKey, promise);
  return promise;
};

const buildCameraPatternSvg = (camera: CameraRow) => {
  const width = 640;
  const height = 360;
  // Escape user-controlled values to prevent XSS
  const title = escapeXml(`${camera.agentId} · ${camera.name}`);
  const subtitle = escapeXml(camera.position.toUpperCase());
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="1" opacity="0.65"/>
    </pattern>
    <pattern id="diag" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M -20 20 L 20 -20 M 0 40 L 40 0 M 20 60 L 60 20 M 40 80 L 80 40" fill="none" stroke="#475569" stroke-width="2" opacity="0.4"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <rect width="100%" height="100%" fill="url(#diag)"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="18" fill="none" stroke="#475569" stroke-width="2"/>
  <circle cx="${width - 58}" cy="50" r="8" fill="#22c55e"/>
  <text x="48" y="78" fill="#e2e8f0" font-size="22" font-family="Arial, sans-serif">${title}</text>
  <text x="48" y="110" fill="#94a3b8" font-size="14" font-family="Arial, sans-serif">Mock camera · ${subtitle}</text>
  <text x="50%" y="55%" fill="#38bdf8" fill-opacity="0.18" font-size="96" font-weight="700" text-anchor="middle" font-family="Arial, sans-serif">MOCK</text>
  <text x="48" y="${height - 40}" fill="#64748b" font-size="12" font-family="Arial, sans-serif">Pattern feed (no camera configured)</text>
</svg>`.trim();
};

const isOriginAllowed = (origin?: string | null) => {
  if (!origin) return true;
  if (!REQUIRE_CORS_ORIGINS) return true;
  return CORS_ORIGINS.includes(origin);
};

const getClientIp = (req: express.Request): string | null => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress || null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 204,
}));
app.use(express.json());

type SessionPayload = { sub: string; role: UserRole; exp: number };

const sessionTtlHours = Number.isFinite(SESSION_TTL_HOURS) ? SESSION_TTL_HOURS : 12;
const SESSION_TTL_MS = Math.max(1, sessionTtlHours) * 60 * 60 * 1000;

const signSession = (payload: SessionPayload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};

const verifySession = (token: string | undefined): SessionPayload | null => {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!safeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

const getSession = (req: express.Request) => {
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies[SESSION_COOKIE_NAME]);
};

const setSessionCookie = (res: express.Response, token: string, maxAge: number) => {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: SESSION_COOKIE_SAMESITE as 'lax' | 'strict' | 'none',
    path: '/',
    maxAge,
  });
};

const clearSessionCookie = (res: express.Response) => {
  res.cookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: SESSION_COOKIE_SAMESITE as 'lax' | 'strict' | 'none',
    path: '/',
    maxAge: 0,
  });
};

const requireUiAuth: express.RequestHandler = (req, res, next) => {
  if (!REQUIRE_UI_AUTH) return next();
  if (req.method === 'OPTIONS') return next();
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  res.locals.user = session;
  return next();
};

const requireAdmin: express.RequestHandler = (_req, res, next) => {
  if (!REQUIRE_UI_AUTH) return next();
  const session = res.locals.user as SessionPayload | undefined;
  if (!session || session.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  return next();
};

app.get('/auth/session', (req, res) => {
  const session = getSession(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    user: session ? { username: session.sub, role: session.role } : null,
  });
});

app.post('/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = getUiUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const role = normalizeRole(user.role);
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

app.post('/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

app.get('/api/users', requireUiAuth, requireAdmin, (_req, res) => {
  const users = listUiUsers().map(u => ({
    username: u.username,
    role: u.role,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json(users);
});

app.post('/api/users', requireUiAuth, requireAdmin, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const role = normalizeRole(req.body?.role);
  if (!isValidUsername(username) || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (getUiUser(username)) {
    return res.status(409).json({ error: 'user exists' });
  }
  const now = Date.now();
  const created = createUiUser({
    username,
    role,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });
  if (!created) {
    return res.status(500).json({ error: 'create failed' });
  }
  res.json({ ok: true });
});

app.put('/api/users/:username/role', requireUiAuth, requireAdmin, (req, res) => {
  const username = String(req.params.username || '').trim();
  const role = normalizeRole(req.body?.role);
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'invalid username' });
  }
  const users = listUiUsers();
  const target = users.find(u => u.username === username);
  if (!target) {
    return res.status(404).json({ error: 'user not found' });
  }
  if (role !== 'admin') {
    const adminCount = users.filter(u => u.role === 'admin').length;
    if (target.role === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'at least one admin required' });
    }
  }
  const updated = updateUiUserRole(username, role);
  if (!updated) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json({ ok: true });
});

app.put('/api/users/:username/password', requireUiAuth, requireAdmin, (req, res) => {
  const username = String(req.params.username || '').trim();
  const password = String(req.body?.password || '');
  if (!isValidUsername(username) || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const updated = updateUiUserPassword(username, hashPassword(password));
  if (!updated) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json({ ok: true });
});

app.post('/lead', (req, res) => {
  if (!LEAD_FORM_ENABLED) return res.status(404).json({ error: 'not_found' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const trap = String(req.body?.company || '').trim();
  if (trap) return res.json({ ok: true });
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const ip = getClientIp(req);
  const now = Date.now();
  // Enforce strict rate limiting - if IP cannot be determined, reject the request
  if (!ip) {
    console.warn('[central] Lead form submission blocked: Unable to determine client IP');
    return res.status(429).json({ error: 'rate_limited' });
  }
  const last = getLastLeadTimestampForIp(ip);
  if (last && now - last < LEAD_RATE_LIMIT_MS) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  insertLead({
    email: email.slice(0, 320),
    createdAt: now,
    source: String(req.body?.source || 'washcontrol.io').slice(0, 64),
    ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null,
    referrer: String(req.headers.referer || req.headers.referrer || '').slice(0, 512) || null,
  });
  return res.json({ ok: true });
});

app.get('/api/leads', (_req, res) => {
  try {
    const leads = listLeads();
    res.json(leads);
  } catch (err) {
    console.error('[central] Failed to list leads:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Serve leads viewer HTML page
app.get('/leads', (_req, res) => {
  const filePath = path.join(__dirname, '../../public/leads.html');
  res.sendFile(filePath);
});

// Serve static assets from public directory (logo, etc.)
app.use(express.static(path.join(__dirname, '../../public')));

app.use('/api', requireUiAuth);
app.use('/api/revenue', requireAdmin);
app.use('/api/expenditure', requireAdmin, expenditureRoutes);

app.get('/api/revenue/summary', (req, res) => {
  const dateStr = resolveEntryDate(req.query?.date as string | undefined);
  const anchor = new Date(`${dateStr}T00:00:00`);
  const day = anchor.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() + diff);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weekStartDate = formatDate(weekStart);
  const weekEndDate = formatDate(weekEnd);
  const monthStartDate = formatDate(monthStart);
  const monthEndDate = formatDate(monthEnd);
  const weekEntries = filterEntriesByKnownAgents(listRevenueEntriesBetween(weekStartDate, weekEndDate));
  const monthEntries = filterEntriesByKnownAgents(listRevenueEntriesBetween(monthStartDate, monthEndDate));
  res.json({
    date: dateStr,
    week: { startDate: weekStartDate, endDate: weekEndDate, ...buildRevenueSummary(weekEntries) },
    month: { startDate: monthStartDate, endDate: monthEndDate, ...buildRevenueSummary(monthEntries) },
  });
});

app.get('/api/revenue/entries', (req, res) => {
  const startRaw = req.query?.startDate as string | undefined;
  const endRaw = req.query?.endDate as string | undefined;
  const agentId = req.query?.agentId as string | undefined;
  if (agentId && !isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  const startDate = startRaw ? parseEntryDate(startRaw) : null;
  const endDate = endRaw ? parseEntryDate(endRaw) : null;
  if ((startRaw || endRaw) && (!startDate || !endDate)) {
    return res.status(400).json({ error: 'startDate and endDate required' });
  }
  const entries = listRevenueEntries({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    agentId,
  });
  const filtered = filterEntriesByKnownAgents(entries);
  res.json({ entries: filtered });
});

app.get('/api/revenue/dates', (req, res) => {
  const startRaw = req.query?.startDate as string | undefined;
  const endRaw = req.query?.endDate as string | undefined;
  const agentId = req.query?.agentId as string | undefined;
  const startDate = startRaw ? parseEntryDate(startRaw) : null;
  const endDate = endRaw ? parseEntryDate(endRaw) : null;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate required' });
  }
  if (agentId && !isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }

  // Collect date info across all relevant agents
  const dateInfoMap = new Map<string, { hasRevenue: boolean; hasExpenses: boolean }>();

  const mergeInfo = (info: { date: string; hasRevenue: boolean; hasExpenses: boolean }) => {
    const existing = dateInfoMap.get(info.date);
    if (existing) {
      existing.hasRevenue = existing.hasRevenue || info.hasRevenue;
      existing.hasExpenses = existing.hasExpenses || info.hasExpenses;
    } else {
      dateInfoMap.set(info.date, { hasRevenue: info.hasRevenue, hasExpenses: info.hasExpenses });
    }
  };

  if (agentId) {
    listRevenueEntryDatesWithInfo(startDate, endDate, agentId).forEach(mergeInfo);
  } else if (KNOWN_LAUNDRY_SET.size) {
    // Include all known laundries plus FixCost for expenses
    KNOWN_LAUNDRY_IDS.forEach(id => {
      listRevenueEntryDatesWithInfo(startDate, endDate, id).forEach(mergeInfo);
    });
    // Also include FixCost entries (fixed costs / expenses only)
    listRevenueEntryDatesWithInfo(startDate, endDate, GENERAL_AGENT_ID).forEach(mergeInfo);
  } else {
    listRevenueEntryDatesWithInfo(startDate, endDate).forEach(mergeInfo);
  }

  // Return both the simple dates array (for backwards compatibility) and detailed info
  const sortedDates = Array.from(dateInfoMap.keys()).sort();
  const dateInfo = sortedDates.map(date => ({
    date,
    ...dateInfoMap.get(date)!,
  }));

  res.json({ dates: sortedDates, dateInfo });
});

app.get('/api/revenue/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  if (!isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  const entryDate = resolveEntryDate(req.query?.date as string | undefined);
  const entry = getRevenueEntry(agentId, entryDate);
  const audit = entry ? listRevenueAudit(agentId, entryDate) : [];
  res.json({ entry, audit });
});

app.put('/api/revenue/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  if (!isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  // Require valid session with username for revenue modifications
  const session = res.locals.user as SessionPayload | undefined;
  if (!session?.sub || session.sub === 'unknown') {
    return res.status(401).json({ error: 'authentication required to modify revenue' });
  }
  const username = session.sub;
  const entryDate = resolveEntryDate(req.body?.entryDate || (req.query?.date as string | undefined));
  const coinsTotal = parseMoney(req.body?.coinsTotal);
  const euroCoinsCount = parseCount(req.body?.euroCoinsCount);
  const billsTotal = parseMoney(req.body?.billsTotal);
  if (coinsTotal === null) return res.status(400).json({ error: 'invalid coinsTotal' });
  if (euroCoinsCount === null) return res.status(400).json({ error: 'invalid euroCoinsCount' });
  if (billsTotal === null) return res.status(400).json({ error: 'invalid billsTotal' });
  const { list: deductions, error: deductionsError } = normalizeDeductions(req.body?.deductions);
  if (deductionsError) return res.status(400).json({ error: deductionsError });
  const deductionsTotal = roundMoney(deductions.reduce((sum, item) => sum + item.amount, 0));
  const now = Date.now();
  const existing = getRevenueEntry(agentId, entryDate);

  if (!existing) {
    const entry: RevenueEntryRow = {
      agentId,
      entryDate,
      createdAt: now,
      updatedAt: now,
      coinsTotal,
      euroCoinsCount,
      billsTotal,
      deductions,
      deductionsTotal,
      createdBy: username,
      updatedBy: username,
      hasEdits: false,
    };
    upsertRevenueEntry(entry);
    insertRevenueAudit([
      { agentId, entryDate, field: 'coinsTotal', oldValue: null, newValue: String(coinsTotal), user: username, createdAt: now },
      { agentId, entryDate, field: 'euroCoinsCount', oldValue: null, newValue: String(euroCoinsCount), user: username, createdAt: now },
      { agentId, entryDate, field: 'billsTotal', oldValue: null, newValue: String(billsTotal), user: username, createdAt: now },
      { agentId, entryDate, field: 'deductions', oldValue: null, newValue: JSON.stringify(deductions), user: username, createdAt: now },
    ]);
    return res.json({ entry, audit: listRevenueAudit(agentId, entryDate) });
  }

  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const prevCoins = roundMoney(existing.coinsTotal);
  const prevEuroCoins = existing.euroCoinsCount;
  const prevBills = roundMoney(existing.billsTotal);
  const prevDeductionsPayload = JSON.stringify(existing.deductions || []);
  const nextDeductionsPayload = JSON.stringify(deductions);

  if (prevCoins !== coinsTotal) changes.push({ field: 'coinsTotal', oldValue: String(prevCoins), newValue: String(coinsTotal) });
  if (prevEuroCoins !== euroCoinsCount) changes.push({ field: 'euroCoinsCount', oldValue: String(prevEuroCoins), newValue: String(euroCoinsCount) });
  if (prevBills !== billsTotal) changes.push({ field: 'billsTotal', oldValue: String(prevBills), newValue: String(billsTotal) });
  if (prevDeductionsPayload !== nextDeductionsPayload) changes.push({ field: 'deductions', oldValue: prevDeductionsPayload, newValue: nextDeductionsPayload });

  if (changes.length === 0) {
    return res.json({ entry: existing, audit: listRevenueAudit(agentId, entryDate), unchanged: true });
  }

  const updated: RevenueEntryRow = {
    ...existing,
    coinsTotal,
    euroCoinsCount,
    billsTotal,
    deductions,
    deductionsTotal,
    updatedAt: now,
    updatedBy: username,
    hasEdits: true,
  };
  upsertRevenueEntry(updated);
  insertRevenueAudit(changes.map(change => ({
    agentId,
    entryDate,
    field: change.field,
    oldValue: change.oldValue,
    newValue: change.newValue,
    user: username,
    createdAt: now,
  })));
  return res.json({ entry: updated, audit: listRevenueAudit(agentId, entryDate) });
});

// ========== Inventory endpoints ==========

app.get('/api/inventory', (req, res) => {
  const allAgents = listAgents();
  const selectedAgents = KNOWN_LAUNDRY_SET.size
    ? KNOWN_LAUNDRY_IDS
        .map(id => allAgents.find(a => a.agentId === id))
        .filter((item): item is (typeof allAgents)[number] => Boolean(item))
    : allAgents;

  const inventory = selectedAgents.map(agent => {
    const items = listInventory(agent.agentId);
    const detergentTypes: DetergentType[] = ['blue', 'green', 'brown'];

    // Ensure all three detergent types exist
    const completeInventory = detergentTypes.map(type => {
      const existing = items.find(item => item.detergentType === type);
      return existing || {
        agentId: agent.agentId,
        detergentType: type,
        quantity: 0,
        updatedAt: Date.now(),
        updatedBy: 'system',
      };
    });

    return {
      agentId: agent.agentId,
      items: completeInventory,
    };
  });

  res.json({ inventory });
});

app.post('/api/inventory/:agentId/:detergentType', (req, res) => {
  const session = getSession(req);
  if (REQUIRE_UI_AUTH && !session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const username = session?.username || 'admin';

  const { agentId, detergentType } = req.params;
  const { quantity } = req.body;

  if (!['blue', 'green', 'brown'].includes(detergentType)) {
    return res.status(400).json({ error: 'Invalid detergent type' });
  }

  if (typeof quantity !== 'number' || quantity < 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }

  updateInventory(agentId, detergentType as DetergentType, quantity, username);
  const updated = getInventory(agentId, detergentType as DetergentType);
  const lastChange = getLastInventoryChange(agentId, detergentType as DetergentType);

  res.json({ inventory: updated, lastChange });
});

app.get('/api/inventory/:agentId/:detergentType/audit', (req, res) => {
  const { agentId, detergentType } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

  if (!['blue', 'green', 'brown'].includes(detergentType)) {
    return res.status(400).json({ error: 'Invalid detergent type' });
  }

  const audit = getInventoryAudit(agentId, detergentType as DetergentType, limit);
  res.json({ audit });
});

app.get('/api/agents', (_req, res) => {
  const allAgents = listAgents();
  const selectedAgents = KNOWN_LAUNDRY_SET.size
    ? KNOWN_LAUNDRY_IDS
        .map(id => allAgents.find(a => a.agentId === id))
        .filter((item): item is (typeof allAgents)[number] => Boolean(item))
    : allAgents;
  const list = selectedAgents.map(a => {
    const socketRec = agents.get(a.agentId);
    const online = socketRec?.socket.readyState === WebSocket.OPEN;
    return {
      agentId: a.agentId,
      lastHeartbeat: socketRec?.lastHeartbeat || a.lastHeartbeat,
      online: Boolean(online),
    };
  });
  res.json(list);
});

app.get('/api/agents/:id/status', (req, res) => {
  if (!isKnownLaundry(req.params.id)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  const rec = getAgent(req.params.id);
  if (!rec) return res.status(404).json({ error: 'agent not found' });
  res.json({
    agentId: rec.agentId,
    lastHeartbeat: rec.lastHeartbeat,
    status: rec.lastStatus,
    meta: rec.lastMeta,
  });
});

app.get('/api/agents/:id/cameras', (req, res) => {
  const agentId = req.params.id;
  if (!isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  ensureDefaultCameras(agentId);
  const cameras = listCameras(agentId)
    .sort((a, b) => {
      const order = (pos: string) => (pos === 'front' ? 0 : pos === 'back' ? 1 : 9);
      const diff = order(a.position) - order(b.position);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    })
    .map(camera => ({
      id: camera.id,
      agentId: camera.agentId,
      name: camera.name,
      position: camera.position,
      sourceType: camera.sourceType,
      rtspUrl: camera.rtspUrl,
      enabled: camera.enabled,
      hasCredentials: Boolean(camera.usernameSecretId || camera.passwordSecretId),
      previewUrl: `/api/agents/${encodeURIComponent(agentId)}/cameras/${encodeURIComponent(camera.id)}/frame`,
    }));
  res.json({ cameras });
});

app.put('/api/agents/:id/cameras/:cameraId', (req, res) => {
  const agentId = req.params.id;
  const cameraId = req.params.cameraId;
  if (!isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  ensureDefaultCameras(agentId);
  const existing = getCamera(cameraId);
  if (!existing || existing.agentId !== agentId) {
    return res.status(404).json({ error: 'camera not found' });
  }

  const name = typeof req.body?.name === 'string'
    ? normalizeCameraName(req.body.name, existing.position)
    : existing.name;
  const requestedSource = typeof req.body?.sourceType === 'string' ? req.body.sourceType : null;
  const sourceType = (requestedSource === 'rtsp' || requestedSource === 'pattern')
    ? requestedSource
    : existing.sourceType;
  const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : existing.enabled;

  let rtspUrl = existing.rtspUrl;
  if (req.body?.rtspUrl === null) {
    rtspUrl = null;
  } else if (typeof req.body?.rtspUrl === 'string') {
    const normalized = normalizeRtspUrl(req.body.rtspUrl);
    if (!normalized && req.body.rtspUrl.trim()) {
      return res.status(400).json({ error: 'invalid rtspUrl' });
    }
    rtspUrl = normalized;
  }

  let usernameSecretId = existing.usernameSecretId;
  let passwordSecretId = existing.passwordSecretId;

  try {
    if (req.body?.username !== undefined) {
      const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      if (!username) {
        if (usernameSecretId) deleteIntegrationSecret(usernameSecretId);
        usernameSecretId = null;
      } else {
        const id = usernameSecretId || `${cameraId}:username`;
        saveSecretValue(id, 'camera_username', username);
        usernameSecretId = id;
      }
    }

    if (req.body?.password !== undefined) {
      const password = typeof req.body.password === 'string' ? req.body.password.trim() : '';
      if (!password) {
        if (passwordSecretId) deleteIntegrationSecret(passwordSecretId);
        passwordSecretId = null;
      } else {
        const id = passwordSecretId || `${cameraId}:password`;
        saveSecretValue(id, 'camera_password', password);
        passwordSecretId = id;
      }
    }
  } catch (err) {
    console.error('[central] failed to store camera secret', err);
    return res.status(500).json({ error: 'camera secret storage failed' });
  }

  if (sourceType === 'pattern') {
    rtspUrl = null;
    if (usernameSecretId) deleteIntegrationSecret(usernameSecretId);
    if (passwordSecretId) deleteIntegrationSecret(passwordSecretId);
    usernameSecretId = null;
    passwordSecretId = null;
  }

  const updated: CameraRow = {
    ...existing,
    name,
    sourceType,
    rtspUrl,
    usernameSecretId,
    passwordSecretId,
    enabled,
    updatedAt: Date.now(),
  };
  upsertCamera(updated);
  pushCameraConfigToAgent(agentId);
  res.json({
    camera: {
      id: updated.id,
      agentId: updated.agentId,
      name: updated.name,
      position: updated.position,
      sourceType: updated.sourceType,
      rtspUrl: updated.rtspUrl,
      enabled: updated.enabled,
      hasCredentials: Boolean(updated.usernameSecretId || updated.passwordSecretId),
      previewUrl: `/api/agents/${encodeURIComponent(agentId)}/cameras/${encodeURIComponent(updated.id)}/frame`,
    }
  });
});

app.get('/api/agents/:id/cameras/:cameraId/frame', async (req, res) => {
  const agentId = req.params.id;
  const cameraId = req.params.cameraId;
  if (!isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  ensureDefaultCameras(agentId);
  const camera = getCamera(cameraId);
  if (!camera || camera.agentId !== agentId) {
    return res.status(404).json({ error: 'camera not found' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (camera.sourceType === 'pattern' || !camera.enabled) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.status(200).send(buildCameraPatternSvg(camera));
    return;
  }

  try {
    const frame = await requestCameraFrame(agentId, cameraId);
    res.setHeader('Content-Type', frame.contentType || 'image/jpeg');
    res.status(200).end(frame.data);
  } catch (err: any) {
    console.warn('[central] camera frame failed', err?.message || err);
    res.status(504).json({ error: 'camera frame unavailable' });
  }
});

app.post('/api/agents', (req, res) => {
  const { agentId, secret } = req.body || {};
  if (!agentId || !secret) return res.status(400).json({ error: 'agentId and secret required' });
  if (!isKnownLaundry(agentId)) {
    return res.status(403).json({ error: 'agent not allowed' });
  }
  const expectedSecret = AGENT_SECRET_MAP.get(agentId);
  if (expectedSecret && secret !== expectedSecret) {
    return res.status(403).json({ error: 'agent secret mismatch' });
  }
  if (!expectedSecret && !ALLOW_DYNAMIC_AGENT_REGISTRATION) {
    return res.status(403).json({ error: 'agent not pre-registered' });
  }
  saveMeta(agentId, expectedSecret || secret, null);
  res.json({ ok: true });
});

app.delete('/api/agents/:id', (req, res) => {
  const agentId = req.params.id;
  if (!isKnownLaundry(agentId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  if (KNOWN_LAUNDRY_SET.size && KNOWN_LAUNDRY_SET.has(agentId)) {
    return res.status(403).json({ error: 'laundry is fixed' });
  }
  deleteAgent(agentId);
  agents.delete(agentId);
  relayStateCache.delete(agentId);
  res.json({ ok: true });
});

app.post('/api/agents/:id/relays/:relayId/toggle', (req, res) => {
  const { id, relayId } = req.params;
  const target = agents.get(id);
  if (!target || target.socket.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: 'agent not connected' });
  }
  const state = req.body?.state === 'on' ? 'on' : 'off';
  target.socket.send(JSON.stringify({ type: 'set_relay', relayId: Number(relayId), state }));
  res.json({ ok: true, sent: { relayId: Number(relayId), state } });
});

app.post('/api/agents/:id/relays/:relayId/state', (req, res) => {
  const { id, relayId } = req.params;
  const target = agents.get(id);
  if (!target || target.socket.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: 'agent not connected' });
  }
  const state = req.body?.state === 'on' ? 'on' : 'off';
  target.socket.send(JSON.stringify({ type: 'set_relay', relayId: Number(relayId), state }));
  updateDesiredState(id, Number(relayId), state);
  const cmdId = uuidv4(); // Use UUID to prevent collision
  upsertCommand({ id: cmdId, agentId: id, relayId: Number(relayId), desiredState: state, status: 'sent', createdAt: Date.now(), expiresAt: Date.now() + 30_000 });
  res.json({ ok: true, sent: { relayId: Number(relayId), state } });
});

app.get('/api/dashboard', (req, res) => {
  const requestedId = req.query.agentId as string | undefined;
  if (requestedId && !isKnownLaundry(requestedId)) {
    return res.status(404).json({ error: 'agent not found' });
  }
  const fallbackId = KNOWN_LAUNDRY_SET.size ? KNOWN_LAUNDRY_IDS[0] : listAgents()[0]?.agentId;
  const agentId = requestedId || fallbackId;
  if (!agentId) return res.json({ relays: [], schedules: [], groups: [], isMock: true });
  const rec = getAgent(agentId);
  const schedules = listSchedules(agentId).map(s => ({
    id: s.id,
    relayIds: [s.relayId],
    days: s.days,
    time: `${s.from}-${s.to}`,
    action: 'ON',
    active: s.active,
  }));
  const groups = getNormalizedGroups().map(g => ({
    id: g.id,
    name: g.name,
    entries: g.entries || [{ agentId: g.agentId, relayIds: g.relayIds || [] }],
    relayIds: g.relayIds,
    onTime: g.onTime,
    offTime: g.offTime,
    days: g.days,
    active: g.active
  }));
  const relays = (rec?.lastMeta || []).map((meta: any) => {
    const status = (rec?.lastStatus?.relays || []).find((r: any) => r.id === meta.id);
    return {
      id: meta.id,
      name: meta.name,
      gpioPin: meta.gpioPin,
      type: meta.type,
      iconType: meta.iconType || meta.type,
      isOn: status?.state === 'on',
      isHidden: meta.isHidden || false,
      channelNumber: meta.channelNumber,
      colorGroup: meta.colorGroup || null,
    };
  });
  const statusMock = rec?.lastStatus?.isMock;
  const isMock = typeof statusMock === 'boolean' ? statusMock : true;
  res.json({
    relays,
    schedules,
    groups,
    isMock,
    agentId,
    lastHeartbeat: rec?.lastHeartbeat || null,
  });
});

app.put('/api/agents/:id/relays/:relayId/meta', (req, res) => {
  const { id, relayId } = req.params;
  const ok = updateRelayMeta(id, Number(relayId), req.body || {});
  if (!ok) return res.status(404).json({ error: 'agent or relay not found' });
  res.json({ ok: true });
});

// --- MACHINE STATUS API ---
// In-memory cache for machine status (will be populated by agent heartbeats)
type MachineStatus = 'idle' | 'running' | 'unknown';
type MachineType = 'washer' | 'dryer';
interface LaundryMachine {
  id: string;
  label: string;
  type: MachineType;
  status: MachineStatus;
  lastUpdated: number;
}
const machineStatusCache = new Map<string, { machines: LaundryMachine[]; lastAnalyzed: number }>();

// Default machine configurations per laundry (can be configured via DB later)
const DEFAULT_MACHINE_CONFIGS: Record<string, Array<{ id: string; label: string; type: MachineType }>> = {
  Brandoa1: [
    { id: 'w1', label: 'Washer 1', type: 'washer' },
    { id: 'w2', label: 'Washer 2', type: 'washer' },
    { id: 'w3', label: 'Washer 3', type: 'washer' },
    { id: 'w4', label: 'Washer 4', type: 'washer' },
    { id: 'd5', label: 'Dryer 5', type: 'dryer' },
    { id: 'd6', label: 'Dryer 6', type: 'dryer' },
    { id: 'd7', label: 'Dryer 7', type: 'dryer' },
    { id: 'd8', label: 'Dryer 8', type: 'dryer' },
  ],
  Brandoa2: [
    { id: 'w1', label: 'Washer 1', type: 'washer' },
    { id: 'w2', label: 'Washer 2', type: 'washer' },
    { id: 'w3', label: 'Washer 3', type: 'washer' },
    { id: 'w4', label: 'Washer 4', type: 'washer' },
    { id: 'd1', label: 'Dryer 1', type: 'dryer' },
    { id: 'd2', label: 'Dryer 2', type: 'dryer' },
    { id: 'd3', label: 'Dryer 3', type: 'dryer' },
    { id: 'd4', label: 'Dryer 4', type: 'dryer' },
    { id: 'd5', label: 'Dryer 5', type: 'dryer' },
    { id: 'd6', label: 'Dryer 6', type: 'dryer' },
  ],
};

app.get('/api/agents/:id/machines', (req, res) => {
  const { id } = req.params;
  if (!isKnownLaundry(id)) {
    return res.status(404).json({ error: 'agent not found' });
  }

  const cached = machineStatusCache.get(id);
  if (cached) {
    return res.json({
      agentId: id,
      machines: cached.machines,
      lastAnalyzed: cached.lastAnalyzed,
    });
  }

  // Return default config with unknown status if no data yet
  const defaultConfig = DEFAULT_MACHINE_CONFIGS[id] || [];
  const now = Date.now();
  const machines: LaundryMachine[] = defaultConfig.map(m => ({
    ...m,
    status: 'unknown' as MachineStatus,
    lastUpdated: now,
  }));

  res.json({
    agentId: id,
    machines,
    lastAnalyzed: 0,
  });
});

// Endpoint to update machine status (called by agent after frame analysis)
app.post('/api/agents/:id/machines', (req, res) => {
  const { id } = req.params;
  if (!isKnownLaundry(id)) {
    return res.status(404).json({ error: 'agent not found' });
  }

  const { machines } = req.body || {};
  if (!Array.isArray(machines)) {
    return res.status(400).json({ error: 'machines array required' });
  }

  machineStatusCache.set(id, {
    machines: machines.map((m: any) => ({
      id: m.id || '',
      label: m.label || m.id || '',
      type: m.type || 'washer',
      status: m.status || 'unknown',
      lastUpdated: m.lastUpdated || Date.now(),
    })),
    lastAnalyzed: Date.now(),
  });

  res.json({ ok: true });
});

// --- SCHEDULES API ---
app.get('/api/agents/:id/schedules', (req, res) => {
  const list = listSchedules(req.params.id);
  res.json(list);
});

app.post('/api/agents/:id/schedules', (req, res) => {
  const agentId = req.params.id;
  const { relayId, days, from, to, active } = req.body || {};
  const id = req.body?.id || `${Date.now()}`;
  if (!relayId || !Array.isArray(days) || !from || !to) return res.status(400).json({ error: 'relayId, days, from, to required' });
  const payload = { id, agentId, relayId: Number(relayId), days, from: normalizeTime(from), to: normalizeTime(to), active: Boolean(active) };
  upsertSchedule(payload);
  console.log(`[central] schedule created agent=${agentId} id=${id} relay=${payload.relayId}`);
  pushSchedulesToAgent(agentId);
  res.json(payload);
});

app.put('/api/agents/:id/schedules/:sid', (req, res) => {
  const agentId = req.params.id;
  const sid = req.params.sid;
  const existing = listSchedules(agentId).find(s => s.id === sid);
  if (!existing) return res.status(404).json({ error: 'schedule not found' });
  const payload = {
    ...existing,
    relayId: req.body?.relayId ? Number(req.body.relayId) : existing.relayId,
    days: Array.isArray(req.body?.days) ? req.body.days : existing.days,
    from: normalizeTime(req.body?.from) || existing.from,
    to: normalizeTime(req.body?.to) || existing.to,
    active: typeof req.body?.active === 'boolean' ? req.body.active : existing.active,
  };
  upsertSchedule(payload);
  console.log(`[central] schedule updated agent=${agentId} id=${sid}`);
  pushSchedulesToAgent(agentId);
  res.json(payload);
});

app.delete('/api/agents/:id/schedules/:sid', (req, res) => {
  deleteSchedule(req.params.id, req.params.sid);
  console.log(`[central] schedule deleted agent=${req.params.id} id=${req.params.sid}`);
  pushSchedulesToAgent(req.params.id);
  res.json({ ok: true });
});

// --- GROUPS API ---
app.get('/api/agents/:id/groups', (req, res) => {
  const list = getNormalizedGroups();
  res.json(list);
});

app.post('/api/agents/:id/groups', (req, res) => {
  const agentId = req.params.id;
  const { name, entries, relayIds, onTime, offTime, days, active } = req.body || {};
  const normalizedEntries = Array.isArray(entries) && entries.length
    ? entries.map((e: any) => ({ agentId: e.agentId, relayIds: Array.isArray(e.relayIds) ? e.relayIds.map((rid: any) => Number(rid)) : [] }))
    : [{ agentId, relayIds: Array.isArray(relayIds) ? relayIds.map((rid: any) => Number(rid)) : [] }];
  const filteredEntries = normalizedEntries.filter((e: any) => e.agentId && Array.isArray(e.relayIds) && e.relayIds.length);
  if (!name || filteredEntries.length === 0) return res.status(400).json({ error: 'name and entries required' });
  const id = req.body?.id || `${Date.now()}`;
  const payload: GroupRow = {
    id,
    agentId,
    name,
    relayIds: filteredEntries.flatMap((e: any) => e.relayIds),
    entries: filteredEntries,
    onTime: normalizeTime(onTime),
    offTime: normalizeTime(offTime),
    days: days || [],
    active: Boolean(active)
  };
  upsertGroup(payload);
  console.log(`[central] group created agent=${agentId} id=${id} name=${name}`);
  const targets = Array.from(new Set(filteredEntries.map((e: any) => e.agentId)));
  targets.forEach(pushSchedulesToAgent);
  res.json(payload);
});

app.put('/api/agents/:id/groups/:gid', (req, res) => {
  const agentId = req.params.id;
  const gid = req.params.gid;
  const existing = getNormalizedGroups().find(g => g.id === gid);
  if (!existing) return res.status(404).json({ error: 'group not found' });
  const requestedEntries = Array.isArray(req.body?.entries) ? req.body.entries : existing.entries;
  const normalizedEntries = Array.isArray(requestedEntries)
    ? requestedEntries.map((e: any) => ({
        agentId: e.agentId,
        relayIds: Array.isArray(e.relayIds) ? e.relayIds.map((rid: any) => Number(rid)) : [],
      }))
    : existing.entries;
  const filteredEntries = normalizedEntries.filter(e => e.agentId && e.relayIds.length);
  const payload = {
    ...existing,
    name: req.body?.name || existing.name,
    entries: filteredEntries,
    relayIds: filteredEntries.flatMap(e => e.relayIds),
    onTime: req.body?.onTime !== undefined ? normalizeTime(req.body.onTime) : existing.onTime,
    offTime: req.body?.offTime !== undefined ? normalizeTime(req.body.offTime) : existing.offTime,
    days: Array.isArray(req.body?.days) ? req.body.days : existing.days,
    active: typeof req.body?.active === 'boolean' ? req.body.active : existing.active,
  };
  upsertGroup(payload);
  console.log(`[central] group updated agent=${agentId} id=${gid}`);
  const targets = Array.from(new Set(payload.entries.map(e => e.agentId)));
  targets.forEach(pushSchedulesToAgent);
  res.json(payload);
});

app.delete('/api/agents/:id/groups/:gid', (req, res) => {
  const { id: agentId, gid } = { id: req.params.id, gid: req.params.gid };
  const existing = getNormalizedGroups().find(g => g.id === gid);
  deleteGroup(agentId, gid);
  console.log(`[central] group deleted agent=${agentId} id=${gid}`);
  const targets = existing ? Array.from(new Set(existing.entries.map(e => e.agentId))) : [agentId];
  targets.forEach(pushSchedulesToAgent);
  res.json({ ok: true });
});

app.post('/api/agents/:id/groups/:gid/action', (req, res) => {
  const gid = req.params.gid;
  const action = req.body?.action === 'ON' ? 'on' : 'off';
  const group = getNormalizedGroups().find(g => g.id === gid);
  if (!group) return res.status(404).json({ error: 'group not found' });
  const results: Record<string, string> = {};
  (group.entries || []).forEach(entry => {
    const target = agents.get(entry.agentId);
    entry.relayIds.forEach(rid => {
      if (target && target.socket.readyState === WebSocket.OPEN) {
        target.socket.send(JSON.stringify({ type: 'set_relay', relayId: rid, state: action }));
        results[entry.agentId] = 'ok';
      } else {
        results[entry.agentId] = 'offline';
      }
      updateDesiredState(entry.agentId, rid, action);
      const cmdId = uuidv4(); // Use UUID to prevent collision
      upsertCommand({ id: cmdId, agentId: entry.agentId, relayId: rid, desiredState: action as 'on' | 'off', status: target ? 'sent' : 'pending', createdAt: Date.now(), expiresAt: Date.now() + 30_000 });
    });
  });
  res.json({ ok: true, results });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/agent' });

wss.on('connection', (socket) => {
  let agentId: string | null = null;

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!agentId && msg.type === 'hello') {
        if (!msg.agentId || !msg.secret) {
          console.warn('[central] hello missing agentId/secret');
          socket.close();
          return;
        }
        if (!isKnownLaundry(msg.agentId)) {
          console.warn('[central] agent not in laundry list', msg.agentId);
          socket.close();
          return;
        }
        const existing = getAgent(msg.agentId);
        const expectedSecret = AGENT_SECRET_MAP.get(msg.agentId) || existing?.secret || null;
        const legacyAllowed = Boolean(ALLOW_LEGACY_AGENT_SECRET && LEGACY_AGENT_SECRET && msg.secret === LEGACY_AGENT_SECRET);

        if (!expectedSecret && REQUIRE_KNOWN_AGENT && !legacyAllowed) {
          console.warn('[central] unknown agent rejected', msg.agentId);
          socket.close();
          return;
        }
        if (expectedSecret && msg.secret !== expectedSecret) {
          console.warn('[central] invalid secret from', msg.agentId);
          socket.close();
          return;
        }
        if (legacyAllowed && !expectedSecret) {
          console.warn('[central] legacy secret accepted for', msg.agentId);
        }
        if (!expectedSecret && !ALLOW_DYNAMIC_AGENT_REGISTRATION && !legacyAllowed) {
          console.warn('[central] agent registration disabled for', msg.agentId);
          socket.close();
          return;
        }
        agentId = msg.agentId;
        agents.set(agentId, { socket, lastHeartbeat: Date.now() });
        const secretToPersist = expectedSecret || msg.secret;
        saveMeta(agentId, secretToPersist, msg.relays || null);
        console.log('[central] agent connected', agentId);
        reconcileOnConnect(agentId);
        pushCameraConfigToAgent(agentId);
        return;
      }

      if (!agentId) {
        console.warn('[central] message before hello, dropping');
        return;
      }

      if (msg.type === 'heartbeat') {
        const record = agents.get(agentId);
        if (record) record.lastHeartbeat = Date.now();
        updateHeartbeat(agentId, msg.status);
        const agent = getAgent(agentId);
        if (agent) {
          upsertAgent({
            ...agent,
            reportedState: { relays: msg.status?.relays || [] },
            scheduleVersion: msg.status?.scheduleVersion || agent.scheduleVersion || null,
          });
        }
        const relays = Array.isArray(msg.status?.relays) ? msg.status.relays : [];
        console.log(`[central] heartbeat ${agentId} time=${msg.status?.time}`);

        const prevStates = relayStateCache.get(agentId) || new Map<number, string>();
        const nextStates = new Map<number, string>();
        const isFirst = prevStates.size === 0;
        relays.forEach((r: any) => {
          const prev = prevStates.get(r.id);
          nextStates.set(r.id, r.state);
          if (isFirst || prev !== r.state) {
            console.log(`  relay ${r.id} (${agentId}): ${r.state}`);
          }
        });
        relayStateCache.set(agentId, nextStates);

        reconcileOnHeartbeat(agentId, relays);

        // Schedule version reconciliation
        const currentVersion = crypto.createHash('md5').update(JSON.stringify(buildSchedulePayload(agentId))).digest('hex');
        const reportedVersion = msg.status?.scheduleVersion;
        const knownVersion = agent?.scheduleVersion;
        if ((reportedVersion && currentVersion !== reportedVersion) || (!reportedVersion && knownVersion && knownVersion !== currentVersion)) {
          console.log('[central] schedule version mismatch, repushing', { agentId, currentVersion, reportedVersion: reportedVersion ?? knownVersion ?? 'n/a' });
          pushSchedulesToAgent(agentId);
        }
        return;
      }

      if (msg.type === 'machine_status') {
        const machines = Array.isArray(msg.machines) ? msg.machines : [];
        if (machines.length > 0) {
          machineStatusCache.set(agentId, {
            machines: machines.map((m: any) => ({
              id: m.id || '',
              label: m.label || m.id || '',
              type: m.type || 'washer',
              status: m.status || 'unknown',
              lastUpdated: m.lastUpdated || Date.now(),
            })),
            lastAnalyzed: Date.now(),
          });
          console.log(`[central] machine_status ${agentId}: ${machines.map((m: any) => `${m.id}=${m.status}`).join(', ')}`);
        }
        return;
      }

      if (msg.type === 'camera_frame') {
        const requestId = msg.requestId;
        if (!requestId) return;
        const pending = pendingCameraFrames.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingCameraFrames.delete(requestId);
        if (msg.ok && msg.data) {
          const buffer = Buffer.from(msg.data, 'base64');
          const contentType = typeof msg.contentType === 'string' ? msg.contentType : 'image/jpeg';
          const fetchedAt = Date.now();
          cameraFrameLastFetch.set(pending.cacheKey, fetchedAt);
          if (CAMERA_FRAME_CACHE_MS > 0) {
            cameraFrameCache.set(pending.cacheKey, { contentType, data: buffer, ts: fetchedAt });
          }
          cameraFrameInFlight.delete(pending.cacheKey);
          pending.resolve({ contentType, data: buffer });
        } else {
          cameraFrameInFlight.delete(pending.cacheKey);
          pending.reject(new Error(msg.error || 'camera frame failed'));
        }
        return;
      }

      if (msg.type === 'set_relay') {
        console.log(`[central] set_relay from ${agentId}: relay ${msg.relayId} -> ${msg.state}`);
      } else if (msg.type === 'update_schedule') {
        console.log(`[central] update_schedule from ${agentId}: ${msg.schedules?.length || 0} entries`);
      } else {
        console.log('[central] message from', agentId, msg);
      }
    } catch (err) {
      console.error('[central] failed to parse message', err);
    }
  });

  socket.on('close', () => {
    if (agentId) {
      const current = agents.get(agentId);
      // Only delete if this socket is still the registered one
      // (a newer connection may have already replaced it)
      if (current && current.socket === socket) {
        agents.delete(agentId);
        console.log('[central] agent disconnected', agentId);
      }
    }
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[central] HTTP+WS listening on ${PORT}`);
    console.log(`[central] WS endpoint ws://localhost:${PORT}/agent`);
  });
}

export { app, server };
