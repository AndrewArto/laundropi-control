/**
 * Speed Queen Integration Tests
 *
 * Tests the FULL pipeline from real SQ API response shapes through to our
 * internal LaundryMachine types.  Fixtures match the exact field names and
 * nesting returned by the Speed Queen Insights API (statusId, not status).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock WebSocket
vi.mock('ws', () => {
  const EventEmitter = require('events');
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1; // OPEN
    send = vi.fn();
    close = vi.fn();
    constructor() {
      super();
      setTimeout(() => this.emit('open'), 0);
    }
  }
  return { WebSocket: MockWebSocket };
});

import {
  mapSQStatus,
  buildMachineMappings,
  parseLocationConfig,
  SpeedQueenRestClient,
  SpeedQueenWSClient,
  SpeedQueenService,
  BRANDOA1_MACHINES,
} from '../services/speedqueen';
import type { SQMachineStatus } from '../services/speedqueen';
import type { MachineStatus } from '../../../types';

// Mock MachineEventCollector for integration tests
const createMockEventCollector = (restClient: any, locationIds: string[], machineMappings: any[]) => ({
  getRestClient: () => restClient,
  getLocationIds: () => locationIds,
  getMachineMappings: () => machineMappings,
  setInitiatorResolver: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  isConnected: vi.fn(() => false),
  onStatusUpdate: vi.fn(),
});

// Helper function to create test SpeedQueenService
const createTestService = (locationConfig: string, statusCallback: any = () => {}) => {
  const restClient = new SpeedQueenRestClient('test-key');
  const locationMappings = parseLocationConfig(locationConfig);
  const machineMappings = buildMachineMappings(locationMappings);
  const locationIds = locationMappings.map(m => m.locationId);
  const mockEventCollector = createMockEventCollector(restClient, locationIds, machineMappings);
  return new SpeedQueenService(mockEventCollector, statusCallback);
};

// ============================================================================
// Fixtures — mirror the EXACT shape returned by the Speed Queen Insights API
// ============================================================================

/** Full SQ machine response as returned by GET /v1/locations/{id}/machines */
function makeSQMachineResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mac_1096b5',
    name: 'Washer #1',
    machineType: 'WASHER',
    model: 'SY80U',
    nodeNumber: 1,
    status: {
      statusId: 'AVAILABLE',
      displayStatus: '',
      linkQualityIndicator: 44,
      remainingSeconds: 600,
      remainingVend: 100,
      isDoorOpen: true,
      selectedCycle: { id: 'cyc_medium', name: 'MEDIUM' },
      selectedModifiers: [{ id: 'mod_none', name: 'NONE' }],
    },
    ...overrides,
  };
}

/** SQ machine status push (WebSocket) — flat status object with machine ref */
function makeSQStatusPush(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mac_1096b5',
    statusId: 'IN_USE',
    remainingSeconds: 1800,
    remainingVend: 200,
    isDoorOpen: false,
    selectedCycle: { id: 'cyc_high', name: 'HIGH' },
    selectedModifier: null,
    machine: { id: 'mac_1096b5' },
    location: { id: 'loc_d23f6c' },
    linkQualityIndicator: 72,
    displayStatus: 'Washing',
    ...overrides,
  };
}

// ============================================================================
// 1. Real API Response Shape → mapSQStatus → Internal Types
// ============================================================================
describe('SQ Integration: Real API response → internal types', () => {
  const statusMappings: Array<{ sqStatusId: string; expected: MachineStatus; label: string }> = [
    { sqStatusId: 'AVAILABLE', expected: 'idle', label: 'available machine → idle' },
    { sqStatusId: 'IN_USE', expected: 'running', label: 'in-use machine → running' },
    { sqStatusId: 'END_OF_CYCLE', expected: 'idle', label: 'end-of-cycle → idle (ready to use)' },
    { sqStatusId: 'DIAGNOSTIC', expected: 'out_of_order', label: 'diagnostic mode → out_of_order' },
    { sqStatusId: 'OUT_OF_ORDER', expected: 'out_of_order', label: 'out-of-order → out_of_order' },
    { sqStatusId: 'ERROR', expected: 'error', label: 'error state → error' },
  ];

  for (const { sqStatusId, expected, label } of statusMappings) {
    it(`maps statusId "${sqStatusId}" → "${expected}" (${label})`, () => {
      expect(mapSQStatus(sqStatusId)).toBe(expected);
    });
  }
});

