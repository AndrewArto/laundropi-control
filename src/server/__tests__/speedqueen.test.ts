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
    it('builds remote_start command', () => {
      const cmd = buildCommand('remote_start', { cycleId: 'cyc_high' });
      expect(cmd.type).toBe('MachineRemoteStartCommandRequest');
      expect(cmd.cycleId).toBe('cyc_high');
    });

    it('builds remote_stop command', () => {
      const cmd = buildCommand('remote_stop');
      expect(cmd.type).toBe('MachineRemoteStopCommandRequest');
    });

    it('builds clear_error command', () => {
      const cmd = buildCommand('clear_error');
      expect(cmd.type).toBe('MachineClearErrorCommandRequest');
    });

    it('builds set_out_of_order command', () => {
      const cmd = buildCommand('set_out_of_order');
      expect(cmd.type).toBe('MachineProgramOutOfOrderCommandRequest');
    });

    it('throws for unknown command type', () => {
      expect(() => buildCommand('invalid' as any)).toThrow('Unknown command type');
    });

    // --- Coverage Gap 1: params.type override bypass ---
    it('prevents params.type from overriding validated command type', () => {
      const cmd = buildCommand('remote_start', { cycleId: 'cyc_1', type: 'MaliciousRequest' } as any);
      // type must always be the whitelisted value, not the caller's override
      expect(cmd.type).toBe('MachineRemoteStartCommandRequest');
      expect(cmd.cycleId).toBe('cyc_1');
    });

    it('ignores params.type silently (does not throw)', () => {
      const cmd = buildCommand('remote_stop', { type: 'Evil' } as any);
      expect(cmd.type).toBe('MachineRemoteStopCommandRequest');
    });

    // --- Coverage Gap 2: Malformed/unknown command params rejection ---
    it('rejects unknown parameter keys', () => {
      expect(() => buildCommand('remote_start', { malicious: true } as any))
        .toThrow("Unknown parameter 'malicious' for command 'remote_start'");
    });

    it('accepts valid parameters for remote_start', () => {
      const cmd = buildCommand('remote_start', { cycleId: 'cyc_1' });
      expect(cmd.cycleId).toBe('cyc_1');
      expect(cmd.type).toBe('MachineRemoteStartCommandRequest');
    });

    it('rejects parameters for commands that take none', () => {
      expect(() => buildCommand('remote_stop', { unexpectedKey: 'value' } as any))
        .toThrow("Unknown parameter 'unexpectedKey' for command 'remote_stop'");
    });

    it('COMMAND_PARAM_SCHEMAS covers all command types', () => {
      const commandTypes = [
        'remote_start', 'remote_stop', 'remote_vend', 'select_cycle',
        'start_dryer_with_time', 'clear_error', 'set_out_of_order',
        'rapid_advance', 'clear_partial_vend',
      ];
      for (const ct of commandTypes) {
        expect(COMMAND_PARAM_SCHEMAS).toHaveProperty(ct);
      }
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
        status: 'IN_USE',
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

    it('handles AVAILABLE status mapping', () => {
      const restClient = new SpeedQueenRestClient('test-key');
      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
      const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);

      const sqStatus = {
        id: 'mac_1096b5',
        status: 'AVAILABLE',
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
      const service = new SpeedQueenService(
        'test-key',
        'loc_d23f6c,loc_7b105b',
        (agentId, machines) => {
          statusUpdates.push({ agentId, count: machines.length });
        },
      );

      // Check the service was created (it won't start without calling start())
      expect(service.isActive()).toBe(false);
      expect(service.getMachines('Brandoa1')).toEqual([]);
      expect(service.getMachines('Brandoa2')).toEqual([]);
    });

    it('returns machine mapping for known machine', () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
      const mapping = service.getMachineMapping('Brandoa1', 'w1');
      expect(mapping).toBeDefined();
      expect(mapping?.speedqueenId).toBe('mac_1096b5');
      expect(mapping?.model).toBe('SY80U');
    });

    it('returns undefined for unknown machine mapping', () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
      const mapping = service.getMachineMapping('Brandoa1', 'w99');
      expect(mapping).toBeUndefined();
    });

    it('returns location ID for agent', () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
      expect(service.getLocationIdForAgent('Brandoa1')).toBe('loc_d23f6c');
      expect(service.getLocationIdForAgent('Unknown')).toBeUndefined();
    });

    it('returns all machine mappings for an agent', () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c,loc_7b105b', () => {});
      const b1Mappings = service.getMachineMappingsForAgent('Brandoa1');
      expect(b1Mappings).toHaveLength(8);
      const b2Mappings = service.getMachineMappingsForAgent('Brandoa2');
      expect(b2Mappings).toHaveLength(10);
    });

    it('getMachinesOnDemand works with paginated API response', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/machines')) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve({
              data: [
                {
                  id: 'mac_1096b5',
                  status: { status: 'IN_USE', remainingSeconds: 600 },
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

      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
      await service.start();
      const machines = await service.getMachinesOnDemand('Brandoa1');
      expect(machines.length).toBeGreaterThan(0);
      expect(machines[0].status).toBe('running');
      expect(machines[0].remainingSeconds).toBe(600);
      service.stop();
    });

    it('throws when sending command for unknown machine', async () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
      await expect(
        service.sendMachineCommand('Brandoa1', 'w99', 'remote_start'),
      ).rejects.toThrow('No Speed Queen mapping');
    });

    // --- Fix #1: Custom locationId:agentId mappings at runtime ---
    it('resolves custom agent ID from loc_xxx:CustomAgent config', () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c:CustomAgent', () => {});
      expect(service.getLocationIdForAgent('CustomAgent')).toBe('loc_d23f6c');
      expect(service.getLocationIdForAgent('Brandoa1')).toBeUndefined();
    });

    it('getMachinesOnDemand uses custom agent mapping for polling', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/machines')) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([
              {
                id: 'mac_1096b5',
                status: { status: 'AVAILABLE', remainingSeconds: 0 },
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

      const service = new SpeedQueenService('test-key', 'loc_d23f6c:CustomAgent', () => {});
      await service.start();
      const machines = await service.getMachinesOnDemand('CustomAgent');
      expect(machines.length).toBeGreaterThan(0);
      expect(machines[0].status).toBe('idle');
      service.stop();
    });

    it('getMachineMapping works with custom agent ID', () => {
      const service = new SpeedQueenService('test-key', 'loc_d23f6c:MyLaundry', () => {});
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve([]),
      });

      await client.getLocations();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('signal');
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
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
                status: { status: 'AVAILABLE', remainingSeconds: 0 },
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

      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
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
