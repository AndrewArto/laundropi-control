import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally before importing modules
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock WebSocket dependency like other Speed Queen tests
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

const mocks = vi.hoisted(() => ({
  insertMachineEvent: vi.fn(),
  getLastKnownStatus: vi.fn(),
  wsConnect: vi.fn(),
  wsDestroy: vi.fn(),
}));

vi.mock('../db', () => ({
  insertMachineEvent: mocks.insertMachineEvent,
  getLastKnownStatus: mocks.getLastKnownStatus,
}));

vi.mock('../services/speedqueen', () => {
  class MockSpeedQueenWSClient {
    onMachineStatus?: (agentId: string, machines: any[]) => void;
    onMachineStatusRaw?: (agentId: string, machineId: string, statusData: any, mapping: any) => void;
    onMachineError?: (agentId: string, error: any) => void;
    onMachineEvent?: (agentId: string, event: any) => void;

    connect = mocks.wsConnect;
    destroy = mocks.wsDestroy;
    isConnected = vi.fn(() => true);
  }

  return {
    SpeedQueenWSClient: MockSpeedQueenWSClient,
    SpeedQueenRestClient: class {},
    mapSQStatus: (statusId: string) => statusId?.toUpperCase() === 'IN_USE' ? 'running' : 'idle',
    translateCycleName: (name: string) => `translated:${name}`,
  };
});

import { MachineEventCollector } from '../services/machine-event-collector';

const testMappings = [
  {
    speedqueenId: 'mac_1',
    localId: 'w1',
    label: 'Washer 1',
    type: 'washer',
    model: 'SY80U',
    locationId: 'loc_1',
    agentId: 'Agent1',
  },
  {
    speedqueenId: 'mac_2',
    localId: 'd1',
    label: 'Dryer 1',
    type: 'dryer',
    model: 'Tumbler',
    locationId: 'loc_1',
    agentId: 'Agent1',
  },
] as const;

const createCollector = (restClient: any = { getMachines: vi.fn() }, onStatusUpdate = vi.fn()) => {
  return new MachineEventCollector(restClient, ['loc_1'], [...testMappings] as any, onStatusUpdate);
};

