/**
 * MachineEventCollector - Reliable 24/7 machine status event collection
 *
 * Responsibilities:
 * - Owns WebSocket connection lifecycle with exponential backoff reconnect
 * - Loads baseline status from DB (survives restarts)
 * - Records ALL status transitions with isTransition=1
 * - Periodic snapshots every 5 minutes with isTransition=0
 * - Emits events for SpeedQueenService to consume
 */

import { WebSocket } from 'ws';
import type { LaundryMachine, MachineType } from '../../../types';
import { insertMachineEvent, getLastKnownStatus, type MachineEventRow } from '../db';
import {
  SpeedQueenRestClient,
  SpeedQueenWSClient,
  type MachineMapping,
  type LocationMapping,
  type SQMachineStatus,
  mapSQStatus,
  translateCycleName
} from './speedqueen';

// Configuration constants
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;

// Callback types
export type StatusUpdateCallback = (agentId: string, machines: LaundryMachine[]) => void;

export class MachineEventCollector {
  private restClient: SpeedQueenRestClient;
  private wsClient: SpeedQueenWSClient | null = null;
  private locationIds: string[];
  private machineMappings: MachineMapping[];
  private locationToAgent: Map<string, string>;
  onStatusUpdate: StatusUpdateCallback;

  // Connection state
  private started = false;
  private wsConnecting = false;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;

  // Baseline status tracking (loaded from DB, not in-memory)
  private baselineStatusById = new Map<string, string>();

