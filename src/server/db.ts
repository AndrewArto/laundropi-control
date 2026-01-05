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
}
