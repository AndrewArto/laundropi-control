import './env';
import Database = require('better-sqlite3');

export type AgentRecord = {
  agentId: string;
  secret: string;
  lastHeartbeat: number | null;
  lastStatus: any | null;
  lastMeta: any | null;
  desiredState: any | null;
  reportedState: any | null;
  scheduleVersion: string | null;
};

export type UiUserRecord = {
  username: string;
  role: 'admin' | 'user';
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
};

export type ScheduleRow = {
  id: string;
  agentId: string;
  relayId: number;
  days: string[];
  from: string;
  to: string;
  active: boolean;
};

export type GroupRow = {
  id: string;
  agentId: string;
  name: string;
  relayIds?: number[];
  entries: { agentId: string; relayIds: number[] }[];
  onTime?: string | null;
  offTime?: string | null;
  days: string[];
  active: boolean;
};

export type CommandStatus = 'pending' | 'sent' | 'acked' | 'failed';

export type CommandRow = {
  id: string;
  agentId: string;
  relayId: number;
  desiredState: 'on' | 'off';
  status: CommandStatus;
  createdAt: number;
  expiresAt: number | null;
};

export type LeadRow = {
  email: string;
  createdAt: number;
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
};

export type RevenueDeduction = {
  amount: number;
  comment: string;
};

export type RevenueEntryRow = {
  agentId: string;
  entryDate: string;
  createdAt: number;
  updatedAt: number;
  coinsTotal: number;
  euroCoinsCount: number;
  billsTotal: number;
  deductions: RevenueDeduction[];
  deductionsTotal: number;
  createdBy: string | null;
  updatedBy: string | null;
  hasEdits: boolean;
};

export type RevenueAuditRow = {
  id?: number;
  agentId: string;
  entryDate: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  user: string;
  createdAt: number;
};

export type IntegrationSecretRow = {
  id: string;
  kind: string;
  cipher: string;
  createdAt: number;
  updatedAt: number;
};

export type CameraRow = {
  id: string;
  agentId: string;
  name: string;
  position: string;
  sourceType: string;
  rtspUrl: string | null;
  usernameSecretId: string | null;
  passwordSecretId: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

const dbPath = process.env.CENTRAL_DB_PATH || './central.db';
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  agentId TEXT PRIMARY KEY,
  secret TEXT,
  lastHeartbeat INTEGER,
  lastStatus TEXT,
  lastMeta TEXT,
  desiredState TEXT,
  reportedState TEXT,
  scheduleVersion TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  agentId TEXT,
  relayId INTEGER,
  days TEXT,
  fromTime TEXT,
  toTime TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  agentId TEXT,
  name TEXT,
  relayIds TEXT,
  entries TEXT,
  onTime TEXT,
  offTime TEXT,
  days TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  agentId TEXT,
  relayId INTEGER,
  desiredState TEXT,
  status TEXT,
  createdAt INTEGER,
  expiresAt INTEGER
);

