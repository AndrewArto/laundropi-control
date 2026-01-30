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

export type UserRole = 'admin' | 'user' | 'viewer';

export type UiUserRecord = {
  username: string;
  role: UserRole;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  expiresAt: number | null;
  invitedBy: string | null;
};

export type InviteTokenRow = {
  token: string;
  email: string;
  role: UserRole;
  expiresAt: number;
  createdBy: string;
  createdAt: number;
  usedAt: number | null;
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

export type DetergentType = 'blue' | 'green' | 'brown';

export type InventoryRow = {
  agentId: string;
  detergentType: DetergentType;
  quantity: number;
  updatedAt: number;
  updatedBy: string;
};

export type InventoryAuditRow = {
  id?: number;
  agentId: string;
  detergentType: DetergentType;
  oldQuantity: number;
  newQuantity: number;
  changeAmount: number;
  user: string;
  createdAt: number;
};

const dbPath = process.env.CENTRAL_DB_PATH || './central.db';
if (process.env.NODE_ENV !== 'test') {
  console.log(`[central] DB path ${dbPath}`);
}
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
  lastLoginAt INTEGER,
  expiresAt INTEGER,
  invitedBy TEXT
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  expiresAt INTEGER NOT NULL,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  usedAt INTEGER
);

CREATE INDEX IF NOT EXISTS invite_tokens_email_idx ON invite_tokens(email);

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

CREATE TABLE IF NOT EXISTS inventory (
  agentId TEXT NOT NULL,
  detergentType TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT NOT NULL,
  PRIMARY KEY (agentId, detergentType)
);

CREATE TABLE IF NOT EXISTS inventory_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agentId TEXT NOT NULL,
  detergentType TEXT NOT NULL,
  oldQuantity INTEGER NOT NULL,
  newQuantity INTEGER NOT NULL,
  changeAmount INTEGER NOT NULL,
  user TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_audit_agent_type_idx ON inventory_audit(agentId, detergentType, createdAt);

