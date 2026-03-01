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
      // Simulate open after construction
      setTimeout(() => this.emit('open'), 0);
    }
  }
  return { WebSocket: MockWebSocket };
});

import {
  mapSQStatus,
  translateCycleName,
  CYCLE_NAME_TRANSLATIONS,
  parseLocationConfig,
  buildMachineMappings,
  SpeedQueenRestClient,
  SpeedQueenWSClient,
  SpeedQueenService,
  buildCommand,
  COMMAND_PARAM_SCHEMAS,
  LOCATION_TO_AGENT,
  BRANDOA1_MACHINES,
  BRANDOA2_MACHINES,
} from '../services/speedqueen';

// Mock MachineEventCollector for tests
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

describe('Speed Queen Service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // -------------------------------------------------------------------
  // Status mapping
  // -------------------------------------------------------------------
  describe('mapSQStatus', () => {
    it('maps AVAILABLE to idle', () => {
      expect(mapSQStatus('AVAILABLE')).toBe('idle');
    });

    it('maps IN_USE to running', () => {
      expect(mapSQStatus('IN_USE')).toBe('running');
    });

    it('maps END_OF_CYCLE to idle', () => {
      expect(mapSQStatus('END_OF_CYCLE')).toBe('idle');
    });

    it('maps DIAGNOSTIC to out_of_order', () => {
      expect(mapSQStatus('DIAGNOSTIC')).toBe('out_of_order');
    });

    it('maps OUT_OF_ORDER to out_of_order', () => {
      expect(mapSQStatus('OUT_OF_ORDER')).toBe('out_of_order');
    });

    it('maps ERROR to error', () => {
      expect(mapSQStatus('ERROR')).toBe('error');
    });

    it('maps unknown status to unknown', () => {
      expect(mapSQStatus('SOMETHING_ELSE')).toBe('unknown');
      expect(mapSQStatus('')).toBe('unknown');
    });

    it('is case-insensitive', () => {
      expect(mapSQStatus('available')).toBe('idle');
      expect(mapSQStatus('in_use')).toBe('running');
    });
  });

  // -------------------------------------------------------------------
  // Cycle name translation
  // -------------------------------------------------------------------
  describe('translateCycleName', () => {
    it('translates Russian cycle names to English', () => {
      expect(translateCycleName('Обычная')).toBe('Normal');
      expect(translateCycleName('Цветное')).toBe('Colors');
      expect(translateCycleName('Белое')).toBe('Whites');
      expect(translateCycleName('Деликатная')).toBe('Delicate');
      expect(translateCycleName('Горячая стирка')).toBe('Hot Wash');
      expect(translateCycleName('Сполоснуть машину')).toBe('Machine Rinse');
      expect(translateCycleName('Скоростн. отжим')).toBe('Speed Spin');
    });

    it('translates Portuguese cycle names to English', () => {
      expect(translateCycleName('Cores')).toBe('Colors');
      expect(translateCycleName('Lã')).toBe('Wool');
      expect(translateCycleName('Enxaguar a máquina')).toBe('Machine Rinse');
    });

    it('passes through English cycle names unchanged', () => {
      expect(translateCycleName('Normal')).toBe('Normal');
      expect(translateCycleName('HIGH')).toBe('HIGH');
      expect(translateCycleName('LOW')).toBe('LOW');
      expect(translateCycleName('MEDIUM')).toBe('MEDIUM');
      expect(translateCycleName('DELICATE')).toBe('DELICATE');
      expect(translateCycleName('NO_HEAT')).toBe('NO_HEAT');
    });

    it('passes through unknown cycle names unchanged', () => {
      expect(translateCycleName('SomeUnknownCycle')).toBe('SomeUnknownCycle');
    });
  });

  // -------------------------------------------------------------------
  // Location config parsing
  // -------------------------------------------------------------------
  describe('parseLocationConfig', () => {
    it('parses comma-separated location IDs', () => {
      const result = parseLocationConfig('loc_d23f6c,loc_7b105b');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ locationId: 'loc_d23f6c', agentId: 'Brandoa1' });
      expect(result[1]).toEqual({ locationId: 'loc_7b105b', agentId: 'Brandoa2' });
    });

    it('parses location:agentId pairs', () => {
      const result = parseLocationConfig('loc_d23f6c:MyAgent1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ locationId: 'loc_d23f6c', agentId: 'MyAgent1' });
    });

    it('handles empty config', () => {
      expect(parseLocationConfig('')).toEqual([]);
      expect(parseLocationConfig('  ')).toEqual([]);
    });

    it('skips unknown location IDs without explicit agentId', () => {
      const result = parseLocationConfig('loc_unknown');
      expect(result).toEqual([]);
    });

    it('trims whitespace', () => {
      const result = parseLocationConfig(' loc_d23f6c , loc_7b105b ');
      expect(result).toHaveLength(2);
      expect(result[0].locationId).toBe('loc_d23f6c');
    });
  });

  // -------------------------------------------------------------------
  // Machine mappings
  // -------------------------------------------------------------------
  describe('buildMachineMappings', () => {
    it('builds Brandoa1 mappings', () => {
      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
      expect(mappings).toHaveLength(8);
      expect(mappings[0].speedqueenId).toBe('mac_1096b5');
      expect(mappings[0].localId).toBe('w1');
      expect(mappings[0].type).toBe('washer');
      expect(mappings[0].agentId).toBe('Brandoa1');
    });

    it('builds Brandoa2 mappings', () => {
      const mappings = buildMachineMappings([{ locationId: 'loc_7b105b', agentId: 'Brandoa2' }]);
      expect(mappings).toHaveLength(10);
      const dryers = mappings.filter(m => m.type === 'dryer');
      const washers = mappings.filter(m => m.type === 'washer');
      expect(dryers).toHaveLength(6);
      expect(washers).toHaveLength(4);
    });

    it('returns empty for unknown location', () => {
      const mappings = buildMachineMappings([{ locationId: 'loc_unknown', agentId: 'Unknown' }]);
      expect(mappings).toHaveLength(0);
    });

    it('builds both locations', () => {
      const mappings = buildMachineMappings([
        { locationId: 'loc_d23f6c', agentId: 'Brandoa1' },
        { locationId: 'loc_7b105b', agentId: 'Brandoa2' },
      ]);
      expect(mappings).toHaveLength(18); // 8 + 10
    });
  });

  // -------------------------------------------------------------------
  // Hardcoded data consistency
  // -------------------------------------------------------------------
  describe('machine data consistency', () => {
    it('Brandoa1 has 4 washers and 4 dryers', () => {
      expect(BRANDOA1_MACHINES.filter(m => m.type === 'washer')).toHaveLength(4);
      expect(BRANDOA1_MACHINES.filter(m => m.type === 'dryer')).toHaveLength(4);
    });

    it('Brandoa2 has 4 washers and 6 dryers', () => {
      expect(BRANDOA2_MACHINES.filter(m => m.type === 'washer')).toHaveLength(4);
      expect(BRANDOA2_MACHINES.filter(m => m.type === 'dryer')).toHaveLength(6);
    });

    it('all machines have unique speedqueenIds', () => {
      const allIds = [...BRANDOA1_MACHINES, ...BRANDOA2_MACHINES].map(m => m.speedqueenId);
      expect(new Set(allIds).size).toBe(allIds.length);
    });

    it('location mapping is correct', () => {
      expect(LOCATION_TO_AGENT['loc_d23f6c']).toBe('Brandoa1');
      expect(LOCATION_TO_AGENT['loc_7b105b']).toBe('Brandoa2');
    });
  });

  // -------------------------------------------------------------------
  // Command building
  // -------------------------------------------------------------------
  describe('buildCommand', () => {
    it('builds remote_start command with correct SQ API format', () => {
      const cmd = buildCommand('remote_start');
      expect(cmd.command).toBe('START');
      expect(cmd).not.toHaveProperty('type');
      expect(cmd).not.toHaveProperty('params');
    });

    it('builds remote_stop command', () => {
      const cmd = buildCommand('remote_stop');
      expect(cmd.command).toBe('STOP');
      expect(cmd).not.toHaveProperty('type');
    });

    it('builds start_dryer_with_time command with params', () => {
      const cmd = buildCommand('start_dryer_with_time', { minutes: 20 });
      expect(cmd.command).toBe('START_DRYER_WITH_TIME');
      expect(cmd.params).toEqual({ minutes: 20 });
    });

    it('builds remote_vend command with vendAmount param', () => {
      const cmd = buildCommand('remote_vend', { vendAmount: 350 });
      expect(cmd.command).toBe('REMOTE_VEND');
      expect(cmd.params).toEqual({ vendAmount: 350 });
    });

    it('builds clear_error command', () => {
      const cmd = buildCommand('clear_error');
      expect(cmd.command).toBe('CLEAR_ERROR');
    });

    it('builds set_out_of_order command', () => {
      const cmd = buildCommand('set_out_of_order', { outOfOrder: true });
      expect(cmd.command).toBe('PROGRAM_OUT_OF_ORDER');
      expect(cmd.params).toEqual({ outOfOrder: true });
    });

    it('builds rapid_advance command', () => {
      const cmd = buildCommand('rapid_advance');
      expect(cmd.command).toBe('RAPID_ADVANCE_TO_NEXT_STEP');
    });

    it('builds clear_partial_vend command', () => {
      const cmd = buildCommand('clear_partial_vend');
      expect(cmd.command).toBe('CLEAR_PARTIAL_VEND');
    });

    it('throws for unknown command type', () => {
      expect(() => buildCommand('invalid' as any)).toThrow('Unknown command type');
    });

    // params.type is silently stripped (does not end up in output)
    it('ignores params.type silently (does not throw)', () => {
      const cmd = buildCommand('remote_stop', { type: 'Evil' } as any);
      expect(cmd.command).toBe('STOP');
      expect(cmd).not.toHaveProperty('type');
    });

    // --- Coverage Gap 2: Malformed/unknown command params rejection ---
    it('rejects unknown parameter keys', () => {
      expect(() => buildCommand('remote_start', { malicious: true } as any))
        .toThrow("Unknown parameter 'malicious' for command 'remote_start'");
    });

    it('rejects parameters for commands that take none', () => {
      expect(() => buildCommand('remote_stop', { unexpectedKey: 'value' } as any))
        .toThrow("Unknown parameter 'unexpectedKey' for command 'remote_stop'");
    });

    it('COMMAND_PARAM_SCHEMAS covers all command types', () => {
      const commandTypes = [
        'remote_start', 'remote_stop', 'remote_vend',
        'start_dryer_with_time', 'clear_error', 'set_out_of_order',
        'rapid_advance', 'clear_partial_vend',
      ];
      for (const ct of commandTypes) {
        expect(COMMAND_PARAM_SCHEMAS).toHaveProperty(ct);
      }
    });

    it('omits params key when command has no parameters', () => {
      const cmd = buildCommand('remote_start');
      expect(Object.keys(cmd)).toEqual(['command']);
    });

    it('includes params key only when command has parameters', () => {
      const cmd = buildCommand('start_dryer_with_time', { minutes: 15 });
      expect(Object.keys(cmd).sort()).toEqual(['command', 'params']);
    });
  });

  // -------------------------------------------------------------------
  // REST Client
  // -------------------------------------------------------------------
  describe('SpeedQueenRestClient', () => {
    const client = new SpeedQueenRestClient('test-api-key');

    it('calls getLocations with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([{ id: 'loc_1', name: 'Test' }]),
      });

      const result = await client.getLocations();
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.alliancelaundrydigital.com/v1/locations',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
          }),
        }),
      );
    });

    it('calls getMachines for a location', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([{ id: 'mac_1', status: 'AVAILABLE' }]),
      });

      const result = await client.getMachines('loc_d23f6c');
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/locations/loc_d23f6c/machines'),
        expect.any(Object),
      );
    });

    it('sends command to machine', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ id: 'cmd_123', status: 'pending' }),
      });

      const result = await client.sendCommand('loc_d23f6c', 'mac_1', { type: 'MachineRemoteStartCommandRequest' });
      expect(result.id).toBe('cmd_123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/locations/loc_d23f6c/machines/mac_1/commands'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(client.getLocations()).rejects.toThrow('Speed Queen API request failed: 401');
    });

    it('gets realtime token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'jwt-test-token' }),
      });

      const token = await client.getRealtimeToken();
      expect(token).toBe('jwt-test-token');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/realtime/auth'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'test-api-key',
          }),
        }),
      );
    });

    it('throws when realtime auth returns no token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await expect(client.getRealtimeToken()).rejects.toThrow('no token in response');
    });

    // --- Paginated response unwrapping ---
    it('unwraps paginated getMachines response with { data: [...], meta: {...} }', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          data: [
            { id: 'mac_1', status: 'AVAILABLE' },
            { id: 'mac_2', status: 'IN_USE' },
          ],
          meta: { page: 1, totalPages: 1 },
        }),
      });

      const result = await client.getMachines('loc_d23f6c');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('mac_1');
      expect(result[1].id).toBe('mac_2');
    });

    it('handles raw array getMachines response (no pagination wrapper)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([{ id: 'mac_1', status: 'AVAILABLE' }]),
      });

      const result = await client.getMachines('loc_d23f6c');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mac_1');
    });

    it('unwraps paginated getLocations response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          data: [{ id: 'loc_1', name: 'Location 1' }],
          meta: { page: 1 },
        }),
      });

      const result = await client.getLocations();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('loc_1');
    });

    it('unwraps paginated getMachineCycles response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          data: [
            { id: 'cyc_1', name: 'Normal' },
            { id: 'cyc_2', name: 'Heavy' },
          ],
          meta: { page: 1 },
        }),
      });

      const result = await client.getMachineCycles('loc_d23f6c', 'mac_1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Normal');
    });

    it('unwraps paginated getMachineErrors response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          data: [{ id: 'err_1', name: 'E01', type: 'critical', code: 1, machine: { id: 'mac_1' }, location: { id: 'loc_1' }, timestamp: '2026-01-01' }],
          meta: {},
        }),
      });

      const result = await client.getMachineErrors('loc_d23f6c', 'mac_1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('err_1');
    });

    it('returns empty array for unexpected response shape', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ unexpected: 'shape' }),
      });

      const result = await client.getMachines('loc_d23f6c');
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // WebSocket Client
  // -------------------------------------------------------------------
  describe('SpeedQueenWSClient', () => {
    it('maps SQ status to LaundryMachine correctly', () => {
      const restClient = new SpeedQueenRestClient('test-key');
      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
      const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

      const sqStatus = {
        id: 'mac_1096b5',
        statusId: 'IN_USE',
        remainingSeconds: 1200,
        remainingVend: 150,
        isDoorOpen: false,
        selectedCycle: { id: 'cyc_high', name: 'HIGH' },
        selectedModifier: null,
      };

      const result = wsClient.mapSQStatusToLaundryMachine(sqStatus, mappings[0]);
      expect(result.id).toBe('w1');
      expect(result.label).toBe('Washer 1');
      expect(result.type).toBe('washer');
      expect(result.status).toBe('running');
      expect(result.source).toBe('speedqueen');
      expect(result.speedqueenId).toBe('mac_1096b5');
      expect(result.remainingSeconds).toBe(1200);
      expect(result.isDoorOpen).toBe(false);
      expect(result.selectedCycle?.name).toBe('HIGH');
      expect(result.model).toBe('SY80U');
    });

    it('translates Russian cycle names in mapSQStatusToLaundryMachine', () => {
      const restClient = new SpeedQueenRestClient('test-key');
      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
      const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

      const sqStatus = {
        id: 'mac_1096b5',
        statusId: 'IN_USE',
        remainingSeconds: 900,
        remainingVend: 0,
        isDoorOpen: false,
        selectedCycle: { id: 'cyc_normal', name: 'Обычная' },
        selectedModifier: null,
      };

      const result = wsClient.mapSQStatusToLaundryMachine(sqStatus, mappings[0]);
      expect(result.selectedCycle?.name).toBe('Normal');
    });

    it('translates Portuguese cycle names in mapSQStatusToLaundryMachine', () => {
      const restClient = new SpeedQueenRestClient('test-key');
      const mappings = buildMachineMappings([{ locationId: 'loc_7b105b', agentId: 'Brandoa2' }]);
      const wsClient = new SpeedQueenWSClient(restClient, ['loc_7b105b'], mappings);

      const sqStatus = {
        id: 'mac_e1f20d',
        statusId: 'IN_USE',
        remainingSeconds: 600,
        remainingVend: 0,
        isDoorOpen: false,
        selectedCycle: { id: 'cyc_cores', name: 'Cores' },
        selectedModifier: null,
      };

      const result = wsClient.mapSQStatusToLaundryMachine(sqStatus, mappings.find(m => m.speedqueenId === 'mac_e1f20d')!);
      expect(result.selectedCycle?.name).toBe('Colors');
    });

    it('handles AVAILABLE status mapping', () => {
      const restClient = new SpeedQueenRestClient('test-key');
      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
      const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

      const sqStatus = {
        id: 'mac_1096b5',
        statusId: 'AVAILABLE',
        remainingSeconds: 0,
        isDoorOpen: true,
        selectedCycle: null,
        selectedModifier: null,
      };

      const result = wsClient.mapSQStatusToLaundryMachine(sqStatus, mappings[0]);
      expect(result.status).toBe('idle');
      expect(result.isDoorOpen).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // SpeedQueenService integration
  // -------------------------------------------------------------------
  describe('SpeedQueenService', () => {
    it('initializes with correct location mappings', () => {
      const statusUpdates: Array<{ agentId: string; count: number }> = [];
      const statusCallback = (agentId: string, machines: any[]) => {
        statusUpdates.push({ agentId, count: machines.length });
      };

      const service = createTestService('loc_d23f6c,loc_7b105b', statusCallback);

      // Check the service was created (it won't start without calling start())
      expect(service.isActive()).toBe(false);
      expect(service.getMachines('Brandoa1')).toEqual([]);
      expect(service.getMachines('Brandoa2')).toEqual([]);
    });

    it('returns machine mapping for known machine', () => {
      const service = createTestService('loc_d23f6c');
      const mapping = service.getMachineMapping('Brandoa1', 'w1');
      expect(mapping).toBeDefined();
      expect(mapping?.speedqueenId).toBe('mac_1096b5');
      expect(mapping?.model).toBe('SY80U');
    });

    it('returns undefined for unknown machine mapping', () => {
      const service = createTestService('loc_d23f6c');
      const mapping = service.getMachineMapping('Brandoa1', 'w99');
      expect(mapping).toBeUndefined();
    });

    it('returns location ID for agent', () => {
      const service = createTestService('loc_d23f6c');
      expect(service.getLocationIdForAgent('Brandoa1')).toBe('loc_d23f6c');
      expect(service.getLocationIdForAgent('Unknown')).toBeUndefined();
    });

    it('returns all machine mappings for an agent', () => {
      const service = createTestService('loc_d23f6c,loc_7b105b');
      const b1Mappings = service.getMachineMappingsForAgent('Brandoa1');
      expect(b1Mappings).toHaveLength(8);
      const b2Mappings = service.getMachineMappingsForAgent('Brandoa2');
      expect(b2Mappings).toHaveLength(10);
    });

    it('getMachinesOnDemand works with paginated API response', async () => {
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
                {
                  id: 'mac_1096b5',
                  status: { statusId: 'IN_USE', remainingSeconds: 600 },
                },
              ],
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
      expect(machines.length).toBeGreaterThan(0);
      expect(machines[0].status).toBe('running');
      expect(machines[0].remainingSeconds).toBe(600);
      service.stop();
    });

    it('throws when sending command for unknown machine', async () => {
      const service = createTestService('loc_d23f6c');
      await expect(
        service.sendMachineCommand('Brandoa1', 'w99', 'remote_start'),
      ).rejects.toThrow('No Speed Queen mapping');
    });

    // --- Fix #1: Custom locationId:agentId mappings at runtime ---
    it('resolves custom agent ID from loc_xxx:CustomAgent config', () => {
      const service = createTestService('loc_d23f6c:CustomAgent');
      expect(service.getLocationIdForAgent('CustomAgent')).toBe('loc_d23f6c');
      expect(service.getLocationIdForAgent('Brandoa1')).toBeUndefined();
    });

    it('getMachinesOnDemand uses custom agent mapping for polling', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
        }
        if (url.includes('/machines')) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([
              {
                id: 'mac_1096b5',
                status: { statusId: 'AVAILABLE', remainingSeconds: 0 },
              },
            ]),
          };
        }
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({}),
        };
      });

      const service = createTestService('loc_d23f6c:CustomAgent');
      await service.start();
      const machines = await service.getMachinesOnDemand('CustomAgent');
      expect(machines.length).toBeGreaterThan(0);
      expect(machines[0].status).toBe('idle');
      service.stop();
    });

    it('getMachineMapping works with custom agent ID', () => {
      const service = createTestService('loc_d23f6c:MyLaundry');
      const mapping = service.getMachineMapping('MyLaundry', 'w1');
      expect(mapping).toBeDefined();
      expect(mapping?.speedqueenId).toBe('mac_1096b5');
      expect(mapping?.agentId).toBe('MyLaundry');
    });
  });

  // -------------------------------------------------------------------
  // Coverage Gap 4: Resilience tests for timeout/abort/retry
  // -------------------------------------------------------------------
  describe('REST client timeout and retry', () => {
    const client = new SpeedQueenRestClient('test-api-key');

    it('retries on 5xx and eventually succeeds', async () => {
      // Wait briefly for any leaked async calls from previous tests to settle
      await new Promise(r => setTimeout(r, 200));
      mockFetch.mockReset();
      let calls = 0;
      mockFetch.mockImplementation(async () => {
        calls++;
        if (calls <= 2) {
          return { ok: false, status: 503, text: () => Promise.resolve('') };
        }
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve([{ id: 'loc_1', name: 'Test' }]),
        };
      });

      const result = await client.getLocations();
      expect(result).toHaveLength(1);
      expect(calls).toBe(3); // 2 retries + 1 success
    });

    it('does not retry on 4xx client errors', async () => {
      let calls = 0;
      mockFetch.mockImplementation(async () => {
        calls++;
        return { ok: false, status: 404, text: () => Promise.resolve('') };
      });

      await expect(client.getLocations()).rejects.toThrow('404');
      expect(calls).toBe(1); // no retries
    });

    it('includes AbortSignal in fetch options', async () => {
      mockFetch.mockImplementation(async () => ({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([]),
      }));

      await client.getLocations();
      // Find the call that is for getLocations (not a leaked call from prior tests)
      const locationCall = mockFetch.mock.calls.find(
        (c: any) => c[0].includes('/v1/locations'),
      );
      expect(locationCall).toBeDefined();
      expect(locationCall![1]).toHaveProperty('signal');
      expect(locationCall![1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  // -------------------------------------------------------------------
  // Fix #6: Error message sanitization
  // -------------------------------------------------------------------
  describe('REST client error sanitization', () => {
    it('does not include raw vendor response in error message', async () => {
      const client = new SpeedQueenRestClient('test-api-key');
      // Mock all retry attempts to return 500
      mockFetch.mockImplementation(async () => ({
        ok: false,
        status: 500,
      }));

      try {
        await client.getLocations();
        expect.fail('Should have thrown');
      } catch (err: any) {
        // Error message should contain status code but NOT raw response body
        expect(err.message).toContain('500');
        expect(err.message).not.toContain('sensitive');
        expect(err.message).not.toContain('vendor');
        expect(err.message).not.toContain('API key');
      }
    });
  });

  // -------------------------------------------------------------------
  // Fix #7: In-flight poll deduplication
  // -------------------------------------------------------------------
  describe('poll deduplication', () => {
    it('deduplicates concurrent getMachinesOnDemand calls', async () => {
      let pollCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
        }
        if (url.includes('/machines')) {
          pollCount++;
          // Simulate network delay
          await new Promise(r => setTimeout(r, 50));
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([
              {
                id: 'mac_1096b5',
                status: { statusId: 'AVAILABLE', remainingSeconds: 0 },
              },
            ]),
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

      // Fire multiple concurrent requests
      const [m1, m2, m3] = await Promise.all([
        service.getMachinesOnDemand('Brandoa1'),
        service.getMachinesOnDemand('Brandoa1'),
        service.getMachinesOnDemand('Brandoa1'),
      ]);

      // Should only have made 1 REST call, not 3
      expect(pollCount).toBe(1);
      expect(m1.length).toBeGreaterThan(0);
      expect(m2.length).toBeGreaterThan(0);
      expect(m3.length).toBeGreaterThan(0);
      service.stop();
    });
  });
});