CREATE TABLE IF NOT EXISTS ui_users (
  username TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  lastLoginAt INTEGER
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  source TEXT,
  ip TEXT,
  userAgent TEXT,
  referrer TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique ON leads(email);
CREATE INDEX IF NOT EXISTS leads_ip_created_idx ON leads(ip, createdAt);

CREATE TABLE IF NOT EXISTS revenue_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agentId TEXT NOT NULL,
  entryDate TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  coinsTotal REAL NOT NULL,
  euroCoinsCount INTEGER NOT NULL,
  billsTotal REAL NOT NULL,
  deductions TEXT NOT NULL,
  deductionsTotal REAL NOT NULL,
  createdBy TEXT,
  updatedBy TEXT,
  hasEdits INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS revenue_entries_agent_date_unique ON revenue_entries(agentId, entryDate);
CREATE INDEX IF NOT EXISTS revenue_entries_date_idx ON revenue_entries(entryDate);

CREATE TABLE IF NOT EXISTS revenue_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agentId TEXT NOT NULL,
  entryDate TEXT NOT NULL,
  field TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  user TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS revenue_audit_agent_date_idx ON revenue_audit(agentId, entryDate, createdAt);

CREATE TABLE IF NOT EXISTS integration_secrets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  cipher TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  sourceType TEXT NOT NULL,
  rtspUrl TEXT,
  usernameSecretId TEXT,
  passwordSecretId TEXT,
  enabled INTEGER DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS cameras_agent_idx ON cameras(agentId);
`);

// Best-effort migration: add entries column if missing (ignore errors)
try {
  db.prepare('ALTER TABLE groups ADD COLUMN entries TEXT').run();
} catch (_) {
  // column already exists
}

// Migrate agents table to add desiredState/reportedState/scheduleVersion if missing
const agentColumns = db.prepare(`PRAGMA table_info(agents)`).all() as any[];
const agentColNames = new Set(agentColumns.map(c => c.name));
try {
  if (!agentColNames.has('desiredState')) db.prepare('ALTER TABLE agents ADD COLUMN desiredState TEXT').run();
  if (!agentColNames.has('reportedState')) db.prepare('ALTER TABLE agents ADD COLUMN reportedState TEXT').run();
  if (!agentColNames.has('scheduleVersion')) db.prepare('ALTER TABLE agents ADD COLUMN scheduleVersion TEXT').run();
} catch (_) {
  // ignore migration errors; subsequent reads handle missing columns
}

const upsertStmt = db.prepare(`
INSERT INTO agents(agentId, secret, lastHeartbeat, lastStatus, lastMeta, desiredState, reportedState, scheduleVersion)
VALUES (@agentId, @secret, @lastHeartbeat, @lastStatus, @lastMeta, @desiredState, @reportedState, @scheduleVersion)
ON CONFLICT(agentId) DO UPDATE SET
  secret=excluded.secret,
  lastHeartbeat=excluded.lastHeartbeat,
  lastStatus=excluded.lastStatus,
  lastMeta=excluded.lastMeta,
  desiredState=excluded.desiredState,
  reportedState=excluded.reportedState,
  scheduleVersion=excluded.scheduleVersion;
`);

export function upsertAgent(rec: AgentRecord) {
  upsertStmt.run({
    agentId: rec.agentId,
    secret: rec.secret,
    lastHeartbeat: rec.lastHeartbeat ?? null,
    lastStatus: rec.lastStatus ? JSON.stringify(rec.lastStatus) : null,
    lastMeta: rec.lastMeta ? JSON.stringify(rec.lastMeta) : null,
    desiredState: rec.desiredState ? JSON.stringify(rec.desiredState) : null,
    reportedState: rec.reportedState ? JSON.stringify(rec.reportedState) : null,
    scheduleVersion: rec.scheduleVersion ?? null,
  });
}

export function updateHeartbeat(agentId: string, status: any) {
  const existing = getAgent(agentId);
  upsertAgent({
    agentId,
    secret: existing?.secret || '',
    lastHeartbeat: Date.now(),
    lastStatus: status,
    lastMeta: existing?.lastMeta || null,
    desiredState: existing?.desiredState || null,
    reportedState: status || existing?.reportedState || null,
    scheduleVersion: existing?.scheduleVersion || null,
  });
}

export function saveMeta(agentId: string, secret: string, meta: any, preferIncoming = false) {
  const existing = getAgent(agentId);
  let mergedMeta = meta;
  if (!preferIncoming && Array.isArray(meta) && Array.isArray(existing?.lastMeta)) {
    const prevMap = new Map<number, any>();
    existing!.lastMeta.forEach((m: any) => prevMap.set(m.id, m));
    mergedMeta = meta.map((m: any) => {
      const prev = prevMap.get(m.id);
      if (!prev) return m;
      // Keep persisted fields if agent re-sends defaults
      return { ...m, ...prev };
    });
  }
  upsertAgent({
    agentId,
    secret: secret || existing?.secret || '',
    lastHeartbeat: existing?.lastHeartbeat || null,
    lastStatus: existing?.lastStatus || null,
    lastMeta: mergedMeta,
    desiredState: existing?.desiredState || null,
    reportedState: existing?.reportedState || null,
    scheduleVersion: existing?.scheduleVersion || null,
  });
}

export function getAgent(agentId: string): AgentRecord | null {
  const row = db.prepare('SELECT * FROM agents WHERE agentId = ?').get(agentId) as any;
  if (!row) return null;
  return {
    agentId: row.agentId,
    secret: row.secret,
    lastHeartbeat: row.lastHeartbeat,
    lastStatus: row.lastStatus ? JSON.parse(row.lastStatus) : null,
    lastMeta: row.lastMeta ? JSON.parse(row.lastMeta) : null,
    desiredState: row.desiredState ? JSON.parse(row.desiredState) : null,
    reportedState: row.reportedState ? JSON.parse(row.reportedState) : null,
    scheduleVersion: row.scheduleVersion || null,
  };
}

export function listAgents(): AgentRecord[] {
  const rows = db.prepare('SELECT * FROM agents').all() as any[];
  return rows.map(row => ({
    agentId: row.agentId,
    secret: row.secret,
    lastHeartbeat: row.lastHeartbeat,
    lastStatus: row.lastStatus ? JSON.parse(row.lastStatus) : null,
    lastMeta: row.lastMeta ? JSON.parse(row.lastMeta) : null,
    desiredState: row.desiredState ? JSON.parse(row.desiredState) : null,
    reportedState: row.reportedState ? JSON.parse(row.reportedState) : null,
    scheduleVersion: row.scheduleVersion || null,
  }));
}

export function updateRelayMeta(agentId: string, relayId: number, updates: Record<string, any>) {
  const rec = getAgent(agentId);
  if (!rec?.lastMeta) return false;
  const nextMeta = rec.lastMeta.map((m: any) => (m.id === relayId ? { ...m, ...updates } : m));
  saveMeta(agentId, rec.secret, nextMeta, true);
  console.log(`[db] relay meta updated agent=${agentId} relay=${relayId}`, updates);
  return true;
}

// --- SCHEDULES ---
export function listSchedules(agentId: string): ScheduleRow[] {
  const rows = db.prepare('SELECT * FROM schedules WHERE agentId = ?').all(agentId) as any[];
  return rows.map(r => ({
    id: r.id,
    agentId: r.agentId,
    relayId: r.relayId,
    days: JSON.parse(r.days),
    from: r.fromTime,
    to: r.toTime,
    active: Boolean(r.active),
  }));
}

export function upsertSchedule(row: ScheduleRow) {
  db.prepare(`
    INSERT INTO schedules(id, agentId, relayId, days, fromTime, toTime, active)
    VALUES (@id, @agentId, @relayId, @days, @fromTime, @toTime, @active)
    ON CONFLICT(id) DO UPDATE SET
      agentId=excluded.agentId,
      relayId=excluded.relayId,
      days=excluded.days,
      fromTime=excluded.fromTime,
      toTime=excluded.toTime,
      active=excluded.active;
  `).run({
    ...row,
    days: JSON.stringify(row.days),
    active: row.active ? 1 : 0,
  });
}

export function deleteSchedule(agentId: string, id: string) {
  db.prepare('DELETE FROM schedules WHERE agentId = ? AND id = ?').run(agentId, id);
}

// --- GROUPS ---
export function listGroups(agentId?: string): GroupRow[] {
  const rows = agentId
    ? db.prepare('SELECT * FROM groups WHERE agentId = ?').all(agentId)
    : db.prepare('SELECT * FROM groups').all();
  return rows.map((r: any) => {
    const parsedEntries = r.entries ? JSON.parse(r.entries) : null;
    const entries = Array.isArray(parsedEntries)
      ? parsedEntries.map((e: any) => ({
          agentId: e.agentId,
          relayIds: Array.isArray(e.relayIds) ? e.relayIds : [],
        }))
      : [{
          agentId: r.agentId,
          relayIds: JSON.parse(r.relayIds || '[]'),
        }];
    return {
      id: r.id,
      agentId: r.agentId,
      name: r.name,
      relayIds: JSON.parse(r.relayIds || '[]'),
      entries,
      onTime: r.onTime || null,
      offTime: r.offTime || null,
      days: JSON.parse(r.days || '[]'),
      active: Boolean(r.active),
    } as GroupRow;
  });
}

export function listGroupsForMembership(agentId: string): GroupRow[] {
  return listGroups().map(g => ({
    ...g,
    entries: (g.entries || []).filter(e => e.agentId === agentId),
  })).filter(g => g.entries.some(e => e.relayIds.length));
}

export function upsertGroup(row: GroupRow) {
  const entries = Array.isArray(row.entries) && row.entries.length
    ? row.entries.map(e => ({ agentId: e.agentId, relayIds: e.relayIds || [] }))
    : [{ agentId: row.agentId, relayIds: row.relayIds || [] }];
  const relayIdsCombined = entries.flatMap(e => e.relayIds || []);
  db.prepare(`
    INSERT INTO groups(id, agentId, name, relayIds, entries, onTime, offTime, days, active)
    VALUES (@id, @agentId, @name, @relayIds, @entries, @onTime, @offTime, @days, @active)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      relayIds=excluded.relayIds,
      entries=excluded.entries,
      onTime=excluded.onTime,
      offTime=excluded.offTime,
      days=excluded.days,
      active=excluded.active;
  `).run({
    ...row,
    relayIds: JSON.stringify(relayIdsCombined),
    entries: JSON.stringify(entries),
    days: JSON.stringify(row.days || []),
    active: row.active ? 1 : 0,
  });
}

export function deleteGroup(agentId: string, id: string) {
  // Remove by owner hint first, then ensure deletion by id for backwards compatibility
  if (agentId) {
    db.prepare('DELETE FROM groups WHERE agentId = ? AND id = ?').run(agentId, id);
  }
  db.prepare('DELETE FROM groups WHERE id = ?').run(id);
}

// --- COMMAND JOURNAL ---
export function upsertCommand(row: CommandRow) {
  db.prepare(`
    INSERT INTO commands(id, agentId, relayId, desiredState, status, createdAt, expiresAt)
    VALUES (@id, @agentId, @relayId, @desiredState, @status, @createdAt, @expiresAt)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      expiresAt=excluded.expiresAt;
  `).run(row);
}

export function listPendingCommands(agentId: string): CommandRow[] {
  const rows = db.prepare(`SELECT * FROM commands WHERE agentId = ? AND status IN ('pending','sent')`).all(agentId) as any[];
  return rows.map(r => ({
    id: r.id,
    agentId: r.agentId,
    relayId: r.relayId,
    desiredState: r.desiredState,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

export function deleteCommand(id: string) {
  db.prepare('DELETE FROM commands WHERE id = ?').run(id);
}

export function updateCommandsForRelay(agentId: string, relayId: number, status: 'pending' | 'sent' | 'acked' | 'failed') {
  db.prepare(`UPDATE commands SET status = @status WHERE agentId = @agentId AND relayId = @relayId AND status IN ('pending','sent')`)
    .run({ agentId, relayId, status });
}

export function expireOldCommands(now = Date.now()) {
  db.prepare(`UPDATE commands SET status = ? WHERE expiresAt IS NOT NULL AND expiresAt < ? AND status IN ('pending','sent')`).run('failed', now);
}

// --- UI USERS ---
const listUiUsersStmt = db.prepare(`
  SELECT username, role, passwordHash, createdAt, updatedAt, lastLoginAt
  FROM ui_users
  ORDER BY username
`);

const getUiUserStmt = db.prepare(`
  SELECT username, role, passwordHash, createdAt, updatedAt, lastLoginAt
  FROM ui_users
  WHERE username = ?
`);

const countUiUsersStmt = db.prepare('SELECT COUNT(*) as count FROM ui_users');

const insertUiUserStmt = db.prepare(`
  INSERT INTO ui_users(username, role, passwordHash, createdAt, updatedAt, lastLoginAt)
  VALUES (@username, @role, @passwordHash, @createdAt, @updatedAt, @lastLoginAt)
`);

const updateUiUserRoleStmt = db.prepare(`
  UPDATE ui_users SET role = @role, updatedAt = @updatedAt WHERE username = @username
`);

const updateUiUserPasswordStmt = db.prepare(`
  UPDATE ui_users SET passwordHash = @passwordHash, updatedAt = @updatedAt WHERE username = @username
`);

const updateUiUserLastLoginStmt = db.prepare(`
  UPDATE ui_users SET lastLoginAt = @lastLoginAt, updatedAt = @updatedAt WHERE username = @username
`);

const toUiUser = (row: any): UiUserRecord => ({
  username: row.username,
  role: row.role === 'admin' ? 'admin' : 'user',
  passwordHash: row.passwordHash,
  createdAt: Number(row.createdAt) || 0,
  updatedAt: Number(row.updatedAt) || 0,
  lastLoginAt: row.lastLoginAt ?? null,
});

export function listUiUsers(): UiUserRecord[] {
  const rows = listUiUsersStmt.all() as any[];
  return rows.map(toUiUser);
}

export function getUiUser(username: string): UiUserRecord | null {
  const row = getUiUserStmt.get(username) as any;
  return row ? toUiUser(row) : null;
}

export function countUiUsers(): number {
  const row = countUiUsersStmt.get() as { count?: number } | undefined;
  return Number(row?.count || 0);
}

export function createUiUser(user: UiUserRecord): boolean {
  const info = insertUiUserStmt.run({
    username: user.username,
    role: user.role,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt ?? null,
  });
  return info.changes > 0;
}

export function updateUiUserRole(username: string, role: 'admin' | 'user', updatedAt = Date.now()): boolean {
  const info = updateUiUserRoleStmt.run({ username, role, updatedAt });
  return info.changes > 0;
}

export function updateUiUserPassword(username: string, passwordHash: string, updatedAt = Date.now()): boolean {
  const info = updateUiUserPasswordStmt.run({ username, passwordHash, updatedAt });
  return info.changes > 0;
}

export function updateUiUserLastLogin(username: string, lastLoginAt: number, updatedAt = Date.now()) {
  updateUiUserLastLoginStmt.run({ username, lastLoginAt, updatedAt });
}

// --- LEADS ---
const insertLeadStmt = db.prepare(`
  INSERT OR IGNORE INTO leads(email, createdAt, source, ip, userAgent, referrer)
  VALUES (@email, @createdAt, @source, @ip, @userAgent, @referrer)
`);

const lastLeadByIpStmt = db.prepare(`
  SELECT createdAt FROM leads WHERE ip = ? ORDER BY createdAt DESC LIMIT 1
`);

export function insertLead(row: LeadRow) {
  insertLeadStmt.run({
    email: row.email,
    createdAt: row.createdAt,
    source: row.source || null,
    ip: row.ip || null,
    userAgent: row.userAgent || null,
    referrer: row.referrer || null,
  });
}

export function getLastLeadTimestampForIp(ip: string): number | null {
  const row = lastLeadByIpStmt.get(ip) as { createdAt?: number } | undefined;
  return row?.createdAt ?? null;
}

// --- AGENTS ---
export function deleteAgent(agentId: string) {
  db.prepare('DELETE FROM agents WHERE agentId = ?').run(agentId);
  db.prepare('DELETE FROM schedules WHERE agentId = ?').run(agentId);
  db.prepare('DELETE FROM groups WHERE agentId = ?').run(agentId);
  const cameras = listCameras(agentId);
  db.prepare('DELETE FROM cameras WHERE agentId = ?').run(agentId);
  const secretIds = new Set<string>();
  cameras.forEach(camera => {
    if (camera.usernameSecretId) secretIds.add(camera.usernameSecretId);
    if (camera.passwordSecretId) secretIds.add(camera.passwordSecretId);
  });
  secretIds.forEach(id => {
    try {
      deleteIntegrationSecret(id);
    } catch (_) {
      // ignore cleanup errors
    }
  });
}

const parseDeductions = (raw: string | null): RevenueDeduction[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => ({
        amount: typeof item?.amount === 'number' ? item.amount : Number(item?.amount),
        comment: typeof item?.comment === 'string' ? item.comment : String(item?.comment || ''),
      }))
      .filter(item => Number.isFinite(item.amount) && item.comment.trim().length > 0)
      .map(item => ({ amount: Number(item.amount), comment: item.comment.trim() }));
  } catch {
    return [];
  }
};

const mapRevenueEntryRow = (row: any): RevenueEntryRow => ({
  agentId: row.agentId,
  entryDate: row.entryDate,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  coinsTotal: Number(row.coinsTotal) || 0,
  euroCoinsCount: Number(row.euroCoinsCount) || 0,
  billsTotal: Number(row.billsTotal) || 0,
  deductions: parseDeductions(row.deductions),
  deductionsTotal: Number(row.deductionsTotal) || 0,
  createdBy: row.createdBy || null,
  updatedBy: row.updatedBy || null,
  hasEdits: Boolean(row.hasEdits),
});

const upsertRevenueEntryStmt = db.prepare(`
  INSERT INTO revenue_entries(
    agentId, entryDate, createdAt, updatedAt,
    coinsTotal, euroCoinsCount, billsTotal, deductions, deductionsTotal,
    createdBy, updatedBy, hasEdits
  )
  VALUES (
    @agentId, @entryDate, @createdAt, @updatedAt,
    @coinsTotal, @euroCoinsCount, @billsTotal, @deductions, @deductionsTotal,
    @createdBy, @updatedBy, @hasEdits
  )
  ON CONFLICT(agentId, entryDate) DO UPDATE SET
    updatedAt=excluded.updatedAt,
    coinsTotal=excluded.coinsTotal,
    euroCoinsCount=excluded.euroCoinsCount,
    billsTotal=excluded.billsTotal,
    deductions=excluded.deductions,
    deductionsTotal=excluded.deductionsTotal,
    updatedBy=excluded.updatedBy,
    hasEdits=excluded.hasEdits;
`);

const insertRevenueAuditStmt = db.prepare(`
  INSERT INTO revenue_audit(agentId, entryDate, field, oldValue, newValue, user, createdAt)
  VALUES (@agentId, @entryDate, @field, @oldValue, @newValue, @user, @createdAt)
`);

export function getRevenueEntry(agentId: string, entryDate: string): RevenueEntryRow | null {
  const row = db.prepare('SELECT * FROM revenue_entries WHERE agentId = ? AND entryDate = ?').get(agentId, entryDate) as any;
  if (!row) return null;
  return {
    agentId: row.agentId,
    entryDate: row.entryDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    coinsTotal: Number(row.coinsTotal) || 0,
    euroCoinsCount: Number(row.euroCoinsCount) || 0,
    billsTotal: Number(row.billsTotal) || 0,
    deductions: parseDeductions(row.deductions),
    deductionsTotal: Number(row.deductionsTotal) || 0,
    createdBy: row.createdBy || null,
    updatedBy: row.updatedBy || null,
    hasEdits: Boolean(row.hasEdits),
  };
}

export function listRevenueEntriesBetween(startDate: string, endDate: string, agentId?: string): RevenueEntryRow[] {
  const rows = agentId
    ? db.prepare('SELECT * FROM revenue_entries WHERE agentId = ? AND entryDate BETWEEN ? AND ?').all(agentId, startDate, endDate)
    : db.prepare('SELECT * FROM revenue_entries WHERE entryDate BETWEEN ? AND ?').all(startDate, endDate);
  return rows.map(mapRevenueEntryRow);
}

export function listRevenueEntries(options: { startDate?: string; endDate?: string; agentId?: string } = {}): RevenueEntryRow[] {
  const { startDate, endDate, agentId } = options;
  if (startDate && endDate) {
    return listRevenueEntriesBetween(startDate, endDate, agentId);
  }
  const rows = agentId
    ? db.prepare('SELECT * FROM revenue_entries WHERE agentId = ? ORDER BY entryDate DESC, updatedAt DESC').all(agentId)
    : db.prepare('SELECT * FROM revenue_entries ORDER BY entryDate DESC, updatedAt DESC').all();
  return rows.map(mapRevenueEntryRow);
}

export function listRevenueEntryDatesBetween(startDate: string, endDate: string, agentId?: string): string[] {
  const rows = agentId
    ? db.prepare('SELECT DISTINCT entryDate FROM revenue_entries WHERE agentId = ? AND entryDate BETWEEN ? AND ? ORDER BY entryDate')
        .all(agentId, startDate, endDate)
    : db.prepare('SELECT DISTINCT entryDate FROM revenue_entries WHERE entryDate BETWEEN ? AND ? ORDER BY entryDate')
        .all(startDate, endDate);
  return rows.map((row: any) => row.entryDate);
}

export function upsertRevenueEntry(row: RevenueEntryRow) {
  upsertRevenueEntryStmt.run({
    ...row,
    deductions: JSON.stringify(row.deductions || []),
    hasEdits: row.hasEdits ? 1 : 0,
  });
}

export function listRevenueAudit(agentId: string, entryDate: string): RevenueAuditRow[] {
  const rows = db.prepare('SELECT * FROM revenue_audit WHERE agentId = ? AND entryDate = ? ORDER BY createdAt DESC, id DESC')
    .all(agentId, entryDate) as any[];
  return rows.map(row => ({
    id: row.id,
    agentId: row.agentId,
    entryDate: row.entryDate,
    field: row.field,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue ?? null,
    user: row.user,
    createdAt: row.createdAt,
  }));
}

export function insertRevenueAudit(rows: RevenueAuditRow[]) {
  if (!rows.length) return;
  const insertMany = db.transaction((items: RevenueAuditRow[]) => {
    items.forEach(item => {
      insertRevenueAuditStmt.run({
        agentId: item.agentId,
        entryDate: item.entryDate,
        field: item.field,
        oldValue: item.oldValue ?? null,
        newValue: item.newValue ?? null,
        user: item.user,
        createdAt: item.createdAt,
      });
    });
  });
  insertMany(rows);
}

// --- INTEGRATION SECRETS ---
const upsertIntegrationSecretStmt = db.prepare(`
  INSERT INTO integration_secrets(id, kind, cipher, createdAt, updatedAt)
  VALUES (@id, @kind, @cipher, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    kind=excluded.kind,
    cipher=excluded.cipher,
    updatedAt=excluded.updatedAt;
`);

const getIntegrationSecretStmt = db.prepare('SELECT * FROM integration_secrets WHERE id = ?');
const deleteIntegrationSecretStmt = db.prepare('DELETE FROM integration_secrets WHERE id = ?');

export function upsertIntegrationSecret(row: IntegrationSecretRow) {
  upsertIntegrationSecretStmt.run({
    id: row.id,
    kind: row.kind,
    cipher: row.cipher,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function getIntegrationSecret(id: string): IntegrationSecretRow | null {
  const row = getIntegrationSecretStmt.get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    cipher: row.cipher,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function deleteIntegrationSecret(id: string) {
  deleteIntegrationSecretStmt.run(id);
}

// --- CAMERAS ---
const upsertCameraStmt = db.prepare(`
  INSERT INTO cameras(
    id, agentId, name, position, sourceType, rtspUrl, usernameSecretId, passwordSecretId,
    enabled, createdAt, updatedAt
  )
  VALUES (
    @id, @agentId, @name, @position, @sourceType, @rtspUrl, @usernameSecretId, @passwordSecretId,
    @enabled, @createdAt, @updatedAt
  )
  ON CONFLICT(id) DO UPDATE SET
    agentId=excluded.agentId,
    name=excluded.name,
    position=excluded.position,
    sourceType=excluded.sourceType,
    rtspUrl=excluded.rtspUrl,
    usernameSecretId=excluded.usernameSecretId,
    passwordSecretId=excluded.passwordSecretId,
    enabled=excluded.enabled,
    updatedAt=excluded.updatedAt;
`);

export function upsertCamera(row: CameraRow) {
  upsertCameraStmt.run({
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    position: row.position,
    sourceType: row.sourceType,
    rtspUrl: row.rtspUrl || null,
    usernameSecretId: row.usernameSecretId || null,
    passwordSecretId: row.passwordSecretId || null,
    enabled: row.enabled ? 1 : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function getCamera(id: string): CameraRow | null {
  const row = db.prepare('SELECT * FROM cameras WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    position: row.position,
    sourceType: row.sourceType,
    rtspUrl: row.rtspUrl || null,
    usernameSecretId: row.usernameSecretId || null,
    passwordSecretId: row.passwordSecretId || null,
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listCameras(agentId?: string): CameraRow[] {
  const rows = agentId
    ? db.prepare('SELECT * FROM cameras WHERE agentId = ? ORDER BY position, createdAt').all(agentId)
    : db.prepare('SELECT * FROM cameras ORDER BY agentId, position, createdAt').all();
  return rows.map((row: any) => ({
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    position: row.position,
    sourceType: row.sourceType,
    rtspUrl: row.rtspUrl || null,
    usernameSecretId: row.usernameSecretId || null,
    passwordSecretId: row.passwordSecretId || null,
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function deleteCamera(id: string) {
  db.prepare('DELETE FROM cameras WHERE id = ?').run(id);
}