CREATE TABLE IF NOT EXISTS expenditure_imports (
  id TEXT PRIMARY KEY,
  fileName TEXT NOT NULL,
  dateRangeStart TEXT,
  dateRangeEnd TEXT,
  totalTransactions INTEGER NOT NULL,
  totalAmount REAL NOT NULL,
  status TEXT NOT NULL,
  importedAt INTEGER NOT NULL,
  importedBy TEXT NOT NULL,
  completedAt INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS expenditure_imports_status_idx ON expenditure_imports(status, importedAt);

CREATE TABLE IF NOT EXISTS expenditure_transactions (
  id TEXT PRIMARY KEY,
  importId TEXT NOT NULL,
  transactionDate TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  bankReference TEXT,
  category TEXT,
  transactionType TEXT NOT NULL DEFAULT 'expense',
  reconciliationStatus TEXT NOT NULL,
  matchedDeductionKey TEXT,
  assignedAgentId TEXT,
  reconciliationNotes TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (importId) REFERENCES expenditure_imports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS expenditure_transactions_import_idx ON expenditure_transactions(importId);
CREATE INDEX IF NOT EXISTS expenditure_transactions_date_idx ON expenditure_transactions(transactionDate);
CREATE INDEX IF NOT EXISTS expenditure_transactions_status_idx ON expenditure_transactions(reconciliationStatus);
CREATE INDEX IF NOT EXISTS expenditure_transactions_agent_idx ON expenditure_transactions(assignedAgentId, transactionDate);

CREATE TABLE IF NOT EXISTS expenditure_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  importId TEXT NOT NULL,
  transactionId TEXT,
  action TEXT NOT NULL,
  details TEXT,
  user TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS expenditure_audit_import_idx ON expenditure_audit(importId, createdAt);
`);

// Best-effort migration: add entries column if missing (ignore errors)
try {
  db.prepare('ALTER TABLE groups ADD COLUMN entries TEXT').run();
} catch (_) {
  // column already exists
}

// Best-effort migration: add fileHash column to expenditure_imports
try {
  db.prepare('ALTER TABLE expenditure_imports ADD COLUMN fileHash TEXT').run();
} catch (_) {
  // column already exists
}

// Best-effort migration: add transactionType column to expenditure_transactions
try {
  db.prepare("ALTER TABLE expenditure_transactions ADD COLUMN transactionType TEXT NOT NULL DEFAULT 'expense'").run();
} catch (_) {
  // column already exists
}

// Create index on transactionType after ensuring the column exists
try {
  db.exec('CREATE INDEX IF NOT EXISTS expenditure_transactions_type_idx ON expenditure_transactions(transactionType)');
} catch (_) {
  // index creation failed or already exists
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

// Best-effort migration: add expiresAt and invitedBy columns to ui_users for viewer role support
const uiUsersColumns = db.prepare(`PRAGMA table_info(ui_users)`).all() as any[];
const uiUsersColNames = new Set(uiUsersColumns.map(c => c.name));
try {
  if (!uiUsersColNames.has('expiresAt')) db.prepare('ALTER TABLE ui_users ADD COLUMN expiresAt INTEGER').run();
  if (!uiUsersColNames.has('invitedBy')) db.prepare('ALTER TABLE ui_users ADD COLUMN invitedBy TEXT').run();
} catch (_) {
  // ignore migration errors
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
  SELECT username, role, passwordHash, createdAt, updatedAt, lastLoginAt, expiresAt, invitedBy
  FROM ui_users
  ORDER BY username
`);

const getUiUserStmt = db.prepare(`
  SELECT username, role, passwordHash, createdAt, updatedAt, lastLoginAt, expiresAt, invitedBy
  FROM ui_users
  WHERE username = ?
`);

const countUiUsersStmt = db.prepare('SELECT COUNT(*) as count FROM ui_users');

const insertUiUserStmt = db.prepare(`
  INSERT INTO ui_users(username, role, passwordHash, createdAt, updatedAt, lastLoginAt, expiresAt, invitedBy)
  VALUES (@username, @role, @passwordHash, @createdAt, @updatedAt, @lastLoginAt, @expiresAt, @invitedBy)
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

const normalizeRole = (role: string): UserRole => {
  if (role === 'admin') return 'admin';
  if (role === 'viewer') return 'viewer';
  return 'user';
};

const toUiUser = (row: any): UiUserRecord => ({
  username: row.username,
  role: normalizeRole(row.role),
  passwordHash: row.passwordHash,
  createdAt: Number(row.createdAt) || 0,
  updatedAt: Number(row.updatedAt) || 0,
  lastLoginAt: row.lastLoginAt ?? null,
  expiresAt: row.expiresAt ?? null,
  invitedBy: row.invitedBy ?? null,
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
    expiresAt: user.expiresAt ?? null,
    invitedBy: user.invitedBy ?? null,
  });
  return info.changes > 0;
}

export function updateUiUserRole(username: string, role: UserRole, updatedAt = Date.now()): boolean {
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

const deleteUiUserStmt = db.prepare('DELETE FROM ui_users WHERE username = ?');

export function deleteUiUser(username: string): boolean {
  const info = deleteUiUserStmt.run(username);
  return info.changes > 0;
}

// --- INVITE TOKENS ---
const insertInviteTokenStmt = db.prepare(`
  INSERT INTO invite_tokens(token, email, role, expiresAt, createdBy, createdAt, usedAt)
  VALUES (@token, @email, @role, @expiresAt, @createdBy, @createdAt, @usedAt)
`);

const getInviteTokenStmt = db.prepare(`
  SELECT token, email, role, expiresAt, createdBy, createdAt, usedAt
  FROM invite_tokens
  WHERE token = ?
`);

const listPendingInvitesStmt = db.prepare(`
  SELECT token, email, role, expiresAt, createdBy, createdAt, usedAt
  FROM invite_tokens
  WHERE usedAt IS NULL AND expiresAt > ?
  ORDER BY createdAt DESC
`);

const markInviteTokenUsedStmt = db.prepare(`
  UPDATE invite_tokens SET usedAt = @usedAt WHERE token = @token
`);

const deleteInviteTokenStmt = db.prepare(`
  DELETE FROM invite_tokens WHERE token = ?
`);

const toInviteToken = (row: any): InviteTokenRow => ({
  token: row.token,
  email: row.email,
  role: normalizeRole(row.role),
  expiresAt: Number(row.expiresAt) || 0,
  createdBy: row.createdBy,
  createdAt: Number(row.createdAt) || 0,
  usedAt: row.usedAt ?? null,
});

export function createInviteToken(invite: InviteTokenRow): boolean {
  const info = insertInviteTokenStmt.run({
    token: invite.token,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    createdBy: invite.createdBy,
    createdAt: invite.createdAt,
    usedAt: invite.usedAt ?? null,
  });
  return info.changes > 0;
}

export function getInviteToken(token: string): InviteTokenRow | null {
  const row = getInviteTokenStmt.get(token) as any;
  return row ? toInviteToken(row) : null;
}

export function listPendingInvites(now = Date.now()): InviteTokenRow[] {
  const rows = listPendingInvitesStmt.all(now) as any[];
  return rows.map(toInviteToken);
}

export function markInviteTokenUsed(token: string, usedAt = Date.now()): boolean {
  const info = markInviteTokenUsedStmt.run({ token, usedAt });
  return info.changes > 0;
}

export function deleteInviteToken(token: string): boolean {
  const info = deleteInviteTokenStmt.run(token);
  return info.changes > 0;
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

export function listLeads(): LeadRow[] {
  const rows = db.prepare(`
    SELECT id, email, createdAt, source, ip, userAgent, referrer
    FROM leads
    ORDER BY createdAt DESC
  `).all() as Array<{
    id: number;
    email: string;
    createdAt: number;
    source: string | null;
    ip: string | null;
    userAgent: string | null;
    referrer: string | null;
  }>;

  return rows.map(row => ({
    email: row.email,
    createdAt: row.createdAt,
    source: row.source,
    ip: row.ip,
    userAgent: row.userAgent,
    referrer: row.referrer,
  }));
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

export interface DateEntryInfo {
  date: string;
  hasRevenue: boolean;
  hasExpenses: boolean;
}

export function listRevenueEntryDatesWithInfo(startDate: string, endDate: string, agentId?: string): DateEntryInfo[] {
  // Query to get dates with aggregated revenue and deductions info
  // hasRevenue: true if coinsTotal > 0 OR billsTotal > 0 for non-FixCost agents
  // hasExpenses: true if deductionsTotal > 0 for any agent
  const query = agentId
    ? `SELECT entryDate,
         MAX(CASE WHEN (coinsTotal > 0 OR billsTotal > 0) AND agentId != 'FixCost' THEN 1 ELSE 0 END) as hasRevenue,
         MAX(CASE WHEN deductionsTotal > 0 THEN 1 ELSE 0 END) as hasExpenses
       FROM revenue_entries
       WHERE agentId = ? AND entryDate BETWEEN ? AND ?
       GROUP BY entryDate
       ORDER BY entryDate`
    : `SELECT entryDate,
         MAX(CASE WHEN (coinsTotal > 0 OR billsTotal > 0) AND agentId != 'FixCost' THEN 1 ELSE 0 END) as hasRevenue,
         MAX(CASE WHEN deductionsTotal > 0 THEN 1 ELSE 0 END) as hasExpenses
       FROM revenue_entries
       WHERE entryDate BETWEEN ? AND ?
       GROUP BY entryDate
       ORDER BY entryDate`;

  const rows = agentId
    ? db.prepare(query).all(agentId, startDate, endDate)
    : db.prepare(query).all(startDate, endDate);

  return (rows as any[]).map(row => ({
    date: row.entryDate,
    hasRevenue: row.hasRevenue === 1,
    hasExpenses: row.hasExpenses === 1,
  }));
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

// ========== Inventory ==========

export function getInventory(agentId: string, detergentType: DetergentType): InventoryRow | null {
  const row = db.prepare('SELECT * FROM inventory WHERE agentId = ? AND detergentType = ?').get(agentId, detergentType) as any;
  if (!row) return null;
  return {
    agentId: row.agentId,
    detergentType: row.detergentType as DetergentType,
    quantity: row.quantity,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export function listInventory(agentId: string): InventoryRow[] {
  const rows = db.prepare('SELECT * FROM inventory WHERE agentId = ? ORDER BY detergentType').all(agentId) as any[];
  return rows.map(row => ({
    agentId: row.agentId,
    detergentType: row.detergentType as DetergentType,
    quantity: row.quantity,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  }));
}

export function listAllInventory(): InventoryRow[] {
  const rows = db.prepare('SELECT * FROM inventory ORDER BY agentId, detergentType').all() as any[];
  return rows.map(row => ({
    agentId: row.agentId,
    detergentType: row.detergentType as DetergentType,
    quantity: row.quantity,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  }));
}

export function updateInventory(agentId: string, detergentType: DetergentType, newQuantity: number, user: string) {
  const existing = getInventory(agentId, detergentType);
  const oldQuantity = existing?.quantity ?? 0;
  const changeAmount = newQuantity - oldQuantity;
  const now = Date.now();

  // Update inventory
  db.prepare(`
    INSERT INTO inventory (agentId, detergentType, quantity, updatedAt, updatedBy)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(agentId, detergentType) DO UPDATE SET
      quantity = excluded.quantity,
      updatedAt = excluded.updatedAt,
      updatedBy = excluded.updatedBy
  `).run(agentId, detergentType, newQuantity, now, user);

  // Add audit entry
  db.prepare(`
    INSERT INTO inventory_audit (agentId, detergentType, oldQuantity, newQuantity, changeAmount, user, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(agentId, detergentType, oldQuantity, newQuantity, changeAmount, user, now);
}

export function getInventoryAudit(agentId: string, detergentType: DetergentType, limit: number = 100): InventoryAuditRow[] {
  const rows = db.prepare(`
    SELECT * FROM inventory_audit
    WHERE agentId = ? AND detergentType = ?
    ORDER BY createdAt DESC
    LIMIT ?
  `).all(agentId, detergentType, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    agentId: row.agentId,
    detergentType: row.detergentType as DetergentType,
    oldQuantity: row.oldQuantity,
    newQuantity: row.newQuantity,
    changeAmount: row.changeAmount,
    user: row.user,
    createdAt: row.createdAt,
  }));
}

