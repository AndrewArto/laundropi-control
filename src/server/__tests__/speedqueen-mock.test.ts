import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket before importing
vi.mock('ws', () => {
  const EventEmitter = require('events');
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    send = vi.fn();
    close = vi.fn();
    constructor() {
      super();
      setTimeout(() => this.emit('open'), 0);
    }
  }
  return { WebSocket: MockWebSocket };
});

import { MockSpeedQueenService } from '../services/speedqueen-mock';
import type { LaundryMachine } from '../../../types';

describe('MockSpeedQueenService', () => {
  let service: MockSpeedQueenService;
  let statusUpdates: Array<{ agentId: string; machines: LaundryMachine[] }>;

  beforeEach(() => {
    statusUpdates = [];
    service = new MockSpeedQueenService(
      'mock-key',
      'loc_d23f6c,loc_7b105b',
      (agentId, machines) => {
        statusUpdates.push({ agentId, machines: [...machines] });
      },
    );
  });

  afterEach(() => {
    service.stop();
  });

  describe('initialization', () => {
    it('creates with correct location mappings', () => {
      expect(service.isActive()).toBe(false);
      expect(service.getMachines('Brandoa1')).toEqual([]);
    });

    it('provides machine mappings for known agents', () => {
      const mapping = service.getMachineMapping('Brandoa1', 'w1');
      expect(mapping).toBeDefined();
      expect(mapping?.speedqueenId).toBe('mac_1096b5');
      expect(mapping?.model).toBe('SY80U');
    });

    it('returns undefined for unknown machine mapping', () => {
      expect(service.getMachineMapping('Brandoa1', 'w99')).toBeUndefined();
    });

    it('returns location ID for agent', () => {
      expect(service.getLocationIdForAgent('Brandoa1')).toBe('loc_d23f6c');
      expect(service.getLocationIdForAgent('Unknown')).toBeUndefined();
    });

    it('returns all machine mappings for an agent', () => {
      const b1 = service.getMachineMappingsForAgent('Brandoa1');
      expect(b1).toHaveLength(8);
      const b2 = service.getMachineMappingsForAgent('Brandoa2');
      expect(b2).toHaveLength(10);
    });
  });

  describe('start and status updates', () => {
    it('starts and pushes initial status for all agents', async () => {
      await service.start();
      expect(service.isActive()).toBe(true);

      // Should have received status updates for both agents
      const agents = statusUpdates.map(u => u.agentId);
      expect(agents).toContain('Brandoa1');
      expect(agents).toContain('Brandoa2');
    });

    it('populates machines after start', async () => {
      await service.start();
      const b1Machines = service.getMachines('Brandoa1');
      expect(b1Machines).toHaveLength(8);
      const b2Machines = service.getMachines('Brandoa2');
      expect(b2Machines).toHaveLength(10);
    });

    it('all machines have source=speedqueen', async () => {
      await service.start();
      const machines = service.getMachines('Brandoa1');
      for (const m of machines) {
        expect(m.source).toBe('speedqueen');
      }
    });

    it('machines have valid statuses', async () => {
      await service.start();
      const machines = service.getMachines('Brandoa1');
      const validStatuses = ['idle', 'running', 'error', 'out_of_order', 'unknown'];
      for (const m of machines) {
        expect(validStatuses).toContain(m.status);
      }
    });

    it('does not start twice', async () => {
      await service.start();
      const count1 = statusUpdates.length;
      await service.start();
      expect(statusUpdates.length).toBe(count1); // no additional updates
    });
  });

  describe('commands', () => {
    it('remote_start changes machine to running', async () => {
      await service.start();

      const result = await service.sendMachineCommand('Brandoa1', 'w1', 'remote_start', {
        cycleId: 'cyc_normal_80',
      });
      expect(result.id).toMatch(/^mock_cmd_/);
      expect(result.status).toBe('completed');

      const machines = service.getMachines('Brandoa1');
      const w1 = machines.find(m => m.id === 'w1');
      expect(w1?.status).toBe('running');
      expect(w1?.selectedCycle?.name).toBe('Normal');
      expect(w1?.remainingSeconds).toBeGreaterThan(0);
    });

    it('remote_stop changes machine to idle (end of cycle)', async () => {
      await service.start();

      // First start the machine
      await service.sendMachineCommand('Brandoa1', 'w1', 'remote_start');
      // Then stop it
      await service.sendMachineCommand('Brandoa1', 'w1', 'remote_stop');

      const machines = service.getMachines('Brandoa1');
      const w1 = machines.find(m => m.id === 'w1');
      expect(w1?.status).toBe('idle'); // END_OF_CYCLE maps to idle
      expect(w1?.remainingSeconds).toBe(0);
    });

    it('clear_error changes machine to idle', async () => {
      await service.start();
      await service.sendMachineCommand('Brandoa1', 'w1', 'clear_error');

      const machines = service.getMachines('Brandoa1');
      const w1 = machines.find(m => m.id === 'w1');
      expect(w1?.status).toBe('idle');
    });

    it('set_out_of_order changes machine to out_of_order', async () => {
      await service.start();
      await service.sendMachineCommand('Brandoa1', 'w1', 'set_out_of_order');

      const machines = service.getMachines('Brandoa1');
      const w1 = machines.find(m => m.id === 'w1');
      expect(w1?.status).toBe('out_of_order');
    });

    it('throws for unknown machine', async () => {
      await service.start();
      await expect(
        service.sendMachineCommand('Brandoa1', 'w99', 'remote_start'),
      ).rejects.toThrow('No Speed Queen mapping');
    });

    it('getCommandStatus returns completed', async () => {
      const result = await service.getCommandStatus('Brandoa1', 'w1', 'mock_cmd_123');
      expect(result.status).toBe('completed');
    });
  });

  describe('cycles', () => {
    it('returns mock cycles for washer', async () => {
      const cycles = await service.getMachineCycles('Brandoa1', 'w1');
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toHaveProperty('id');
      expect(cycles[0]).toHaveProperty('name');
      expect(cycles[0]).toHaveProperty('vendPrice');
      expect(cycles[0]).toHaveProperty('duration');
    });

    it('returns mock cycles for dryer', async () => {
      const cycles = await service.getMachineCycles('Brandoa1', 'd5');
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0].name).toMatch(/Dry|Heat/);
    });

    it('returns empty for unknown machine', async () => {
      const cycles = await service.getMachineCycles('Brandoa1', 'w99');
      expect(cycles).toEqual([]);
    });

    it('caches cycles after first call', async () => {
      const cycles1 = await service.getMachineCycles('Brandoa1', 'w1');
      const cycles2 = await service.getMachineCycles('Brandoa1', 'w1');
      expect(cycles1).toBe(cycles2); // same reference (cached)
    });
  });

  describe('pollAllLocations', () => {
    it('updates status via polling', async () => {
      await service.start();
      statusUpdates.length = 0;

      await service.pollAllLocations();

      expect(statusUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('stop', () => {
    it('marks service as inactive', async () => {
      await service.start();
      expect(service.isActive()).toBe(true);
      service.stop();
      expect(service.isActive()).toBe(false);
    });
  });

  describe('getRestClient', () => {
    it('returns null for mock service', () => {
      expect(service.getRestClient()).toBeNull();
    });
  });
});
