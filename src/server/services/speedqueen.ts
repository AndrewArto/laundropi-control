/**
 * Speed Queen Insights API Client
 *
 * REST client for locations, machines, cycles, commands (x-api-key auth)
 * WebSocket real-time client using Centrifuge protocol (vanilla WebSocket)
 */
import { WebSocket } from 'ws';
import type {
  MachineType,
  MachineStatus,
  LaundryMachine,
  SpeedQueenMachineCycle,
  SpeedQueenCommandType,
} from '../../../types';
import { insertMachineEvent, type MachineEventRow } from '../db';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = 'https://api.alliancelaundrydigital.com';
const WS_URL = 'wss://realtime.alliancelaundrydigital.com/connection/websocket';
const RATE_LIMIT_MS = 110; // ~10 req/s max
const FETCH_TIMEOUT_MS = 15_000; // 15 s per request
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

// ---------------------------------------------------------------------------
// Location → agentId mapping (Speed Queen loc_id → our internal agentId)
// ---------------------------------------------------------------------------
export interface LocationMapping {
  locationId: string;
  agentId: string;
}

// Machine mapping: Speed Queen machine ID → our internal identifiers
export interface MachineMapping {
  speedqueenId: string;       // mac_xxx
  localId: string;            // w1, d5, etc.
  label: string;              // "Washer 1", "Dryer 5"
  type: MachineType;
  model: string;
  locationId: string;
  agentId: string;
}