export function getLastInventoryChange(agentId: string, detergentType: DetergentType): InventoryAuditRow | null {
  const row = db.prepare(`
    SELECT * FROM inventory_audit
    WHERE agentId = ? AND detergentType = ?
    ORDER BY createdAt DESC
    LIMIT 1
  `).get(agentId, detergentType) as any;

  if (!row) return null;

  return {
    id: row.id,
    agentId: row.agentId,
    detergentType: row.detergentType as DetergentType,
    oldQuantity: row.oldQuantity,
    newQuantity: row.newQuantity,
    changeAmount: row.changeAmount,
    user: row.user,
    createdAt: row.createdAt,
  };
}

// --- EXPENDITURE IMPORTS ---

export interface ExpenditureImportRow {
  id: string;
  fileName: string;
  fileHash: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  totalTransactions: number;
  totalAmount: number;
  status: 'uploaded' | 'reconciling' | 'completed' | 'cancelled';
  importedAt: number;
  importedBy: string;
  completedAt: number | null;
  notes: string | null;
}

export interface ExpenditureAuditRow {
  id?: number;
  importId: string;
  transactionId: string | null;
  action: string;
  details: string | null;
  user: string;
  createdAt: number;
}

export interface ExpenditureTransactionRow {
  id: string;
  importId: string;
  transactionDate: string;
  description: string;
  amount: number;
  bankReference: string | null;
  category: string | null;
  transactionType: 'expense' | 'stripe_credit' | 'other_credit';
  reconciliationStatus: 'new' | 'existing' | 'discrepancy' | 'ignored';
  matchedDeductionKey: string | null;
  assignedAgentId: string | null;
  reconciliationNotes: string | null;
  createdAt: number;
}