// ============================================================================
// 2. REST pollLocation pipeline: getMachines() → pollLocation → LaundryMachine
// ============================================================================
describe('SQ Integration: REST poll pipeline (getMachines → pollLocation → LaundryMachine)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('correctly maps real nested SQ API response through full pipeline', async () => {
    // Simulate exact SQ API response: paginated with nested status object
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/v1/realtime/auth')) {
        return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
      }
      if (url.includes('/machines')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({
            data: [
              makeSQMachineResponse({
                id: 'mac_1096b5',
                status: {
                  statusId: 'IN_USE',
                  displayStatus: 'Washing - Heavy Cycle',
                  linkQualityIndicator: 88,
                  remainingSeconds: 1500,
                  remainingVend: 175,
                  isDoorOpen: false,
                  selectedCycle: { id: 'cyc_heavy', name: 'HEAVY' },
                  selectedModifiers: [{ id: 'mod_extra_rinse', name: 'EXTRA RINSE' }],
                },
              }),
              makeSQMachineResponse({
                id: 'mac_4a38fe',
                status: {
                  statusId: 'AVAILABLE',
                  displayStatus: '',
                  linkQualityIndicator: 55,
                  remainingSeconds: 0,
                  remainingVend: 0,
                  isDoorOpen: true,
                  selectedCycle: null,
                  selectedModifiers: [],
                },
              }),
              makeSQMachineResponse({
                id: 'mac_f6789c',
                status: {
                  statusId: 'END_OF_CYCLE',
                  displayStatus: 'Cycle Complete',
                  linkQualityIndicator: 30,
                  remainingSeconds: 0,
                  remainingVend: 0,
                  isDoorOpen: false,
                  selectedCycle: { id: 'cyc_normal', name: 'NORMAL' },
                  selectedModifiers: [{ id: 'mod_none', name: 'NONE' }],
                },
              }),
              makeSQMachineResponse({
                id: 'mac_cc70a4',
                status: {
                  statusId: 'ERROR',
                  displayStatus: 'E05 - Door Lock Failure',
                  linkQualityIndicator: 10,
                  remainingSeconds: 0,
                  remainingVend: 0,
                  isDoorOpen: false,
                  selectedCycle: null,
                  selectedModifiers: [],
                },
              }),
            ],
            meta: { page: 1, totalPages: 1, totalCount: 4, perPage: 50 },
          }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      };
    });

    const updates: Array<{ agentId: string; machines: any[] }> = [];
    const service = createTestService('loc_d23f6c', (agentId, machines) => {
      updates.push({ agentId, machines: [...machines] });
    });
    await service.start();

    const machines = await service.getMachinesOnDemand('Brandoa1');
    service.stop();

    // Verify w1 (mac_1096b5) — IN_USE → running
    const w1 = machines.find(m => m.id === 'w1');
    expect(w1).toBeDefined();
    expect(w1!.status).toBe('running');
    expect(w1!.remainingSeconds).toBe(1500);
    expect(w1!.remainingVend).toBe(175);
    expect(w1!.isDoorOpen).toBe(false);
    expect(w1!.source).toBe('speedqueen');
    expect(w1!.speedqueenId).toBe('mac_1096b5');
    expect(w1!.model).toBe('SY80U');
    expect(w1!.type).toBe('washer');
    expect(w1!.label).toBe('Washer 1');

    // Verify w2 (mac_4a38fe) — AVAILABLE → idle
    const w2 = machines.find(m => m.id === 'w2');
    expect(w2).toBeDefined();
    expect(w2!.status).toBe('idle');
    expect(w2!.isDoorOpen).toBe(true);
    expect(w2!.remainingSeconds).toBe(0);

    // Verify w3 (mac_f6789c) — END_OF_CYCLE → idle
    const w3 = machines.find(m => m.id === 'w3');
    expect(w3).toBeDefined();
    expect(w3!.status).toBe('idle');

    // Verify w4 (mac_cc70a4) — ERROR → error
    const w4 = machines.find(m => m.id === 'w4');
    expect(w4).toBeDefined();
    expect(w4!.status).toBe('error');

    // Verify the status update callback was invoked
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].agentId).toBe('Brandoa1');
  });

  it('handles all 8 Brandoa1 machines in a single paginated response', async () => {
    const allMachineIds = BRANDOA1_MACHINES.map(m => m.speedqueenId);
    const statuses = ['IN_USE', 'AVAILABLE', 'END_OF_CYCLE', 'ERROR', 'AVAILABLE', 'IN_USE', 'DIAGNOSTIC', 'OUT_OF_ORDER'];

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/v1/realtime/auth')) {
        return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
      }
      if (url.includes('/machines')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({
            data: allMachineIds.map((id, i) => makeSQMachineResponse({
              id,
              status: {
                statusId: statuses[i],
                displayStatus: '',
                linkQualityIndicator: 50 + i * 5,
                remainingSeconds: statuses[i] === 'IN_USE' ? 900 : 0,
                remainingVend: 0,
                isDoorOpen: false,
                selectedCycle: null,
                selectedModifiers: [],
              },
            })),
            meta: { page: 1, totalPages: 1 },
          }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      };
    });

    const service = createTestService('loc_d23f6c');
    await service.start();
    const machines = await service.getMachinesOnDemand('Brandoa1');
    service.stop();

    expect(machines).toHaveLength(8);

    // Verify each machine mapped to expected internal status
    const expectedMap: Record<string, MachineStatus> = {
      w1: 'running',       // IN_USE
      w2: 'idle',          // AVAILABLE
      w3: 'idle',          // END_OF_CYCLE
      w4: 'error',         // ERROR
      d5: 'idle',          // AVAILABLE
      d6: 'running',       // IN_USE
      d7: 'out_of_order',  // DIAGNOSTIC
      d8: 'out_of_order',  // OUT_OF_ORDER
    };

    for (const m of machines) {
      expect(m.status).toBe(expectedMap[m.id]);
      expect(m.source).toBe('speedqueen');
    }
  });

  it('maps nested sqm.status.statusId correctly (not flat statusId)', async () => {
    // This is the critical test: the API returns status NESTED inside sqm.status
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/v1/realtime/auth')) {
        return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
      }
      if (url.includes('/machines')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({
            data: [{
              id: 'mac_1096b5',
              // Status is nested — this is how the real API returns it
              status: {
                statusId: 'IN_USE',
                remainingSeconds: 720,
                remainingVend: 50,
                isDoorOpen: false,
                selectedCycle: { id: 'cyc_normal', name: 'NORMAL' },
                selectedModifiers: [{ id: 'mod_none', name: 'NONE' }],
              },
            }],
            meta: { page: 1, totalPages: 1 },
          }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      };
    });

    const service = createTestService('loc_d23f6c');
    await service.start();
    const machines = await service.getMachinesOnDemand('Brandoa1');
    service.stop();

    const w1 = machines.find(m => m.id === 'w1');
    expect(w1).toBeDefined();
    // The pipeline must read sqm.status.statusId, NOT sqm.statusId
    expect(w1!.status).toBe('running');
    expect(w1!.remainingSeconds).toBe(720);
  });
});

