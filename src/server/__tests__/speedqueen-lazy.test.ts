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

describe('SpeedQueenService — always-on WebSocket & caching', () => {
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

  describe('start() — always-on WebSocket', () => {
    it('connects WebSocket immediately on start()', async () => {
      // Mock WS auth + initial poll so start() completes
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
        }
        if (url.includes('/machines')) {
          return {
            ok: true,
            headers: { get: () => 'application/json' },
            json: () => Promise.resolve([
              { id: 'mac_1096b5', status: { statusId: 'AVAILABLE', remainingSeconds: 0 } },
            ]),
          };
        }
        return { ok: true, json: () => Promise.resolve({}) };
      });

      await service.start();
      // Wait for the fire-and-forget ensureWsConnected to complete
      await new Promise(r => setTimeout(r, 100));

      expect(service.isActive()).toBe(true);
      // WS auth token should have been requested
      const tokenCalls = mockFetch.mock.calls.filter(
        (c: any) => c[0].includes('/v1/realtime/auth'),
      );
      expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('notifyUiActivity() — keeps WS alive', () => {
    it('does not create additional WS connection if already connected from start()', async () => {
      let tokenCallCount = 0;
      // Mock the realtime token endpoint
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          tokenCallCount++;
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
                status: { statusId: 'AVAILABLE', remainingSeconds: 0 },
              },
            ]),
          };
        }
        return { ok: true, headers: new Headers(), json: () => Promise.resolve({}) };
      });

      await service.start();
      // Wait for the fire-and-forget ensureWsConnected to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // start() should have initiated WS connection (1 token call)
      expect(tokenCallCount).toBe(1);

      // Trigger UI activity — should not create a new WS since already connected
      service.notifyUiActivity();
      await new Promise(resolve => setTimeout(resolve, 50));

      // No additional token calls — WS was already connected
      expect(tokenCallCount).toBe(1);
    });
  });

  describe('getMachinesOnDemand() — cache TTL', () => {
    it('fetches fresh data when cache is empty', async () => {
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
                status: { statusId: 'IN_USE', remainingSeconds: 600 },
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
        if (url.includes('/v1/realtime/auth')) {
          return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
        }
        if (url.includes('/machines')) {
          callCount++;
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

      await service.start();

      // First call triggers REST
      await service.getMachinesOnDemand('Brandoa1');
      const firstCallCount = callCount;

      // Second call should use cache
      await service.getMachinesOnDemand('Brandoa1');
      expect(callCount).toBe(firstCallCount); // no additional REST call
    });

    it('returns empty array for unknown agent', async () => {
      // Mock fetch to handle start()'s WS connection attempt
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
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
      const machines = await service.getMachinesOnDemand('Unknown');
      expect(machines).toEqual([]);
    });
  });

  describe('stop()', () => {
    it('cleans up timers and disconnects WS', async () => {
      // Mock fetch to handle start()'s WS connection attempt
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          return { ok: true, json: () => Promise.resolve({ token: 'test-token' }) };
        }
        return { ok: true, headers: new Headers(), json: () => Promise.resolve({}) };
      });

      await service.start();
      service.stop();
      expect(service.isActive()).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Fix #2: Repeated notifyUiActivity() does not create extra WS connections
  // -------------------------------------------------------------------
  describe('duplicate WS prevention', () => {
    it('does not create extra WS connections from rapid notifyUiActivity calls after start()', async () => {
      // Wait for any leaked async operations from prior tests to settle
      await new Promise(r => setTimeout(r, 200));

      let tokenCallCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/realtime/auth')) {
          tokenCallCount++;
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
      // Wait for start()'s fire-and-forget ensureWsConnected to complete
      await new Promise(r => setTimeout(r, 100));
      const countAfterStart = tokenCallCount;

      // Rapidly call notifyUiActivity multiple times — WS is already connected
      service.notifyUiActivity();
      service.notifyUiActivity();
      service.notifyUiActivity();
      service.notifyUiActivity();

      // Wait for any async work
      await new Promise(r => setTimeout(r, 100));

      // notifyUiActivity calls should not create additional WS connections
      // because the WS is already connected from start()
      expect(tokenCallCount).toBe(countAfterStart);
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