const insertExpenditureImportStmt = db.prepare(`
  INSERT INTO expenditure_imports(
    id, fileName, fileHash, dateRangeStart, dateRangeEnd, totalTransactions, totalAmount,
    status, importedAt, importedBy, completedAt, notes
  )
  VALUES (
    @id, @fileName, @fileHash, @dateRangeStart, @dateRangeEnd, @totalTransactions, @totalAmount,
    @status, @importedAt, @importedBy, @completedAt, @notes
  )
`);

const updateExpenditureImportStmt = db.prepare(`
  UPDATE expenditure_imports
  SET status = @status, completedAt = @completedAt, notes = @notes
  WHERE id = @id
`);

export function createExpenditureImport(row: ExpenditureImportRow) {
  insertExpenditureImportStmt.run({
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
    totalTransactions: row.totalTransactions,
    totalAmount: row.totalAmount,
    status: row.status,
    importedAt: row.importedAt,
    importedBy: row.importedBy,
    completedAt: row.completedAt,
    notes: row.notes,
  });
}

export function updateExpenditureImport(id: string, status: string, completedAt: number | null, notes: string | null) {
  updateExpenditureImportStmt.run({ id, status, completedAt, notes });
}

export function getExpenditureImport(id: string): ExpenditureImportRow | null {
  const row = db.prepare('SELECT * FROM expenditure_imports WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash || null,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
    totalTransactions: row.totalTransactions,
    totalAmount: row.totalAmount,
    status: row.status,
    importedAt: row.importedAt,
    importedBy: row.importedBy,
    completedAt: row.completedAt,
    notes: row.notes,
  };
}

