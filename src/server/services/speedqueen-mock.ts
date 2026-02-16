/**
 * Mock Speed Queen API for local development.
 *
 * Enable via: SPEEDQUEEN_MOCK=true
 *
 * Simulates:
 *  - REST endpoints (machines, cycles, commands)
 *  - WebSocket-like real-time status pushes
 *  - Realistic status cycling (AVAILABLE → IN_USE → END_OF_CYCLE → AVAILABLE)
 *  - Command responses (start, stop, etc.)
 */

import type {
  MachineType,
  MachineStatus,
  LaundryMachine,
  SpeedQueenMachineCycle,
  SpeedQueenCommandType,
} from '../../../types';
import type {
  MachineMapping,
  LocationMapping,
  StatusUpdateCallback,
  MachineStatusCallback,
} from './speedqueen';
import {
  buildMachineMappings,
  parseLocationConfig,
  buildCommand,
  LOCATION_TO_AGENT,
} from './speedqueen';

// ---------------------------------------------------------------------------
// Mock SQ machine status type
// ---------------------------------------------------------------------------
type SQStatusName = 'AVAILABLE' | 'IN_USE' | 'END_OF_CYCLE' | 'OUT_OF_ORDER' | 'ERROR';

interface MockMachineState {
  mapping: MachineMapping;
  sqStatus: SQStatusName;
  remainingSeconds: number;
  remainingVend: number;
  isDoorOpen: boolean;
  selectedCycle: { id: string; name: string } | null;
  selectedModifier: { id: string; name: string } | null;
}

