import * as http from 'http';
import express = require('express');
import cors = require('cors');
import { WebSocketServer, WebSocket } from 'ws';
import * as dotenv from 'dotenv';
import { listAgents, updateHeartbeat, saveMeta, getAgent, updateRelayMeta, listSchedules, upsertSchedule, deleteSchedule, listGroups, listGroupsForMembership, upsertGroup, deleteGroup, GroupRow, deleteAgent } from './db';

dotenv.config();

const PORT = Number(process.env.CENTRAL_PORT || 4000);
const AGENT_SECRET = process.env.CENTRAL_AGENT_SECRET || 'secret';
const HEARTBEAT_STALE_MS = 30_000;

type AgentSocketRecord = { socket: WebSocket; lastHeartbeat: number };
const agents: Map<string, AgentSocketRecord> = new Map();
const relayStateCache: Map<string, Map<number, string>> = new Map();

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
    if (process.env.SCHEDULE_DEBUG === '1' || process.env.SCHEDULE_DEBUG === 'true') {
      console.log('[central] pushSchedulesToAgent', agentId, JSON.stringify(scheds, null, 2));
    }
    target.socket.send(JSON.stringify({ type: 'update_schedule', schedules: scheds }));
  }
};

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/agents', (_req, res) => {
  const list = listAgents().map(a => {
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
  const rec = getAgent(req.params.id);
  if (!rec) return res.status(404).json({ error: 'agent not found' });
  res.json({
    agentId: rec.agentId,
    lastHeartbeat: rec.lastHeartbeat,
    status: rec.lastStatus,
    meta: rec.lastMeta,
  });
});

app.post('/api/agents', (req, res) => {
  const { agentId, secret } = req.body || {};
  if (!agentId || !secret) return res.status(400).json({ error: 'agentId and secret required' });
  saveMeta(agentId, secret, null);
  res.json({ ok: true });
});

app.delete('/api/agents/:id', (req, res) => {
  deleteAgent(req.params.id);
  agents.delete(req.params.id);
  relayStateCache.delete(req.params.id);
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
  res.json({ ok: true, sent: { relayId: Number(relayId), state } });
});

app.get('/api/dashboard', (req, res) => {
  const agentId = (req.query.agentId as string) || listAgents()[0]?.agentId;
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
  res.json({
    relays,
    schedules,
    groups,
    isMock: true,
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
    if (!target || target.socket.readyState !== WebSocket.OPEN) {
      results[entry.agentId] = 'offline';
      return;
    }
    entry.relayIds.forEach(rid => {
      target.socket.send(JSON.stringify({ type: 'set_relay', relayId: rid, state: action }));
    });
    results[entry.agentId] = 'ok';
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
        const existing = getAgent(msg.agentId);
        if (existing && existing.secret && existing.secret !== msg.secret) {
          console.warn('[central] invalid secret from', msg.agentId);
          socket.close();
          return;
        }
        if (msg.secret !== AGENT_SECRET && !existing?.secret) {
          console.warn('[central] secret mismatch (expected env) for new agent', msg.agentId);
          socket.close();
          return;
        }
        agentId = msg.agentId;
        agents.set(agentId, { socket, lastHeartbeat: Date.now() });
        saveMeta(agentId, msg.secret, msg.relays || null);
        console.log('[central] agent connected', agentId);
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
      agents.delete(agentId);
      console.log('[central] agent disconnected', agentId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[central] HTTP+WS listening on ${PORT}`);
  console.log(`[central] WS endpoint ws://localhost:${PORT}/agent`);
});