export function getExpenditureImportByHash(fileHash: string): ExpenditureImportRow | null {
  const row = db.prepare('SELECT * FROM expenditure_imports WHERE fileHash = ? ORDER BY importedAt DESC LIMIT 1').get(fileHash) as any;
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash || null,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
    totalTransactions: row.totalTransactions,
    totalAmount: row.totalAmount,
    status: row.status,
    importedAt: row.importedAt,
    importedBy: row.importedBy,
    completedAt: row.completedAt,
    notes: row.notes,
  };
}

export function listExpenditureImports(): ExpenditureImportRow[] {
  const rows = db.prepare('SELECT * FROM expenditure_imports ORDER BY importedAt DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    fileName: row.fileName,
    fileHash: row.fileHash || null,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
    totalTransactions: row.totalTransactions,
    totalAmount: row.totalAmount,
    status: row.status,
    importedAt: row.importedAt,
    importedBy: row.importedBy,
    completedAt: row.completedAt,
    notes: row.notes,
  }));
}

const insertExpenditureTransactionStmt = db.prepare(`
  INSERT INTO expenditure_transactions(
    id, importId, transactionDate, description, amount, bankReference, category,
    transactionType, reconciliationStatus, matchedDeductionKey, assignedAgentId, reconciliationNotes, createdAt
  )
  VALUES (
    @id, @importId, @transactionDate, @description, @amount, @bankReference, @category,
    @transactionType, @reconciliationStatus, @matchedDeductionKey, @assignedAgentId, @reconciliationNotes, @createdAt
  )
`);

const updateExpenditureTransactionStmt = db.prepare(`
  UPDATE expenditure_transactions
  SET reconciliationStatus = @reconciliationStatus,
      matchedDeductionKey = @matchedDeductionKey,
      assignedAgentId = @assignedAgentId,
      reconciliationNotes = @reconciliationNotes
  WHERE id = @id
`);

export function createExpenditureTransaction(row: ExpenditureTransactionRow) {
  insertExpenditureTransactionStmt.run({
    id: row.id,
    importId: row.importId,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: row.amount,
    bankReference: row.bankReference,
    category: row.category,
    transactionType: row.transactionType || 'expense',
    reconciliationStatus: row.reconciliationStatus,
    matchedDeductionKey: row.matchedDeductionKey,
    assignedAgentId: row.assignedAgentId,
    reconciliationNotes: row.reconciliationNotes,
    createdAt: row.createdAt,
  });
}

export function updateExpenditureTransaction(
  id: string,
  reconciliationStatus: string,
  matchedDeductionKey: string | null,
  assignedAgentId: string | null,
  reconciliationNotes: string | null
) {
  updateExpenditureTransactionStmt.run({
    id,
    reconciliationStatus,
    matchedDeductionKey,
    assignedAgentId,
    reconciliationNotes,
  });
}

export function getExpenditureTransaction(id: string): ExpenditureTransactionRow | null {
  const row = db.prepare('SELECT * FROM expenditure_transactions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    importId: row.importId,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: row.amount,
    bankReference: row.bankReference,
    category: row.category,
    transactionType: row.transactionType,
    reconciliationStatus: row.reconciliationStatus,
    matchedDeductionKey: row.matchedDeductionKey,
    assignedAgentId: row.assignedAgentId,
    reconciliationNotes: row.reconciliationNotes,
    createdAt: row.createdAt,
  };
}

