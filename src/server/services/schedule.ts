import * as crypto from 'crypto';
import { WebSocket } from 'ws';
import { listSchedules, listGroupsForMembership, getAgent, upsertAgent } from '../db';

// Agent sockets - will be injected from WebSocket manager
let agentSockets: Map<string, { socket: WebSocket; lastHeartbeat: number }>;
let normalizeGroupTimesFn: (group: any) => any;

export const initScheduleService = (
  sockets: Map<string, { socket: WebSocket; lastHeartbeat: number }>,
  normalizeGroupTimes: (group: any) => any
) => {
  agentSockets = sockets;
  normalizeGroupTimesFn = normalizeGroupTimes;
};

/**
 * Build schedule payload for an agent
 * Merges explicit schedules + schedules derived from groups
 */
export const buildSchedulePayload = (agentId: string): any[] => {
  // Get explicit schedules for this agent
  const explicit = listSchedules(agentId).map(s => ({
    relayId: s.relayId,
    entries: [{ days: s.days, from: s.from, to: s.to }]
  }));

  // Get group-based schedules
  const groupBased = listGroupsForMembership(agentId)
    .map(normalizeGroupTimesFn)
    .filter(g => g.active && g.onTime && g.offTime)
    .flatMap(g => {
      const entry = (g.entries || []).find((e: any) => e.agentId === agentId);
      const relays = entry?.relayIds || [];
      const days = g.days && g.days.length ? g.days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      return relays.map((rid: number) => ({
        relayId: rid,
        entries: [{ days, from: g.onTime!, to: g.offTime! }]
      }));
    });

  return [...explicit, ...groupBased];
};

/**
 * Calculate MD5 hash of schedule payload for versioning
 */
export const hashScheduleVersion = (schedules: any[]): string => {
  return crypto.createHash('md5').update(JSON.stringify(schedules)).digest('hex');
};

/**
 * Push schedules to connected agent via WebSocket
 */
export const pushSchedulesToAgent = (agentId: string): void => {
  const target = agentSockets.get(agentId);
  if (!target || target.socket.readyState !== WebSocket.OPEN) {
    console.warn(`[schedule] Cannot push to ${agentId}: agent not connected`);
    return;
  }

  const schedules = buildSchedulePayload(agentId);
  const version = hashScheduleVersion(schedules);

  // Update agent record with new schedule version
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

  // Debug logging if enabled
  if (process.env.SCHEDULE_DEBUG === '1' || process.env.SCHEDULE_DEBUG === 'true') {
    console.log('[central] pushSchedulesToAgent', agentId, version, JSON.stringify(schedules, null, 2));
  }

  // Send to agent
  target.socket.send(JSON.stringify({
    type: 'update_schedule',
    schedules,
    version
  }));

  console.log(`[schedule] Pushed schedules to ${agentId}, version ${version}`);
};

/**
 * Reconcile schedule version on heartbeat
 * Repushes schedules if versions don't match
 */
export const reconcileScheduleVersion = (
  agentId: string,
  reportedVersion: string | null
): void => {
  const agent = getAgent(agentId);
  const currentVersion = hashScheduleVersion(buildSchedulePayload(agentId));
  const knownVersion = agent?.scheduleVersion;

  // Check if versions match
  const versionMismatch =
    (reportedVersion && currentVersion !== reportedVersion) ||
    (!reportedVersion && knownVersion && knownVersion !== currentVersion);

  if (versionMismatch) {
    console.log('[central] schedule version mismatch, repushing', {
      agentId,
      currentVersion,
      reportedVersion: reportedVersion ?? knownVersion ?? 'n/a'
    });
    pushSchedulesToAgent(agentId);
  }
};