// ---------------------------------------------------------------------------
// Speed Queen API response types
// ---------------------------------------------------------------------------
interface SQLocation {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface SQMachineStatus {
  id: string;
  statusId: string;
  remainingSeconds?: number;
  remainingVend?: number;
  isDoorOpen?: boolean;
  timestamp?: number;
  location?: { id: string };
  machine?: { id: string };
  selectedCycle?: { id: string; name: string } | null;
  selectedModifier?: { id: string; name: string } | null;
}

interface SQMachine {
  id: string;
  name?: string;
  machineType?: string;
  model?: string;
  nodeNumber?: number;
  status?: SQMachineStatus;
  [key: string]: unknown;
}

interface SQCycle {
  id: string;
  name: string;
  vendPrice?: number;
  duration?: number;
  [key: string]: unknown;
}

interface SQError {
  id: string;
  name: string;
  type: string;
  code: number;
  machine: { id: string };
  location: { id: string };
  timestamp: string;
}

interface SQCommandResponse {
  id: string;
  status?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Hardcoded machine mappings from API reference
// ---------------------------------------------------------------------------
const BRANDOA1_MACHINES: Omit<MachineMapping, 'agentId'>[] = [
  { speedqueenId: 'mac_1096b5', localId: 'w1', label: 'Washer 1', type: 'washer', model: 'SY80U', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_4a38fe', localId: 'w2', label: 'Washer 2', type: 'washer', model: 'SY105U', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_f6789c', localId: 'w3', label: 'Washer 3', type: 'washer', model: 'SY135U', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_cc70a4', localId: 'w4', label: 'Washer 4', type: 'washer', model: 'SY180U', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_85ee99', localId: 'd5', label: 'Dryer 5', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_7b916e', localId: 'd6', label: 'Dryer 6', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_8390f6', localId: 'd7', label: 'Dryer 7', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
  { speedqueenId: 'mac_491704', localId: 'd8', label: 'Dryer 8', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
];

const BRANDOA2_MACHINES: Omit<MachineMapping, 'agentId'>[] = [
  { speedqueenId: 'mac_7ac4e0', localId: 'd1', label: 'Dryer 1', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_6b81fe', localId: 'd2', label: 'Dryer 2', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_210c84', localId: 'd3', label: 'Dryer 3', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_ba39d8', localId: 'd4', label: 'Dryer 4', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_8a4fec', localId: 'd5', label: 'Dryer 5', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_24f325', localId: 'd6', label: 'Dryer 6', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_e1f20d', localId: 'w7', label: 'Washer 7', type: 'washer', model: 'SY80U', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_d3e083', localId: 'w8', label: 'Washer 8', type: 'washer', model: 'SY105U', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_917060', localId: 'w9', label: 'Washer 9', type: 'washer', model: 'SY135U', locationId: 'loc_7b105b' },
  { speedqueenId: 'mac_8f4a36', localId: 'w10', label: 'Washer 10', type: 'washer', model: 'SY180U', locationId: 'loc_7b105b' },
];

// Map location IDs to agent IDs
const LOCATION_TO_AGENT: Record<string, string> = {
  loc_d23f6c: 'Brandoa1',
  loc_7b105b: 'Brandoa2',
};

// ---------------------------------------------------------------------------
// Status mapping: Speed Queen → our internal
// ---------------------------------------------------------------------------
function mapSQStatus(sqStatus: string): MachineStatus {
  const s = (sqStatus || '').toUpperCase();
  switch (s) {
    case 'AVAILABLE': return 'idle';
    case 'IN_USE': return 'running';
    case 'END_OF_CYCLE': return 'idle';
    case 'DIAGNOSTIC': return 'out_of_order';
    case 'OUT_OF_ORDER': return 'out_of_order';
    case 'ERROR': return 'error';
    default: return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------
let lastRequestTime = 0;
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const diff = now - lastRequestTime;
  if (diff < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - diff));
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// REST Client
// ---------------------------------------------------------------------------
export class SpeedQueenRestClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      await rateLimit();

      const url = `${API_BASE}${path}`;
      const headers: Record<string, string> = {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const options: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) {
        options.body = JSON.stringify(body);
      }

      try {
        const res = await fetch(url, options);
        clearTimeout(timeoutId);

        if (!res.ok) {
          // Log only status and path — never raw vendor response body (may contain sensitive data)
          console.error(`[speedqueen-rest] ${method} ${path} failed: ${res.status}`);

          // Don't retry 4xx client errors
          if (res.status >= 400 && res.status < 500) {
            throw new Error(`Speed Queen API request failed: ${res.status}`);
          }

          lastError = new Error(`Speed Queen API request failed: ${res.status}`);
          continue; // retry on 5xx
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return res.json() as Promise<T>;
        }
        return {} as T;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          lastError = new Error(`Speed Queen API request timed out: ${method} ${path}`);
          continue;
        }
        // Re-throw non-retryable errors (4xx mapped above)
        if (err.message?.includes('Speed Queen API request failed: 4')) {
          throw err;
        }
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error(`Speed Queen API request failed after ${MAX_RETRIES + 1} attempts`);
  }

  /**
   * Unwrap paginated API responses.
   * Speed Queen API may return `{ data: [...], meta: {...} }` instead of a raw array.
   */
  private async requestList<T>(method: string, path: string): Promise<T[]> {
    const result = await this.request<T[] | { data: T[]; meta?: unknown }>(method, path);
    if (Array.isArray(result)) {
      return result;
    }
    if (result && typeof result === 'object' && 'data' in result && Array.isArray(result.data)) {
      return result.data;
    }
    return [];
  }

  // Locations
  async getLocations(): Promise<SQLocation[]> {
    return this.requestList<SQLocation>('GET', '/v1/locations');
  }

  async getLocation(locationId: string): Promise<SQLocation> {
    return this.request<SQLocation>('GET', `/v1/locations/${locationId}`);
  }

  // Machines
  async getMachines(locationId: string): Promise<SQMachine[]> {
    return this.requestList<SQMachine>('GET', `/v1/locations/${locationId}/machines`);
  }

  async getMachine(locationId: string, machineId: string): Promise<SQMachine> {
    return this.request<SQMachine>('GET', `/v1/locations/${locationId}/machines/${machineId}`);
  }

  // Cycles
  async getMachineCycles(locationId: string, machineId: string): Promise<SQCycle[]> {
    return this.requestList<SQCycle>('GET', `/v1/locations/${locationId}/machines/${machineId}/cycles`);
  }

  // Commands
  async sendCommand(locationId: string, machineId: string, command: Record<string, unknown>): Promise<SQCommandResponse> {
    return this.request<SQCommandResponse>('POST', `/v1/locations/${locationId}/machines/${machineId}/commands`, command);
  }

  async getCommandStatus(locationId: string, machineId: string, commandId: string): Promise<SQCommandResponse> {
    return this.request<SQCommandResponse>('GET', `/v1/locations/${locationId}/machines/${machineId}/commands/${commandId}`);
  }

  // Errors
  async getMachineErrors(locationId: string, machineId: string): Promise<SQError[]> {
    return this.requestList<SQError>('GET', `/v1/locations/${locationId}/machines/${machineId}/errors`);
  }

  // Realtime auth
  async getRealtimeToken(): Promise<string> {
    await rateLimit();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(`${API_BASE}/v1/realtime/auth`, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Speed Queen realtime auth failed: ${res.status}`);
    }

    const data = await res.json() as { token?: string };
    if (!data.token) {
      throw new Error('Speed Queen realtime auth: no token in response');
    }
    return data.token;
  }
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------
// Allowed parameter keys per command type (reject unknown keys)
const COMMAND_PARAM_SCHEMAS: Record<SpeedQueenCommandType, string[]> = {
  remote_start: ['cycleId'],
  remote_stop: [],
  remote_vend: ['amount'],
  select_cycle: ['cycleId'],
  start_dryer_with_time: ['minutes'],
  clear_error: [],
  set_out_of_order: ['outOfOrder'],
  rapid_advance: [],
  clear_partial_vend: [],
};

/**
 * Validate and sanitize command params: reject unknown keys and strip `type`.
 */
function sanitizeCommandParams(
  commandType: SpeedQueenCommandType,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  if (!params || Object.keys(params).length === 0) return {};

  const allowedKeys = COMMAND_PARAM_SCHEMAS[commandType];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key === 'type') continue; // never allow caller to set 'type'
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unknown parameter '${key}' for command '${commandType}'`);
    }
    sanitized[key] = value;
  }

  return sanitized;
}

export function buildCommand(commandType: SpeedQueenCommandType, params?: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeCommandParams(commandType, params);

  const TYPE_MAP: Record<SpeedQueenCommandType, string> = {
    remote_start: 'MachineRemoteStartCommandRequest',
    remote_stop: 'MachineRemoteStopCommandRequest',
    remote_vend: 'MachineRemoteVendCommandRequest',
    select_cycle: 'MachineSelectMachineCycleCommandRequest',
    start_dryer_with_time: 'MachineStartDryerWithTimeCommandRequest',
    clear_error: 'MachineClearErrorCommandRequest',
    set_out_of_order: 'MachineProgramOutOfOrderCommandRequest',
    rapid_advance: 'MachineRapidAdvanceToNextStepCommandRequest',
    clear_partial_vend: 'MachineClearPartialVendCommandRequest',
  };

  const requestType = TYPE_MAP[commandType];
  if (!requestType) {
    throw new Error(`Unknown command type: ${commandType}`);
  }

  // Spread sanitized params first, then override type to prevent bypass
  return { ...sanitized, type: requestType };
}

// ---------------------------------------------------------------------------
// WebSocket Client (Centrifuge protocol over vanilla WebSocket)
// ---------------------------------------------------------------------------
export type MachineStatusCallback = (agentId: string, machines: LaundryMachine[]) => void;
export type MachineStatusRawCallback = (agentId: string, machineId: string, statusData: SQMachineStatus, mapping: MachineMapping) => void;
export type MachineErrorCallback = (agentId: string, error: SQError) => void;
export type MachineEventCallback = (agentId: string, event: Record<string, unknown>) => void;

interface WSMessage {
  id?: number;
  connect?: { token: string; name?: string };
  subscribe?: { channel: string };
  result?: unknown;
  push?: {
    channel?: string;
    pub?: { data?: unknown };
  };
  error?: { code: number; message: string };
}

export class SpeedQueenWSClient {
  private restClient: SpeedQueenRestClient;
  private locationIds: string[];
  private machineMappings: MachineMapping[];
  private ws: WebSocket | null = null;
  private token: string = '';
  private messageId = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private destroyed = false;
  private subscribedChannels = new Set<string>();