// ============================================================================
// 3. WebSocket push shape tests
// ============================================================================
describe('SQ Integration: WebSocket status push pipeline', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('maps WS status push with statusId field to correct internal status', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    // Simulate a real WS push payload with statusId (not status)
    const pushData = makeSQStatusPush({
      id: 'mac_1096b5',
      statusId: 'IN_USE',
      remainingSeconds: 1800,
      remainingVend: 200,
      isDoorOpen: false,
      selectedCycle: { id: 'cyc_high', name: 'HIGH' },
      selectedModifier: null,
    });

    const machine = wsClient.mapSQStatusToLaundryMachine(
      pushData as unknown as SQMachineStatus,
      mappings[0],
    );

    expect(machine.status).toBe('running');
    expect(machine.id).toBe('w1');
    expect(machine.remainingSeconds).toBe(1800);
    expect(machine.source).toBe('speedqueen');
  });

  it('maps each known statusId value in WS push correctly', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    const cases: Array<{ statusId: string; expected: MachineStatus }> = [
      { statusId: 'AVAILABLE', expected: 'idle' },
      { statusId: 'IN_USE', expected: 'running' },
      { statusId: 'END_OF_CYCLE', expected: 'idle' },
      { statusId: 'DIAGNOSTIC', expected: 'out_of_order' },
      { statusId: 'OUT_OF_ORDER', expected: 'out_of_order' },
      { statusId: 'ERROR', expected: 'error' },
    ];

    for (const { statusId, expected } of cases) {
      const push = makeSQStatusPush({ statusId });
      const machine = wsClient.mapSQStatusToLaundryMachine(
        push as unknown as SQMachineStatus,
        mappings[0],
      );
      expect(machine.status).toBe(expected);
    }
  });

  it('WS push with extra fields (linkQualityIndicator, displayStatus) does not break mapping', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    const pushWithExtras = {
      id: 'mac_1096b5',
      statusId: 'AVAILABLE',
      displayStatus: 'Ready',
      linkQualityIndicator: 95,
      remainingSeconds: 0,
      remainingVend: 0,
      isDoorOpen: true,
      selectedCycle: null,
      selectedModifier: null,
      // Extra unexpected fields from API
      firmwareVersion: '3.2.1',
      networkType: 'wifi',
      signalStrength: -42,
    };

    const machine = wsClient.mapSQStatusToLaundryMachine(
      pushWithExtras as unknown as SQMachineStatus,
      mappings[0],
    );

    expect(machine.status).toBe('idle');
    expect(machine.id).toBe('w1');
    expect(machine.isDoorOpen).toBe(true);
    // Extra fields should not appear on the output
    expect((machine as any).linkQualityIndicator).toBeUndefined();
    expect((machine as any).displayStatus).toBeUndefined();
    expect((machine as any).firmwareVersion).toBeUndefined();
  });

  it('Centrifuge ping (empty message {}) triggers pong response', async () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    // Mock fetch to handle realtime auth (use mockImplementation to avoid race with leaked fetches)
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/v1/realtime/auth')) {
        return { ok: true, json: () => Promise.resolve({ token: 'jwt-test-token' }) };
      }
      return { ok: true, headers: new Headers(), json: () => Promise.resolve({}) };
    });

    await wsClient.connect();
    // Wait for the 'open' event to fire (setTimeout in mock)
    await new Promise(r => setTimeout(r, 50));

    // Access the internal WebSocket through the client
    const ws = (wsClient as any).ws;
    expect(ws).toBeDefined();

    // Clear previous send calls (auth message on open)
    ws.send.mockClear();

    // Simulate receiving a Centrifuge ping: empty JSON object
    ws.emit('message', Buffer.from('{}'));

    // The client should respond with a pong: empty JSON object
    expect(ws.send).toHaveBeenCalledWith('{}');

    wsClient.destroy();
  });
});

