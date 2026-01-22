import { WebSocket } from 'ws';
import { getAgent, upsertAgent, upsertCommand, updateCommandsForRelay } from '../db';
import { v4 as uuidv4 } from 'uuid';

// Relay state cache for tracking changes
const relayStateCache: Map<string, Map<number, string>> = new Map();

// Agent sockets - will be injected from WebSocket manager
let agentSockets: Map<string, { socket: WebSocket; lastHeartbeat: number }>;

export const initRelayService = (sockets: Map<string, { socket: WebSocket; lastHeartbeat: number }>) => {
  agentSockets = sockets;
};

/**
 * Create a unique key for desired state tracking
 */
const desiredStateKey = (agentId: string, relayId: number): string => {
  return `${agentId}::${relayId}`;
};

/**
 * Update the desired state for a relay in the database
 */
export const updateDesiredState = (agentId: string, relayId: number, desired: 'on' | 'off'): void => {
  const agent = getAgent(agentId);
  const desiredMap = new Map<string, 'on' | 'off'>();

  // Load existing desired states
  if (agent?.desiredState) {
    Object.entries(agent.desiredState).forEach(([k, v]) => {
      if (v === 'on' || v === 'off') {
        desiredMap.set(k, v);
      }
    });
  }

  // Update the specific relay
  desiredMap.set(desiredStateKey(agentId, relayId), desired);

  // Save back to database
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

/**
 * Send all desired state commands to an agent when it connects
 */
export const reconcileOnConnect = (agentId: string): void => {
  const agent = getAgent(agentId);
  if (!agent?.desiredState || !agentSockets.has(agentId)) return;

  const target = agentSockets.get(agentId);
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

/**
 * Reconcile desired vs reported state on heartbeat
 * Resends commands if relay state doesn't match desired state
 */
export const reconcileOnHeartbeat = (agentId: string, reportedRelays: any[]): void => {
  const agent = getAgent(agentId);
  if (!agent) return;

  // Build desired state map
  const desiredMap = new Map<string, 'on' | 'off'>();
  if (agent.desiredState) {
    Object.entries(agent.desiredState).forEach(([k, v]) => {
      if (v === 'on' || v === 'off') {
        desiredMap.set(k, v);
      }
    });
  }

  // Build reported state map
  const reportedMap = new Map<number, string>();
  reportedRelays.forEach((r: any) => {
    if (r && typeof r.id === 'number' && (r.state === 'on' || r.state === 'off')) {
      reportedMap.set(r.id, r.state);
    }
  });

  const target = agentSockets.get(agentId);
  const socketReady = target?.socket.readyState === WebSocket.OPEN;

  // Check each desired state and reconcile
  desiredMap.forEach((desired, key) => {
    const [aId, ridStr] = key.split('::');
    if (aId !== agentId) return;

    const rid = Number(ridStr);
    if (!Number.isFinite(rid)) return;

    const reported = reportedMap.get(rid);

    if (reported === desired) {
      // State matches, acknowledge any pending commands
      updateCommandsForRelay(agentId, rid, 'acked');
      desiredMap.delete(key);
    } else if (socketReady) {
      // State doesn't match, resend command
      target!.socket.send(JSON.stringify({ type: 'set_relay', relayId: rid, state: desired }));
      const cmdId = uuidv4();
      upsertCommand({
        id: cmdId,
        agentId,
        relayId: rid,
        desiredState: desired,
        status: 'sent',
        createdAt: Date.now(),
        expiresAt: Date.now() + 30_000,
      });
    }
  });
};

/**
 * Track relay state changes and log them
 */
export const trackRelayStateChanges = (agentId: string, relays: any[]): void => {
  const prevStates = relayStateCache.get(agentId) || new Map<number, string>();
  const nextStates = new Map<number, string>();
  const isFirst = prevStates.size === 0;

  relays.forEach((r: any) => {
    const prev = prevStates.get(r.id);
    nextStates.set(r.id, r.state);

    // Log state changes (or first time seeing this relay)
    if (isFirst || prev !== r.state) {
      console.log(`  relay ${r.id} (${agentId}): ${r.state}`);
    }
  });

  relayStateCache.set(agentId, nextStates);
};

/**
 * Clear relay state cache for an agent (when disconnected)
 */
export const clearRelayStateCache = (agentId: string): void => {
  relayStateCache.delete(agentId);
};

/**
 * Send relay command to agent and track it
 */
export const sendRelayCommand = (
  agentId: string,
  relayId: number,
  state: 'on' | 'off',
  updateDesired: boolean = true
): { cmdId: string; sent: boolean } => {
  const target = agentSockets.get(agentId);
  const sent = target?.socket.readyState === WebSocket.OPEN;

  if (sent) {
    target!.socket.send(JSON.stringify({ type: 'set_relay', relayId, state }));
  }

  if (updateDesired) {
    updateDesiredState(agentId, relayId, state);
  }

  const cmdId = uuidv4();
  upsertCommand({
    id: cmdId,
    agentId,
    relayId,
    desiredState: state,
    status: sent ? 'sent' : 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 30_000,
  });

  return { cmdId, sent };
};