  // Callbacks
  onMachineStatus: MachineStatusCallback | null = null;
  onMachineStatusRaw: MachineStatusRawCallback | null = null;
  onMachineError: MachineErrorCallback | null = null;
  onMachineEvent: MachineEventCallback | null = null;

  // Lookup maps
  private sqIdToMapping: Map<string, MachineMapping>;
  private locationToAgent: Map<string, string>;

  constructor(restClient: SpeedQueenRestClient, locationIds: string[], machineMappings: MachineMapping[]) {
    this.restClient = restClient;
    this.locationIds = locationIds;
    this.machineMappings = machineMappings;

    this.sqIdToMapping = new Map();
    for (const m of machineMappings) {
      this.sqIdToMapping.set(m.speedqueenId, m);
    }

    // Build locationToAgent from actual machineMappings (respects custom loc:agent pairs)
    this.locationToAgent = new Map();
    for (const m of machineMappings) {
      this.locationToAgent.set(m.locationId, m.agentId);
    }
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    try {
      this.token = await this.restClient.getRealtimeToken();
      console.log('[speedqueen-ws] Got realtime token');
    } catch (err) {
      console.error('[speedqueen-ws] Failed to get realtime token:', err);
      this.scheduleReconnect();
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error('[speedqueen-ws] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      console.log('[speedqueen-ws] Connected, sending auth...');
      this.reconnectDelay = 1000;
      this.subscribedChannels.clear();
      this.sendMessage({
        connect: { token: this.token, name: 'laundropi-control' },
      });
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage;
        this.handleMessage(msg);
      } catch (err) {
        console.error('[speedqueen-ws] Failed to parse message:', err);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[speedqueen-ws] Disconnected: ${code} ${reason?.toString() || ''}`);
      this.ws = null;
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('[speedqueen-ws] Error:', err.message);
    });
  }

  private sendMessage(msg: Partial<WSMessage>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.messageId++;
    const payload = { id: this.messageId, ...msg };
    this.ws.send(JSON.stringify(payload));
  }

  /** Respond to Centrifuge server ping with pong (empty JSON object). */
  private sendPong(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send('{}');
  }

  private handleMessage(msg: WSMessage): void {
    // Centrifuge ping frame: empty object {} — respond with pong {}
    if (!msg.id && !msg.result && !msg.push && !msg.error && !msg.connect && !msg.subscribe) {
      this.sendPong();
      return;
    }

    // Connection response → subscribe to channels
    if (msg.result !== undefined && !msg.push) {
      console.log('[speedqueen-ws] Connected successfully');
      this.subscribeToChannels();
      return;
    }

    // Error response
    if (msg.error) {
      console.error(`[speedqueen-ws] Error: ${msg.error.code} ${msg.error.message}`);
      if (msg.error.code === 109) {
        // Token expired, reconnect with new token
        console.log('[speedqueen-ws] Token expired, refreshing...');
        this.close();
        this.connect();
      }
      return;
    }

    // Push message (real-time data)
    if (msg.push?.pub?.data) {
      const channel = msg.push.channel || '';
      const data = msg.push.pub.data as Record<string, unknown>;
      this.handlePush(channel, data);
    }
  }

  private subscribeToChannels(): void {
    for (const locId of this.locationIds) {
      const channels = [
        `machine.status:location:${locId}`,
        `machine.error:location:${locId}`,
        `machine.event:location:${locId}`,
      ];
      for (const channel of channels) {
        if (!this.subscribedChannels.has(channel)) {
          this.sendMessage({ subscribe: { channel } });
          this.subscribedChannels.add(channel);
        }
      }
    }
    console.log(`[speedqueen-ws] Subscribed to ${this.subscribedChannels.size} channels`);
  }

  private handlePush(channel: string, data: Record<string, unknown>): void {
    if (channel.startsWith('machine.status:')) {
      this.handleStatusPush(data);
    } else if (channel.startsWith('machine.error:')) {
      this.handleErrorPush(data);
    } else if (channel.startsWith('machine.event:')) {
      this.handleEventPush(channel, data);
    }
  }

  private handleStatusPush(data: Record<string, unknown>): void {
    // data might be a single machine status or contain nested machine status
    const machineId = (data.machine as { id?: string })?.id ||
                      (data.id as string) || '';
    const mapping = this.sqIdToMapping.get(machineId);
    if (!mapping) {
      console.log(`[speedqueen-ws] Unknown machine in status push: ${machineId}`);
      return;
    }

    const statusData = data as unknown as SQMachineStatus;
    const machine = this.mapSQStatusToLaundryMachine(statusData, mapping);
    if (this.onMachineStatus) {
      this.onMachineStatus(mapping.agentId, [machine]);
    }
    if (this.onMachineStatusRaw) {
      this.onMachineStatusRaw(mapping.agentId, machineId, statusData, mapping);
    }
  }

  private handleErrorPush(data: Record<string, unknown>): void {
    const error = data as unknown as SQError;
    const machineId = error.machine?.id || '';
    const mapping = this.sqIdToMapping.get(machineId);
    const agentId = mapping?.agentId ||
                    this.locationToAgent.get(error.location?.id || '') || '';
    if (agentId && this.onMachineError) {
      this.onMachineError(agentId, error);
    }
  }

  private handleEventPush(channel: string, data: Record<string, unknown>): void {
    // Extract location from channel
    const locMatch = channel.match(/:location:(.+)$/);
    const locId = locMatch?.[1] || '';
    const agentId = this.locationToAgent.get(locId) || '';
    if (agentId && this.onMachineEvent) {
      this.onMachineEvent(agentId, data);
    }
  }

  mapSQStatusToLaundryMachine(sq: SQMachineStatus, mapping: MachineMapping): LaundryMachine {
    return {
      id: mapping.localId,
      label: mapping.label,
      type: mapping.type,
      status: mapSQStatus(sq.statusId),
      lastUpdated: Date.now(),
      source: 'speedqueen',
      speedqueenId: mapping.speedqueenId,
      remainingSeconds: sq.remainingSeconds ?? 0,
      remainingVend: sq.remainingVend ?? 0,
      isDoorOpen: sq.isDoorOpen ?? false,
      selectedCycle: sq.selectedCycle || null,
      selectedModifier: sq.selectedModifier || null,
      model: mapping.model,
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    console.log(`[speedqueen-ws] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  close(): void {
    if (this.ws) {
      try { this.ws.close(); } catch (_) { /* ignore */ }
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.close();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// ---------------------------------------------------------------------------
// SpeedQueenService — orchestrates REST + WS, manages state
//
// Lazy connection: WebSocket connects ONLY when UI clients are actively
// viewing machines.  After 60 s with no UI interest the WS disconnects.
// REST calls happen on-demand only (no automatic polling interval).
// Cache TTL: 30 s — stale data triggers a fresh REST fetch on next request.
// ---------------------------------------------------------------------------
export type StatusUpdateCallback = (agentId: string, machines: LaundryMachine[]) => void;

// Pending command info for initiator tracking
export interface PendingCommandInfo {
  user: string;
  commandType: string;
  timestamp: number;
}

const STATUS_CACHE_TTL_MS = 30_000;   // 30 s
const WS_IDLE_TIMEOUT_MS  = 60_000;   // disconnect WS after 60 s idle
const COMMAND_INITIATOR_WINDOW_MS = 120_000; // 2 min window for command→IN_USE attribution

export class SpeedQueenService {
  private restClient: SpeedQueenRestClient;
  private wsClient: SpeedQueenWSClient | null = null;
  private locationIds: string[];
  private machineMappings: MachineMapping[];
  private locationToAgent: Map<string, string>;
  private onStatusUpdate: StatusUpdateCallback;
  private started = false;

  // Caches
  private machinesByAgent = new Map<string, LaundryMachine[]>();
  private cyclesByMachine = new Map<string, SpeedQueenMachineCycle[]>();

  // Cache timestamps for TTL
  private lastPollByAgent = new Map<string, number>();

  // In-flight poll deduplication
  private pollInFlight = new Map<string, Promise<void>>();

  // Lazy WebSocket bookkeeping
  private lastUiActivity = 0;
  private wsIdleTimer: ReturnType<typeof setInterval> | null = null;
  private wsConnecting = false;

  // Event logging: track previous statusId per machine (keyed by speedqueenId)
  private previousStatusById = new Map<string, string>();

  // Pending commands for initiator tracking (keyed by speedqueenId)
  private pendingCommands = new Map<string, PendingCommandInfo>();

  constructor(
    apiKey: string,
    locationConfig: string, // comma-separated "loc_id:agentId" pairs or just loc_ids
    onStatusUpdate: StatusUpdateCallback,
    _pollIntervalMs?: number, // kept for backward compat but unused (lazy WS + on-demand REST)
  ) {
    this.restClient = new SpeedQueenRestClient(apiKey);
    this.onStatusUpdate = onStatusUpdate;

    // Parse location config
    const mappings = parseLocationConfig(locationConfig);
    this.locationIds = mappings.map(m => m.locationId);

    // Build machine mappings from hardcoded data
    this.machineMappings = buildMachineMappings(mappings);

    // Build locationId → agentId from parsed config (supports custom mappings)
    this.locationToAgent = new Map();
    for (const m of this.machineMappings) {
      this.locationToAgent.set(m.locationId, m.agentId);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    console.log(`[speedqueen] Starting service for locations: ${this.locationIds.join(', ')}`);
    console.log('[speedqueen] Connecting WebSocket (always-on for event logging)...');

    // Connect WebSocket immediately for continuous event logging.
    // REST polls run as fallback every POLL_FALLBACK_MS when WS is disconnected.
    this.lastUiActivity = Date.now(); // prevent immediate idle disconnect
    this.ensureWsConnected().catch(err => {
      console.error('[speedqueen] Initial WS connect failed, will retry via fallback poll:', err);
    });

    // Fallback: poll REST every 60s if WS is not connected
    this.wsIdleTimer = setInterval(() => this.fallbackPollIfNeeded(), 60_000);
  }

  stop(): void {
    this.started = false;
    this.disconnectWs();
    if (this.wsIdleTimer) {
      clearInterval(this.wsIdleTimer);
      this.wsIdleTimer = null;
    }
    console.log('[speedqueen] Service stopped');
  }

  // ------------------------------------------------------------------
  // Lazy WebSocket: connect / disconnect based on UI activity
  // ------------------------------------------------------------------

  /** Call this whenever a UI client requests machine data. */
  notifyUiActivity(): void {
    this.lastUiActivity = Date.now();
    this.ensureWsConnected();
  }

  private async ensureWsConnected(): Promise<void> {
    if (this.wsClient?.isConnected() || this.wsConnecting || !this.started) return;

    this.wsConnecting = true;
    console.log('[speedqueen] UI activity detected — connecting WebSocket…');

    // Destroy any stale WS client before creating a new one (prevents leaks)
    if (this.wsClient) {
      this.wsClient.destroy();
      this.wsClient = null;
    }

    const wsClient = new SpeedQueenWSClient(
      this.restClient,
      this.locationIds,
      this.machineMappings,
    );

    wsClient.onMachineStatus = (agentId, updatedMachines) => {
      this.mergeStatus(agentId, updatedMachines);
    };

    wsClient.onMachineStatusRaw = (_agentId, _machineId, statusData, mapping) => {
      const currentStatusId = (statusData.statusId || 'UNKNOWN').toUpperCase();
      const prevStatusId = this.previousStatusById.get(mapping.speedqueenId);
      if (prevStatusId !== currentStatusId) {
        this.logMachineEvent(mapping, currentStatusId, prevStatusId || null, statusData, 'ws_push');
        this.previousStatusById.set(mapping.speedqueenId, currentStatusId);
      }
    };

    wsClient.onMachineError = (agentId, error) => {
      console.log(`[speedqueen] Error for ${agentId}: ${error.name} (code=${error.code})`);
      const mapping = this.machineMappings.find(m => m.speedqueenId === error.machine?.id);
      if (mapping) {
        const errorMachine: LaundryMachine = {
          id: mapping.localId,
          label: mapping.label,
          type: mapping.type,
          status: 'error',
          lastUpdated: Date.now(),
          source: 'speedqueen',
          speedqueenId: mapping.speedqueenId,
          errorCode: error.code,
          errorName: error.name,
          errorType: error.type,
          model: mapping.model,
        };
        this.mergeStatus(agentId, [errorMachine]);
      }
    };

    wsClient.onMachineEvent = (agentId, event) => {
      console.log(`[speedqueen] Event for ${agentId}:`, JSON.stringify(event).slice(0, 200));
    };

    try {
      await wsClient.connect();
    } catch (err) {
      console.error('[speedqueen] Failed to connect WebSocket:', err);
    }

    // Only assign if we're still the active connection attempt
    // (another call may have run disconnectWs() while we were awaiting)
    if (this.wsConnecting) {
      this.wsClient = wsClient;
      this.wsConnecting = false;
    } else {
      // We were cancelled during the await — clean up
      wsClient.destroy();
      return;
    }

    // Also do an initial REST poll to fill the cache
    this.pollAllLocations().catch(err => {
      console.error('[speedqueen] Initial poll after WS connect failed:', err);
    });
  }

  private disconnectWs(): void {
    if (this.wsClient) {
      console.log('[speedqueen] Disconnecting WebSocket (idle)');
      this.wsClient.destroy();
      this.wsClient = null;
    }
    this.wsConnecting = false;
  }

  private checkWsIdle(): void {
    // Keep WS alive — no idle disconnect (always-on for event logging)
  }

  /** Fallback: if WS is down, poll REST + try to reconnect WS. */
  private async fallbackPollIfNeeded(): Promise<void> {
    if (!this.started) return;

    // If WS is connected, no action needed
    if (this.wsClient?.isConnected()) return;

    // Poll all locations via REST as fallback
    console.log('[speedqueen] WS not connected — fallback REST poll');
    await this.pollAllLocations().catch(err => {
      console.error('[speedqueen] Fallback poll failed:', err);
    });

    // Try to reconnect WS
    this.lastUiActivity = Date.now();
    this.ensureWsConnected().catch(() => {});
  }

  // ------------------------------------------------------------------
  // On-demand REST polling with cache TTL
  // ------------------------------------------------------------------

  /** Returns cached machines, refreshing via REST if cache is stale. */
  async getMachinesOnDemand(agentId: string): Promise<LaundryMachine[]> {
    const now = Date.now();
    const lastPoll = this.lastPollByAgent.get(agentId) || 0;
    const cached = this.machinesByAgent.get(agentId);

    if (cached && (now - lastPoll) < STATUS_CACHE_TTL_MS) {
      return cached;
    }

    // Stale or missing — poll this agent's location (with in-flight deduplication)
    const locationId = this.getLocationIdForAgent(agentId);
    if (locationId) {
      // If a poll is already in-flight for this location, join it instead of creating another
      let inflight = this.pollInFlight.get(locationId);
      if (!inflight) {
        inflight = this.pollLocation(locationId).finally(() => {
          this.pollInFlight.delete(locationId);
        });
        this.pollInFlight.set(locationId, inflight);
      }

      try {
        await inflight;
      } catch (err) {
        console.error(`[speedqueen] On-demand poll failed for ${agentId}:`, err);
      }
    }

    return this.machinesByAgent.get(agentId) || [];
  }

  // Manual poll (used on-demand and as WS fallback)
  async pollAllLocations(): Promise<void> {
    for (const locId of this.locationIds) {
      try {
        await this.pollLocation(locId);
      } catch (err) {
        console.error(`[speedqueen] Failed to poll location ${locId}:`, err);
      }
    }
  }

  private async pollLocation(locationId: string): Promise<void> {
    const agentId = this.locationToAgent.get(locationId);
    if (!agentId) return;

    const sqMachines = await this.restClient.getMachines(locationId);
    const machines: LaundryMachine[] = [];

    for (const sqm of sqMachines) {
      const mapping = this.machineMappings.find(m => m.speedqueenId === sqm.id);
      if (!mapping) {
        console.log(`[speedqueen] Unknown machine ${sqm.id} in location ${locationId}`);
        continue;
      }

      const status = sqm.status || sqm as unknown as SQMachineStatus;
      const currentStatusId = (status.statusId || 'UNKNOWN').toUpperCase();
      const machine: LaundryMachine = {
        id: mapping.localId,
        label: mapping.label,
        type: mapping.type,
        status: mapSQStatus(currentStatusId),
        lastUpdated: Date.now(),
        source: 'speedqueen',
        speedqueenId: mapping.speedqueenId,
        remainingSeconds: status.remainingSeconds ?? 0,
        remainingVend: status.remainingVend ?? 0,
        isDoorOpen: status.isDoorOpen ?? false,
        selectedCycle: status.selectedCycle || null,
        selectedModifier: status.selectedModifier || null,
        model: mapping.model,
      };
      machines.push(machine);

      // Log event only when status changes
      const prevStatusId = this.previousStatusById.get(mapping.speedqueenId);
      if (prevStatusId !== currentStatusId) {
        this.logMachineEvent(mapping, currentStatusId, prevStatusId || null, status, 'rest_poll');
        this.previousStatusById.set(mapping.speedqueenId, currentStatusId);
      }
    }

    if (machines.length > 0) {
      this.machinesByAgent.set(agentId, machines);
      this.lastPollByAgent.set(agentId, Date.now());
      this.onStatusUpdate(agentId, machines);
      console.log(`[speedqueen] Polled ${locationId} (${agentId}): ${machines.map(m => `${m.id}=${m.status}`).join(', ')}`);
    }
  }

  private mergeStatus(agentId: string, updatedMachines: LaundryMachine[]): void {
    const current = this.machinesByAgent.get(agentId) || [];
    for (const updated of updatedMachines) {
      const idx = current.findIndex(m => m.id === updated.id);
      if (idx >= 0) {
        current[idx] = updated;
      } else {
        current.push(updated);
      }
    }
    this.machinesByAgent.set(agentId, current);
    this.lastPollByAgent.set(agentId, Date.now());
    this.onStatusUpdate(agentId, current);
  }

  /** Log a machine status change event to the database. */
  private logMachineEvent(
    mapping: MachineMapping,
    statusId: string,
    previousStatusId: string | null,
    status: SQMachineStatus,
    source: 'rest_poll' | 'ws_push',
  ): void {
    // Determine initiator: check if a pending command exists for this machine
    let initiator: string | null = null;
    let initiatorUser: string | null = null;
    let commandType: string | null = null;

    if (statusId === 'IN_USE') {
      const pending = this.pendingCommands.get(mapping.speedqueenId);
      if (pending && (Date.now() - pending.timestamp) < COMMAND_INITIATOR_WINDOW_MS) {
        initiator = 'admin';
        initiatorUser = pending.user;
        commandType = pending.commandType;
        this.pendingCommands.delete(mapping.speedqueenId);
      } else {
        initiator = 'customer';
      }
    }

    const event: MachineEventRow = {
      timestamp: new Date().toISOString(),
      locationId: mapping.locationId,
      locationName: mapping.agentId,
      machineId: mapping.speedqueenId,
      localId: mapping.localId,
      agentId: mapping.agentId,
      machineType: mapping.type,
      statusId,
      previousStatusId,
      remainingSeconds: status.remainingSeconds ?? null,
      remainingVend: status.remainingVend ?? null,
      isDoorOpen: status.isDoorOpen != null ? (status.isDoorOpen ? 1 : 0) : null,
      cycleId: status.selectedCycle?.id ?? null,
      cycleName: status.selectedCycle?.name ?? null,
      linkQuality: null,
      receivedAt: status.timestamp ? new Date(status.timestamp).toISOString() : null,
      source,
      initiator,
      initiatorUser,
      commandType,
    };

    try {
      insertMachineEvent(event);
    } catch (err) {
      console.error('[speedqueen] Failed to log machine event:', err);
    }
  }

  /** Record a pending command for initiator attribution. */
  recordPendingCommand(speedqueenId: string, user: string, commandType: string): void {
    this.pendingCommands.set(speedqueenId, {
      user,
      commandType,
      timestamp: Date.now(),
    });
  }

  /** Expose previous status map for testing. */
  getPreviousStatusMap(): Map<string, string> {
    return this.previousStatusById;
  }

  /** Expose pending commands map for testing. */
  getPendingCommandsMap(): Map<string, PendingCommandInfo> {
    return this.pendingCommands;
  }

  // Get cached machines for an agent (no REST call — use getMachinesOnDemand for fresh data)
  getMachines(agentId: string): LaundryMachine[] {
    return this.machinesByAgent.get(agentId) || [];
  }

  // Get mapping from our machine ID to SQ IDs
  getMachineMapping(agentId: string, localMachineId: string): MachineMapping | undefined {
    return this.machineMappings.find(m => m.agentId === agentId && m.localId === localMachineId);
  }

  getLocationIdForAgent(agentId: string): string | undefined {
    return this.machineMappings.find(m => m.agentId === agentId)?.locationId;
  }

  // Get all machine mappings for an agent
  getMachineMappingsForAgent(agentId: string): MachineMapping[] {
    return this.machineMappings.filter(m => m.agentId === agentId);
  }

  // Command pass-through
  async sendMachineCommand(
    agentId: string,
    localMachineId: string,
    commandType: SpeedQueenCommandType,
    params?: Record<string, unknown>,
  ): Promise<SQCommandResponse> {
    const mapping = this.getMachineMapping(agentId, localMachineId);
    if (!mapping) {
      throw new Error(`No Speed Queen mapping for ${agentId}/${localMachineId}`);
    }

    const command = buildCommand(commandType, params);
    return this.restClient.sendCommand(mapping.locationId, mapping.speedqueenId, command);
  }

  async getCommandStatus(
    agentId: string,
    localMachineId: string,
    commandId: string,
  ): Promise<SQCommandResponse> {
    const mapping = this.getMachineMapping(agentId, localMachineId);
    if (!mapping) {
      throw new Error(`No Speed Queen mapping for ${agentId}/${localMachineId}`);
    }
    return this.restClient.getCommandStatus(mapping.locationId, mapping.speedqueenId, commandId);
  }

  // Fetch cycles for a specific machine (cached after first call)
  async getMachineCycles(agentId: string, localMachineId: string): Promise<SpeedQueenMachineCycle[]> {
    const mapping = this.getMachineMapping(agentId, localMachineId);
    if (!mapping) return [];

    const cacheKey = `${mapping.locationId}:${mapping.speedqueenId}`;
    const cached = this.cyclesByMachine.get(cacheKey);
    if (cached) return cached;

    try {
      const sqCycles = await this.restClient.getMachineCycles(mapping.locationId, mapping.speedqueenId);
      const cycles: SpeedQueenMachineCycle[] = sqCycles.map(c => ({
        id: c.id,
        name: c.name,
        vendPrice: c.vendPrice,
        duration: c.duration,
      }));
      this.cyclesByMachine.set(cacheKey, cycles);
      return cycles;
    } catch (err) {
      console.error(`[speedqueen] Failed to fetch cycles for ${cacheKey}:`, err);
      return [];
    }
  }

  // Expose restClient for direct API calls if needed
  getRestClient(): SpeedQueenRestClient {
    return this.restClient;
  }

  isActive(): boolean {
    return this.started;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseLocationConfig(config: string): LocationMapping[] {
  if (!config || !config.trim()) return [];

  return config.split(',').map(part => {
    const trimmed = part.trim();
    if (!trimmed) return null;

    // Support "loc_id:agentId" or just "loc_id" (use LOCATION_TO_AGENT lookup)
    if (trimmed.includes(':')) {
      const [locationId, agentId] = trimmed.split(':').map(s => s.trim());
      return { locationId, agentId };
    }

    const agentId = LOCATION_TO_AGENT[trimmed];
    if (!agentId) {
      console.warn(`[speedqueen] Unknown location ID: ${trimmed}, skipping`);
      return null;
    }
    return { locationId: trimmed, agentId };
  }).filter(Boolean) as LocationMapping[];
}

function buildMachineMappings(locationMappings: LocationMapping[]): MachineMapping[] {
  const allMachines: MachineMapping[] = [];

  for (const { locationId, agentId } of locationMappings) {
    let machines: Omit<MachineMapping, 'agentId'>[];
    if (locationId === 'loc_d23f6c') {
      machines = BRANDOA1_MACHINES;
    } else if (locationId === 'loc_7b105b') {
      machines = BRANDOA2_MACHINES;
    } else {
      console.warn(`[speedqueen] No machine mappings for location ${locationId}`);
      continue;
    }

    for (const m of machines) {
      allMachines.push({ ...m, agentId });
    }
  }

  return allMachines;
}

// Exported for testing
export {
  mapSQStatus,
  parseLocationConfig,
  buildMachineMappings,
  COMMAND_PARAM_SCHEMAS,
  LOCATION_TO_AGENT,
  BRANDOA1_MACHINES,
  BRANDOA2_MACHINES,
  API_BASE,
  WS_URL,
  STATUS_CACHE_TTL_MS,
  WS_IDLE_TIMEOUT_MS,
};
export type { SQMachine, SQMachineStatus, SQCycle, SQError, SQCommandResponse, SQLocation };
export { COMMAND_INITIATOR_WINDOW_MS };
