import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock WebSocket
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

import {
  SpeedQueenService,
  STATUS_CACHE_TTL_MS,
  WS_IDLE_TIMEOUT_MS,
} from '../services/speedqueen';
import type { LaundryMachine } from '../../../types';

describe('SpeedQueenService — lazy WebSocket & caching', () => {
  let service: SpeedQueenService;
  let statusUpdates: Array<{ agentId: string; machines: LaundryMachine[] }>;

  beforeEach(() => {
    mockFetch.mockReset();
    statusUpdates = [];
    service = new SpeedQueenService(
      'test-key',
      'loc_d23f6c,loc_7b105b',
      (agentId, machines) => {
        statusUpdates.push({ agentId, machines: [...machines] });
      },
    );
  });

  afterEach(() => {
    service.stop();
  });

  describe('constants', () => {
    it('exports cache TTL of 30 seconds', () => {
      expect(STATUS_CACHE_TTL_MS).toBe(30_000);
    });

    it('exports WS idle timeout of 60 seconds', () => {
      expect(WS_IDLE_TIMEOUT_MS).toBe(60_000);
    });
  });

  describe('start() — no immediate connections', () => {
    it('does not connect WebSocket on start()', async () => {
      await service.start();
      expect(service.isActive()).toBe(true);

      // No fetch calls should have been made (no REST poll, no WS token)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not poll locations on start()', async () => {
      await service.start();
      // getMachines returns empty because no poll occurred
      expect(service.getMachines('Brandoa1')).toEqual([]);
      expect(service.getMachines('Brandoa2')).toEqual([]);
    });
  });

  describe('notifyUiActivity() — triggers lazy WS', () => {
    it('triggers WebSocket connection on first UI activity', async () => {
      // Mock the realtime token endpoint
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          return {
            ok: true,
            json: () => Promise.resolve({ token: 'mock-ws-token' }),
          };
        }
        if (url.includes('/v1/locations/') && url.includes('/machines')) {
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
        return { ok: true, headers: new Headers(), json: () => Promise.resolve({}) };
      });

      await service.start();
      expect(mockFetch).not.toHaveBeenCalled();

      // Trigger UI activity
      service.notifyUiActivity();

      // Wait for async connection + poll
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have attempted to get realtime token (WS connect)
      const tokenCalls = mockFetch.mock.calls.filter(
        (c: any) => c[0].includes('/v1/realtime/auth'),
      );
      expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getMachinesOnDemand() — cache TTL', () => {
    it('fetches fresh data when cache is empty', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/machines')) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([
              {
                id: 'mac_1096b5',
                status: { status: 'IN_USE', remainingSeconds: 600 },
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

      await service.start();
      const machines = await service.getMachinesOnDemand('Brandoa1');

      expect(machines.length).toBeGreaterThan(0);
      expect(machines[0].status).toBe('running');
    });

    it('returns cached data within TTL', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/machines')) {
          callCount++;
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

      await service.start();

      // First call triggers REST
      await service.getMachinesOnDemand('Brandoa1');
      const firstCallCount = callCount;

      // Second call should use cache
      await service.getMachinesOnDemand('Brandoa1');
      expect(callCount).toBe(firstCallCount); // no additional REST call
    });

    it('returns empty array for unknown agent', async () => {
      await service.start();
      const machines = await service.getMachinesOnDemand('Unknown');
      expect(machines).toEqual([]);
    });
  });

  describe('stop()', () => {
    it('cleans up timers and disconnects WS', async () => {
      await service.start();
      service.stop();
      expect(service.isActive()).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Fix #2: Repeated notifyUiActivity() during connection setup
  // -------------------------------------------------------------------
  describe('duplicate WS prevention', () => {
    it('does not create multiple WS clients from rapid notifyUiActivity calls', async () => {
      let tokenCallCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          tokenCallCount++;
          // Simulate slow token fetch
          await new Promise(r => setTimeout(r, 100));
          return {
            ok: true,
            json: () => Promise.resolve({ token: 'mock-ws-token' }),
          };
        }
        if (url.includes('/machines')) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: () => Promise.resolve([]),
          };
        }
        return { ok: true, headers: new Headers(), json: () => Promise.resolve({}) };
      });

      await service.start();

      // Rapidly call notifyUiActivity multiple times
      service.notifyUiActivity();
      service.notifyUiActivity();
      service.notifyUiActivity();
      service.notifyUiActivity();

      // Wait for async connection to complete
      await new Promise(r => setTimeout(r, 300));

      // Should only have requested 1 token (1 WS connection), not 4
      expect(tokenCallCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------
  // Fix #8: pollIntervalMs is unused (backward compat)
  // -------------------------------------------------------------------
  describe('pollIntervalMs parameter', () => {
    it('accepts pollIntervalMs for backward compat without error', () => {
      const svc = new SpeedQueenService(
        'test-key',
        'loc_d23f6c',
        () => {},
        30_000, // backward compat param
      );
      expect(svc.isActive()).toBe(false);
      svc.stop();
    });
  });
});