function mapSQStatusMock(sqStatus: string): MachineStatus {
  switch (sqStatus) {
    case 'AVAILABLE': return 'idle';
    case 'IN_USE': return 'running';
    case 'END_OF_CYCLE': return 'idle';
    case 'OUT_OF_ORDER': return 'out_of_order';
    case 'ERROR': return 'error';
    default: return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Mock cycles per machine model
// ---------------------------------------------------------------------------
const MOCK_CYCLES: Record<string, SpeedQueenMachineCycle[]> = {
  SY80U: [
    { id: 'cyc_normal_80', name: 'Normal', vendPrice: 350, duration: 1800 },
    { id: 'cyc_heavy_80', name: 'Heavy Duty', vendPrice: 450, duration: 2400 },
    { id: 'cyc_delicate_80', name: 'Delicate', vendPrice: 350, duration: 1500 },
  ],
  SY105U: [
    { id: 'cyc_normal_105', name: 'Normal', vendPrice: 450, duration: 1800 },
    { id: 'cyc_heavy_105', name: 'Heavy Duty', vendPrice: 550, duration: 2400 },
    { id: 'cyc_delicate_105', name: 'Delicate', vendPrice: 450, duration: 1500 },
  ],
  SY135U: [
    { id: 'cyc_normal_135', name: 'Normal', vendPrice: 550, duration: 2100 },
    { id: 'cyc_heavy_135', name: 'Heavy Duty', vendPrice: 650, duration: 2700 },
    { id: 'cyc_quick_135', name: 'Quick Wash', vendPrice: 450, duration: 1200 },
  ],
  SY180U: [
    { id: 'cyc_normal_180', name: 'Normal', vendPrice: 700, duration: 2400 },
    { id: 'cyc_heavy_180', name: 'Heavy Duty', vendPrice: 850, duration: 3000 },
    { id: 'cyc_bedding_180', name: 'Bedding', vendPrice: 750, duration: 2700 },
  ],
  'Tumbler 30 lbs Stack': [
    { id: 'cyc_regular_dry', name: 'Regular Dry', vendPrice: 200, duration: 2400 },
    { id: 'cyc_high_dry', name: 'High Heat', vendPrice: 250, duration: 3000 },
    { id: 'cyc_low_dry', name: 'Low Heat', vendPrice: 200, duration: 3600 },
  ],
};

// ---------------------------------------------------------------------------
// MockSpeedQueenService
// ---------------------------------------------------------------------------
export class MockSpeedQueenService {
  private locationIds: string[];
  private machineMappings: MachineMapping[];
  private machineStates = new Map<string, MockMachineState>();
  private machinesByAgent = new Map<string, LaundryMachine[]>();
  private cyclesByMachine = new Map<string, SpeedQueenMachineCycle[]>();
  private onStatusUpdate: StatusUpdateCallback;
  private simulationTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    _apiKey: string,
    locationConfig: string,
    onStatusUpdate: StatusUpdateCallback,
    _pollIntervalMs = 60_000,
  ) {
    this.onStatusUpdate = onStatusUpdate;

    const mappings = parseLocationConfig(locationConfig);
    this.locationIds = mappings.map(m => m.locationId);
    this.machineMappings = buildMachineMappings(mappings);

    // Initialize mock state for each machine
    for (const mapping of this.machineMappings) {
      const state: MockMachineState = {
        mapping,
        sqStatus: 'AVAILABLE',
        remainingSeconds: 0,
        remainingVend: 0,
        isDoorOpen: false,
        selectedCycle: null,
        selectedModifier: null,
      };
      this.machineStates.set(`${mapping.agentId}:${mapping.localId}`, state);
    }

    // Randomly set some machines to IN_USE on init
    this.randomizeInitialStates();
  }

  private randomizeInitialStates(): void {
    const states = Array.from(this.machineStates.values());
    for (const state of states) {
      const roll = Math.random();
      if (roll < 0.3) {
        // 30% chance: IN_USE with some remaining time
        state.sqStatus = 'IN_USE';
        state.remainingSeconds = Math.floor(Math.random() * 1800) + 300;
        const cycles = MOCK_CYCLES[state.mapping.model] || [];
        if (cycles.length > 0) {
          const c = cycles[Math.floor(Math.random() * cycles.length)];
          state.selectedCycle = { id: c.id, name: c.name };
          state.remainingVend = c.vendPrice ?? 0;
        }
      } else if (roll < 0.35) {
        // 5% chance: END_OF_CYCLE
        state.sqStatus = 'END_OF_CYCLE';
        state.isDoorOpen = false;
      } else if (roll < 0.38) {
        // 3% chance: ERROR
        state.sqStatus = 'ERROR';
      }
      // else: AVAILABLE (62%)
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    console.log(`[speedqueen-mock] Starting mock service for locations: ${this.locationIds.join(', ')}`);
    console.log(`[speedqueen-mock] ${this.machineMappings.length} machines simulated`);

    // Push initial state
    this.pushAllStatuses();

    // Simulate status changes every 10 seconds
    this.simulationTimer = setInterval(() => {
      this.simulateStatusChanges();
    }, 10_000);
  }

  stop(): void {
    this.started = false;
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    console.log('[speedqueen-mock] Service stopped');
  }

  private simulateStatusChanges(): void {
    const changedAgents = new Set<string>();

    for (const state of this.machineStates.values()) {
      const prev = state.sqStatus;
      switch (state.sqStatus) {
        case 'IN_USE':
          // Decrement remaining time
          state.remainingSeconds = Math.max(0, state.remainingSeconds - 10);
          if (state.remainingSeconds <= 0) {
            state.sqStatus = 'END_OF_CYCLE';
            state.remainingSeconds = 0;
            state.isDoorOpen = false;
            changedAgents.add(state.mapping.agentId);
          }
          break;

        case 'END_OF_CYCLE':
          // 20% chance of becoming available (someone picks up laundry)
          if (Math.random() < 0.2) {
            state.sqStatus = 'AVAILABLE';
            state.isDoorOpen = true;
            state.selectedCycle = null;
            state.selectedModifier = null;
            state.remainingVend = 0;
            changedAgents.add(state.mapping.agentId);
          }
          break;

        case 'AVAILABLE':
          // 5% chance of going IN_USE (someone starts a wash)
          if (Math.random() < 0.05) {
            state.sqStatus = 'IN_USE';
            state.isDoorOpen = false;
            const cycles = MOCK_CYCLES[state.mapping.model] || [];
            if (cycles.length > 0) {
              const c = cycles[Math.floor(Math.random() * cycles.length)];
              state.selectedCycle = { id: c.id, name: c.name };
              state.remainingVend = c.vendPrice ?? 0;
              state.remainingSeconds = c.duration ?? 1800;
            } else {
              state.remainingSeconds = 1800;
            }
            changedAgents.add(state.mapping.agentId);
          }
          break;

        case 'ERROR':
          // 10% chance of clearing error
          if (Math.random() < 0.1) {
            state.sqStatus = 'AVAILABLE';
            state.isDoorOpen = false;
            state.selectedCycle = null;
            state.remainingSeconds = 0;
            changedAgents.add(state.mapping.agentId);
          }
          break;
      }

      // Always track IN_USE decrement as a change (for real-time countdown)
      if (prev === 'IN_USE' && state.sqStatus === 'IN_USE') {
        changedAgents.add(state.mapping.agentId);
      }
    }

    // Push updates for changed agents
    for (const agentId of changedAgents) {
      this.pushAgentStatus(agentId);
    }
  }

  private pushAllStatuses(): void {
    const agentIds = new Set(this.machineMappings.map(m => m.agentId));
    for (const agentId of agentIds) {
      this.pushAgentStatus(agentId);
    }
  }

  private pushAgentStatus(agentId: string): void {
    const machines: LaundryMachine[] = [];
    for (const state of this.machineStates.values()) {
      if (state.mapping.agentId !== agentId) continue;
      machines.push(this.stateToLaundryMachine(state));
    }
    this.machinesByAgent.set(agentId, machines);
    this.onStatusUpdate(agentId, machines);
  }

  private stateToLaundryMachine(state: MockMachineState): LaundryMachine {
    return {
      id: state.mapping.localId,
      label: state.mapping.label,
      type: state.mapping.type,
      status: mapSQStatusMock(state.sqStatus),
      lastUpdated: Date.now(),
      source: 'speedqueen',
      speedqueenId: state.mapping.speedqueenId,
      remainingSeconds: state.remainingSeconds,
      remainingVend: state.remainingVend,
      isDoorOpen: state.isDoorOpen,
      selectedCycle: state.selectedCycle,
      selectedModifier: state.selectedModifier,
      model: state.mapping.model,
    };
  }

  // Public API — same interface as SpeedQueenService
  getMachines(agentId: string): LaundryMachine[] {
    return this.machinesByAgent.get(agentId) || [];
  }

  getMachineMapping(agentId: string, localMachineId: string): MachineMapping | undefined {
    return this.machineMappings.find(m => m.agentId === agentId && m.localId === localMachineId);
  }

  getLocationIdForAgent(agentId: string): string | undefined {
    return Object.entries(LOCATION_TO_AGENT).find(([, aid]) => aid === agentId)?.[0];
  }

  getMachineMappingsForAgent(agentId: string): MachineMapping[] {
    return this.machineMappings.filter(m => m.agentId === agentId);
  }

  async sendMachineCommand(
    agentId: string,
    localMachineId: string,
    commandType: SpeedQueenCommandType,
    params?: Record<string, unknown>,
  ): Promise<{ id: string; status: string }> {
    const key = `${agentId}:${localMachineId}`;
    const state = this.machineStates.get(key);
    if (!state) {
      throw new Error(`No Speed Queen mapping for ${agentId}/${localMachineId}`);
    }

    const commandId = `mock_cmd_${Date.now()}`;
    console.log(`[speedqueen-mock] Command ${commandType} for ${key} (params: ${JSON.stringify(params)})`);

    // Simulate command effects
    switch (commandType) {
      case 'remote_start': {
        state.sqStatus = 'IN_USE';
        state.isDoorOpen = false;
        const cycleId = params?.cycleId as string | undefined;
        const cycles = MOCK_CYCLES[state.mapping.model] || [];
        const cycle = cycleId ? cycles.find(c => c.id === cycleId) : cycles[0];
        if (cycle) {
          state.selectedCycle = { id: cycle.id, name: cycle.name };
          state.remainingVend = cycle.vendPrice ?? 0;
          state.remainingSeconds = cycle.duration ?? 1800;
        } else {
          state.remainingSeconds = 1800;
        }
        break;
      }
      case 'remote_stop':
        state.sqStatus = 'END_OF_CYCLE';
        state.remainingSeconds = 0;
        break;
      case 'clear_error':
        state.sqStatus = 'AVAILABLE';
        state.remainingSeconds = 0;
        state.selectedCycle = null;
        break;
      case 'set_out_of_order':
        state.sqStatus = 'OUT_OF_ORDER';
        state.remainingSeconds = 0;
        break;
      case 'select_cycle': {
        const selId = params?.cycleId as string | undefined;
        const allCycles = MOCK_CYCLES[state.mapping.model] || [];
        const sel = selId ? allCycles.find(c => c.id === selId) : null;
        if (sel) {
          state.selectedCycle = { id: sel.id, name: sel.name };
          state.remainingVend = sel.vendPrice ?? 0;
        }
        break;
      }
      // Other commands: just acknowledge
    }

    // Push updated status immediately
    this.pushAgentStatus(agentId);

    return { id: commandId, status: 'completed' };
  }

  async getCommandStatus(
    _agentId: string,
    _localMachineId: string,
    commandId: string,
  ): Promise<{ id: string; status: string }> {
    return { id: commandId, status: 'completed' };
  }

  async getMachineCycles(agentId: string, localMachineId: string): Promise<SpeedQueenMachineCycle[]> {
    const mapping = this.getMachineMapping(agentId, localMachineId);
    if (!mapping) return [];

    const cacheKey = `${mapping.locationId}:${mapping.speedqueenId}`;
    const cached = this.cyclesByMachine.get(cacheKey);
    if (cached) return cached;

    const cycles = MOCK_CYCLES[mapping.model] || [];
    this.cyclesByMachine.set(cacheKey, cycles);
    return cycles;
  }

  getRestClient(): null {
    return null; // Mock doesn't expose real REST client
  }

  isActive(): boolean {
    return this.started;
  }

  async pollAllLocations(): Promise<void> {
    this.pushAllStatuses();
  }
}