export function listExpenditureTransactionsByImport(importId: string): ExpenditureTransactionRow[] {
  const rows = db.prepare('SELECT * FROM expenditure_transactions WHERE importId = ? ORDER BY transactionDate').all(importId) as any[];
  return rows.map(row => ({
    id: row.id,
    importId: row.importId,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: row.amount,
    bankReference: row.bankReference,
    category: row.category,
    transactionType: row.transactionType,
    reconciliationStatus: row.reconciliationStatus,
    matchedDeductionKey: row.matchedDeductionKey,
    assignedAgentId: row.assignedAgentId,
    reconciliationNotes: row.reconciliationNotes,
    createdAt: row.createdAt,
  }));
}

export function listExpenditureTransactionsByDateRange(startDate: string, endDate: string, agentId?: string): ExpenditureTransactionRow[] {
  let query = 'SELECT * FROM expenditure_transactions WHERE transactionDate >= ? AND transactionDate <= ?';
  const params: any[] = [startDate, endDate];

  if (agentId) {
    query += ' AND assignedAgentId = ?';
    params.push(agentId);
  }

  query += ' ORDER BY transactionDate';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    id: row.id,
    importId: row.importId,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: row.amount,
    bankReference: row.bankReference,
    category: row.category,
    transactionType: row.transactionType,
    reconciliationStatus: row.reconciliationStatus,
    matchedDeductionKey: row.matchedDeductionKey,
    assignedAgentId: row.assignedAgentId,
    reconciliationNotes: row.reconciliationNotes,
    createdAt: row.createdAt,
  }));
}

export function listIgnoredExpenditureTransactions(): ExpenditureTransactionRow[] {
  const rows = db.prepare(`
    SELECT * FROM expenditure_transactions
    WHERE reconciliationStatus = 'ignored'
    ORDER BY transactionDate DESC
  `).all() as any[];
  return rows.map(row => ({
    id: row.id,
    importId: row.importId,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: row.amount,
    bankReference: row.bankReference,
    category: row.category,
    transactionType: row.transactionType,
    reconciliationStatus: row.reconciliationStatus,
    matchedDeductionKey: row.matchedDeductionKey,
    assignedAgentId: row.assignedAgentId,
    reconciliationNotes: row.reconciliationNotes,
    createdAt: row.createdAt,
  }));
}

export function listAssignedExpenditureTransactions(): ExpenditureTransactionRow[] {
  const rows = db.prepare(`
    SELECT * FROM expenditure_transactions
    WHERE reconciliationStatus = 'existing'
    ORDER BY transactionDate DESC
  `).all() as any[];
  return rows.map(row => ({
    id: row.id,
    importId: row.importId,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: row.amount,
    bankReference: row.bankReference,
    category: row.category,
    transactionType: row.transactionType,
    reconciliationStatus: row.reconciliationStatus,
    matchedDeductionKey: row.matchedDeductionKey,
    assignedAgentId: row.assignedAgentId,
    reconciliationNotes: row.reconciliationNotes,
    createdAt: row.createdAt,
  }));
}

export function deleteExpenditureImport(id: string) {
  // Transactions are deleted via CASCADE
  db.prepare('DELETE FROM expenditure_imports WHERE id = ?').run(id);
  // Also delete audit entries for this import
  db.prepare('DELETE FROM expenditure_audit WHERE importId = ?').run(id);
}

// --- EXPENDITURE AUDIT ---

const insertExpenditureAuditStmt = db.prepare(`
  INSERT INTO expenditure_audit(importId, transactionId, action, details, user, createdAt)
  VALUES (@importId, @transactionId, @action, @details, @user, @createdAt)
`);

export function insertExpenditureAudit(row: ExpenditureAuditRow) {
  insertExpenditureAuditStmt.run({
    importId: row.importId,
    transactionId: row.transactionId,
    action: row.action,
    details: row.details,
    user: row.user,
    createdAt: row.createdAt,
  });
}

export function listExpenditureAudit(importId: string): ExpenditureAuditRow[] {
  const rows = db.prepare(`
    SELECT * FROM expenditure_audit
    WHERE importId = ?
    ORDER BY createdAt DESC
  `).all(importId) as any[];
  return rows.map(row => ({
    id: row.id,
    importId: row.importId,
    transactionId: row.transactionId,
    action: row.action,
    details: row.details,
    user: row.user,
    createdAt: row.createdAt,
  }));
}