  constructor(
    restClient: SpeedQueenRestClient,
    locationIds: string[],
    machineMappings: MachineMapping[],
    onStatusUpdate: StatusUpdateCallback
  ) {
    this.restClient = restClient;
    this.locationIds = locationIds;
    this.machineMappings = machineMappings;
    this.onStatusUpdate = onStatusUpdate;

    // Build location → agentId mapping
    this.locationToAgent = new Map();
    for (const mapping of machineMappings) {
      this.locationToAgent.set(mapping.locationId, mapping.agentId);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    console.log('[machine-event-collector] Starting 24/7 event collection');

    // Load baseline status from database for all machines
    await this.loadBaselineFromDB();

    // Start WebSocket connection
    this.connectWs();

    // Start periodic snapshots every 5 minutes
    this.snapshotTimer = setInterval(() => {
      this.takeSnapshot().catch(err => {
        console.error('[machine-event-collector] Snapshot failed:', err);
      });
    }, SNAPSHOT_INTERVAL_MS);

    console.log('[machine-event-collector] Started successfully');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    console.log('[machine-event-collector] Stopping...');

    // Clean up timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }

    // Disconnect WebSocket
    this.disconnectWs();

    console.log('[machine-event-collector] Stopped');
  }

  private async loadBaselineFromDB(): Promise<void> {
    console.log('[machine-event-collector] Loading baseline status from database...');

    for (const mapping of this.machineMappings) {
      const lastStatus = getLastKnownStatus(mapping.speedqueenId);
      if (lastStatus) {
        this.baselineStatusById.set(mapping.speedqueenId, lastStatus);
        console.log(`[machine-event-collector] Loaded baseline: ${mapping.localId} = ${lastStatus}`);
      }
    }

    console.log(`[machine-event-collector] Loaded baseline for ${this.baselineStatusById.size} machines`);
  }

  private async connectWs(): Promise<void> {
    if (this.wsConnecting || !this.started) return;

    this.wsConnecting = true;
    console.log('[machine-event-collector] Connecting WebSocket...');

    // Clean up existing connection
    if (this.wsClient) {
      this.wsClient.destroy();
      this.wsClient = null;
    }

    const wsClient = new SpeedQueenWSClient(
      this.restClient,
      this.locationIds,
      this.machineMappings
    );

    // Handle status updates for cache
    wsClient.onMachineStatus = (agentId, machines) => {
      this.onStatusUpdate(agentId, machines);
    };

    // Handle raw status for event logging
    wsClient.onMachineStatusRaw = (agentId, machineId, statusData, mapping) => {
      this.handleStatusChange(mapping, statusData, 'ws_push');
    };

    wsClient.onMachineError = (agentId, error) => {
      console.log(`[machine-event-collector] Error for ${agentId}: ${error.name} (code=${error.code})`);
    };

    wsClient.onMachineEvent = (agentId, event) => {
      console.log(`[machine-event-collector] Event for ${agentId}:`, JSON.stringify(event).slice(0, 200));
    };

    try {
      await wsClient.connect();

      if (this.wsConnecting && this.started) {
        this.wsClient = wsClient;
        this.wsConnecting = false;
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS; // Reset delay on successful connect
        console.log('[machine-event-collector] WebSocket connected successfully');
      } else {
        // Connection was cancelled or service stopped
        wsClient.destroy();
      }
    } catch (err) {
      console.error('[machine-event-collector] WebSocket connection failed:', err);
      this.wsConnecting = false;
      this.scheduleReconnect();
    }
  }

  private disconnectWs(): void {
    if (this.wsClient) {
      console.log('[machine-event-collector] Disconnecting WebSocket');
      this.wsClient.destroy();
      this.wsClient = null;
    }
    this.wsConnecting = false;
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;

    console.log(`[machine-event-collector] Scheduling reconnect in ${this.reconnectDelay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, this.reconnectDelay);

    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * RECONNECT_BACKOFF_FACTOR,
      MAX_RECONNECT_DELAY_MS
    );
  }

  private handleStatusChange(
    mapping: MachineMapping,
    statusData: SQMachineStatus,
    source: 'ws_push' | 'rest_snapshot'
  ): void {
    const currentStatusId = (statusData.statusId || 'UNKNOWN').toUpperCase();
    const prevStatusId = this.baselineStatusById.get(mapping.speedqueenId);

    console.log(`[machine-event-collector] ${source}: ${mapping.localId} ${currentStatusId} (prev: ${prevStatusId || "unknown"})`);

    // For WebSocket pushes, only log transitions (isTransition=1)
    if (source === 'ws_push') {
      if (prevStatusId === undefined) {
        // First WS push for this machine — establish baseline from DB, don't log
        this.baselineStatusById.set(mapping.speedqueenId, currentStatusId);
      } else if (prevStatusId !== currentStatusId) {
        // Status transition detected — log with isTransition=1
        this.logMachineEvent(mapping, currentStatusId, prevStatusId, statusData, source, 1);
        this.baselineStatusById.set(mapping.speedqueenId, currentStatusId);
      }
    } else {
      // For REST snapshots, always log current status with isTransition=0
      this.logMachineEvent(mapping, currentStatusId, prevStatusId, statusData, source, 0);
      this.baselineStatusById.set(mapping.speedqueenId, currentStatusId);
    }
  }

  private async takeSnapshot(): Promise<void> {
    if (!this.started) return;

    console.log('[machine-event-collector] Taking periodic snapshot...');

    for (const locationId of this.locationIds) {
      try {
        await this.snapshotLocation(locationId);
      } catch (err) {
        console.error(`[machine-event-collector] Snapshot failed for location ${locationId}:`, err);
      }
    }

    console.log('[machine-event-collector] Snapshot completed');
  }

  private async snapshotLocation(locationId: string): Promise<void> {
    const agentId = this.locationToAgent.get(locationId);
    if (!agentId) return;

    const sqMachines = await this.restClient.getMachines(locationId);
    const machines: LaundryMachine[] = [];

    for (const sqm of sqMachines) {
      const mapping = this.machineMappings.find(m => m.speedqueenId === sqm.id);
      if (!mapping) {
        console.log(`[machine-event-collector] Unknown machine ${sqm.id} in location ${locationId}`);
        continue;
      }

      const status = sqm.status || sqm as unknown as SQMachineStatus;

      // Handle status change for event logging (snapshot)
      this.handleStatusChange(mapping, status, 'rest_snapshot');

      // Build machine object for cache update
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
        selectedCycle: status.selectedCycle
          ? { ...status.selectedCycle, name: translateCycleName(status.selectedCycle.name) }
          : null,
        selectedModifier: status.selectedModifier || null,
        model: mapping.model,
      };
      machines.push(machine);
    }

    if (machines.length > 0) {
      this.onStatusUpdate(agentId, machines);
      console.log(`[machine-event-collector] Snapshot ${locationId} (${agentId}): ${machines.map(m => `${m.id}=${m.status}`).join(', ')}`);
    }
  }

  private logMachineEvent(
    mapping: MachineMapping,
    statusId: string,
    previousStatusId: string | null,
    status: SQMachineStatus,
    source: 'ws_push' | 'rest_snapshot',
    isTransition: number
  ): void {
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
      cycleName: status.selectedCycle?.name ? translateCycleName(status.selectedCycle.name) : null,
      linkQuality: null,
      receivedAt: status.timestamp ? new Date(status.timestamp).toISOString() : null,
      source,
      initiator: null, // Event collector doesn't track command initiation
      initiatorUser: null,
      commandType: null,
      isTransition,
    };

    try {
      insertMachineEvent(event);
      console.log(`[machine-event-collector] Logged event: ${mapping.localId} ${statusId} (isTransition=${isTransition})`);
    } catch (err) {
      console.error('[machine-event-collector] Failed to log machine event:', err);
    }
  }

  // Status accessors for other services
  isConnected(): boolean {
    return this.wsClient !== null && this.wsClient.isConnected();
  }

  getBaselineStatus(machineId: string): string | null {
    return this.baselineStatusById.get(machineId) ?? null;
  }

  // Accessors for SpeedQueenService integration
  getRestClient(): SpeedQueenRestClient {
    return this.restClient;
  }

  getLocationIds(): string[] {
    return [...this.locationIds];
  }

  getMachineMappings(): MachineMapping[] {
    return [...this.machineMappings];
  }
}