// ============================================================================
// 4. Edge cases
// ============================================================================
describe('SQ Integration: Edge cases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('missing statusId field → maps to unknown', () => {
    // If the API returns an object without statusId
    expect(mapSQStatus(undefined as any)).toBe('unknown');
    expect(mapSQStatus(null as any)).toBe('unknown');
  });

  it('empty string statusId → maps to unknown', () => {
    expect(mapSQStatus('')).toBe('unknown');
  });

  it('unexpected statusId value → maps to unknown', () => {
    expect(mapSQStatus('MAINTENANCE')).toBe('unknown');
    expect(mapSQStatus('OFFLINE')).toBe('unknown');
    expect(mapSQStatus('PAUSED')).toBe('unknown');
  });

  it('selectedModifiers as array (real API) does not break WS mapping', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    // Real API returns selectedModifiers (plural, array) — but our type uses
    // selectedModifier (singular, object|null). The mapping should not crash.
    const pushWithModifiersArray = {
      id: 'mac_1096b5',
      statusId: 'IN_USE',
      remainingSeconds: 600,
      remainingVend: 100,
      isDoorOpen: false,
      selectedCycle: { id: 'cyc_medium', name: 'MEDIUM' },
      // Real API: array of modifiers
      selectedModifiers: [
        { id: 'mod_extra_rinse', name: 'EXTRA RINSE' },
        { id: 'mod_warm_water', name: 'WARM WATER' },
      ],
      selectedModifier: null,
    };

    const machine = wsClient.mapSQStatusToLaundryMachine(
      pushWithModifiersArray as unknown as SQMachineStatus,
      mappings[0],
    );

    // Should not crash; status should map correctly
    expect(machine.status).toBe('running');
    expect(machine.id).toBe('w1');
    expect(machine.remainingSeconds).toBe(600);
  });

  it('extra unexpected fields in REST response do not break polling', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/v1/realtime/auth')) {
        return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
      }
      if (url.includes('/machines')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({
            data: [{
              id: 'mac_1096b5',
              name: 'Washer #1',
              machineType: 'WASHER',
              model: 'SY80U',
              nodeNumber: 1,
              // Extra fields not in our type definitions
              serialNumber: 'SN-12345',
              installDate: '2024-03-15',
              lastMaintenanceDate: '2025-11-20',
              status: {
                statusId: 'AVAILABLE',
                displayStatus: '',
                linkQualityIndicator: 44,
                remainingSeconds: 0,
                remainingVend: 0,
                isDoorOpen: false,
                selectedCycle: null,
                selectedModifiers: [],
                // Extra unexpected fields inside status
                lastCommunication: '2026-02-18T10:30:00Z',
                networkMode: 'WIFI',
              },
            }],
            meta: { page: 1, totalPages: 1 },
          }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      };
    });

    const service = createTestService('loc_d23f6c');
    await service.start();
    const machines = await service.getMachinesOnDemand('Brandoa1');
    service.stop();

    const w1 = machines.find(m => m.id === 'w1');
    expect(w1).toBeDefined();
    expect(w1!.status).toBe('idle');
    // Extra fields should not leak into our LaundryMachine
    expect((w1 as any).serialNumber).toBeUndefined();
    expect((w1 as any).lastMaintenanceDate).toBeUndefined();
    expect((w1 as any).linkQualityIndicator).toBeUndefined();
  });

  it('REST response without nested status (flat statusId on machine) still works', async () => {
    // Some API versions might return status flat on the machine object
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/v1/realtime/auth')) {
        return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
      }
      if (url.includes('/machines')) {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({
            data: [{
              id: 'mac_1096b5',
              statusId: 'AVAILABLE',
              remainingSeconds: 0,
              remainingVend: 0,
              isDoorOpen: true,
              selectedCycle: null,
              selectedModifier: null,
              // No nested status object
            }],
            meta: { page: 1, totalPages: 1 },
          }),
        };
      }
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      };
    });

    const service = createTestService('loc_d23f6c');
    await service.start();
    const machines = await service.getMachinesOnDemand('Brandoa1');
    service.stop();

    // pollLocation falls back to sqm itself when sqm.status is undefined
    const w1 = machines.find(m => m.id === 'w1');
    expect(w1).toBeDefined();
    expect(w1!.status).toBe('idle');
  });

  it('status push with machine.id reference (nested) is handled', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    // Some pushes include machine reference as { machine: { id: "mac_xxx" } }
    const pushData = {
      statusId: 'END_OF_CYCLE',
      remainingSeconds: 0,
      remainingVend: 0,
      isDoorOpen: false,
      selectedCycle: null,
      selectedModifier: null,
      machine: { id: 'mac_4a38fe' },
      id: 'mac_4a38fe',
    };

    const mapping = mappings.find(m => m.speedqueenId === 'mac_4a38fe')!;
    const machine = wsClient.mapSQStatusToLaundryMachine(
      pushData as unknown as SQMachineStatus,
      mapping,
    );

    expect(machine.status).toBe('idle'); // END_OF_CYCLE → idle
    expect(machine.id).toBe('w2');
    expect(machine.label).toBe('Washer 2');
  });

  it('case-insensitive statusId handling in full pipeline', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    // Test lowercase statusId (in case API changes case)
    const push = {
      id: 'mac_1096b5',
      statusId: 'available',
      remainingSeconds: 0,
      isDoorOpen: false,
      selectedCycle: null,
      selectedModifier: null,
    };

    const machine = wsClient.mapSQStatusToLaundryMachine(
      push as unknown as SQMachineStatus,
      mappings[0],
    );

    expect(machine.status).toBe('idle');
  });

  it('all LaundryMachine fields are correctly populated from SQ data', () => {
    const restClient = new SpeedQueenRestClient('test-key');
    const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
    const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

    const sqData = {
      id: 'mac_85ee99',
      statusId: 'IN_USE',
      remainingSeconds: 2400,
      remainingVend: 300,
      isDoorOpen: false,
      selectedCycle: { id: 'cyc_perm_press', name: 'PERM PRESS' },
      selectedModifier: { id: 'mod_high_temp', name: 'HIGH TEMP' },
    };

    // mac_85ee99 is d5, Dryer 5
    const dryerMapping = mappings.find(m => m.speedqueenId === 'mac_85ee99')!;
    const machine = wsClient.mapSQStatusToLaundryMachine(
      sqData as unknown as SQMachineStatus,
      dryerMapping,
    );

    expect(machine.id).toBe('d5');
    expect(machine.label).toBe('Dryer 5');
    expect(machine.type).toBe('dryer');
    expect(machine.status).toBe('running');
    expect(machine.source).toBe('speedqueen');
    expect(machine.speedqueenId).toBe('mac_85ee99');
    expect(machine.remainingSeconds).toBe(2400);
    expect(machine.remainingVend).toBe(300);
    expect(machine.isDoorOpen).toBe(false);
    expect(machine.selectedCycle).toEqual({ id: 'cyc_perm_press', name: 'PERM PRESS' });
    expect(machine.selectedModifier).toEqual({ id: 'mod_high_temp', name: 'HIGH TEMP' });
    expect(machine.model).toBe('Tumbler 30 lbs Stack');
    expect(machine.lastUpdated).toBeGreaterThan(0);
  });
});