describe('MachineEventCollector', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockFetch.mockReset();
    mocks.insertMachineEvent.mockReset();
    mocks.getLastKnownStatus.mockReset();
    mocks.wsConnect.mockReset();
    mocks.wsDestroy.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loadBaselineFromDB', () => {
    it('loads last known status per machine into baseline map', async () => {
      mocks.getLastKnownStatus
        .mockReturnValueOnce('AVAILABLE')
        .mockReturnValueOnce(null);

      const collector = createCollector();

      await (collector as any).loadBaselineFromDB();

      expect(mocks.getLastKnownStatus).toHaveBeenCalledTimes(2);
      expect(mocks.getLastKnownStatus).toHaveBeenNthCalledWith(1, 'mac_1');
      expect(mocks.getLastKnownStatus).toHaveBeenNthCalledWith(2, 'mac_2');
      expect(collector.getBaselineStatus('mac_1')).toBe('AVAILABLE');
      expect(collector.getBaselineStatus('mac_2')).toBeNull();
    });
  });

  describe('handleStatusChange', () => {
    it('logs only WS transitions and skips first WS baseline update', () => {
      const collector = createCollector();
      const mapping = testMappings[0];

      (collector as any).handleStatusChange(mapping, { statusId: 'AVAILABLE' }, 'ws_push');
      expect(mocks.insertMachineEvent).not.toHaveBeenCalled();

      (collector as any).handleStatusChange(mapping, { statusId: 'AVAILABLE' }, 'ws_push');
      expect(mocks.insertMachineEvent).not.toHaveBeenCalled();

      (collector as any).handleStatusChange(
        mapping,
        {
          statusId: 'IN_USE',
          selectedCycle: { id: 'cyc_1', name: 'Normal' },
        },
        'ws_push'
      );

      expect(mocks.insertMachineEvent).toHaveBeenCalledTimes(1);
      const event = mocks.insertMachineEvent.mock.calls[0][0];
      expect(event.source).toBe('ws_push');
      expect(event.isTransition).toBe(1);
      expect(event.statusId).toBe('IN_USE');
      expect(event.previousStatusId).toBe('AVAILABLE');
      expect(event.cycleName).toBe('translated:Normal');
    });

    it('always logs REST snapshots with isTransition=0', () => {
      const collector = createCollector();
      const mapping = testMappings[0];

      (collector as any).handleStatusChange(mapping, { statusId: 'AVAILABLE' }, 'rest_snapshot');
      (collector as any).handleStatusChange(mapping, { statusId: 'AVAILABLE' }, 'rest_snapshot');

      expect(mocks.insertMachineEvent).toHaveBeenCalledTimes(2);
      expect(mocks.insertMachineEvent.mock.calls[0][0].source).toBe('rest_snapshot');
      expect(mocks.insertMachineEvent.mock.calls[0][0].isTransition).toBe(0);
      expect(mocks.insertMachineEvent.mock.calls[1][0].source).toBe('rest_snapshot');
      expect(mocks.insertMachineEvent.mock.calls[1][0].isTransition).toBe(0);
      expect(mocks.insertMachineEvent.mock.calls[1][0].previousStatusId).toBe('AVAILABLE');
    });
  });

  describe('takeSnapshot', () => {
    it('pulls machines by location, logs snapshot events, and updates status callback', async () => {
      const restClient = {
        getMachines: vi.fn().mockResolvedValue([
          {
            id: 'mac_1',
            status: {
              statusId: 'IN_USE',
              remainingSeconds: 600,
              remainingVend: 350,
              isDoorOpen: false,
              selectedCycle: { id: 'cyc_1', name: 'Quick' },
            },
          },
          {
            id: 'mac_unknown',
            status: { statusId: 'AVAILABLE' },
          },
        ]),
      };
      const onStatusUpdate = vi.fn();
      const collector = createCollector(restClient, onStatusUpdate);
      (collector as any).started = true;

      await (collector as any).takeSnapshot();

      expect(restClient.getMachines).toHaveBeenCalledTimes(1);
      expect(restClient.getMachines).toHaveBeenCalledWith('loc_1');
      expect(mocks.insertMachineEvent).toHaveBeenCalledTimes(1);
      expect(mocks.insertMachineEvent.mock.calls[0][0].source).toBe('rest_snapshot');
      expect(mocks.insertMachineEvent.mock.calls[0][0].isTransition).toBe(0);

      expect(onStatusUpdate).toHaveBeenCalledTimes(1);
      const [agentId, machines] = onStatusUpdate.mock.calls[0];
      expect(agentId).toBe('Agent1');
      expect(machines).toHaveLength(1);
      expect(machines[0]).toMatchObject({
        id: 'w1',
        label: 'Washer 1',
        status: 'running',
        selectedCycle: { id: 'cyc_1', name: 'translated:Quick' },
      });
    });
  });

  describe('reconnect', () => {
    it('schedules reconnect when websocket connect fails', async () => {
      vi.useFakeTimers();
      mocks.wsConnect.mockRejectedValueOnce(new Error('ws connect failed'));
      mocks.wsConnect.mockResolvedValueOnce(undefined);
      mocks.getLastKnownStatus.mockReturnValue(null);

      const collector = createCollector();
      await collector.start();
      await vi.runAllTicks();

      expect(mocks.wsConnect).toHaveBeenCalledTimes(1);
      expect((collector as any).reconnectTimer).not.toBeNull();

      await vi.advanceTimersByTimeAsync(1000);
      expect(mocks.wsConnect).toHaveBeenCalledTimes(2);

      collector.stop();
    });
  });
});
