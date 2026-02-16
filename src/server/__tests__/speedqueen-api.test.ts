import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setupApp = async (overrides: Record<string, string | undefined> = {}) => {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.CENTRAL_DB_PATH = ':memory:';
  process.env.CENTRAL_ENV_FILE = '/dev/null';
  process.env.ALLOW_INSECURE = 'true';
  process.env.CORS_ORIGINS = 'http://localhost';
  process.env.REQUIRE_CORS_ORIGINS = 'false';
  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
  // Do NOT set SPEEDQUEEN_API_KEY — SQ disabled by default
  delete process.env.SPEEDQUEEN_API_KEY;
  delete process.env.SPEEDQUEEN_LOCATIONS;
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('Speed Queen API Endpoints', () => {
  describe('GET /api/speedqueen/status', () => {
    it('returns disabled when no API key configured', async () => {
      const app = await setupApp();
      const res = await request(app).get('/api/speedqueen/status').expect(200);
      expect(res.body.enabled).toBe(false);
      expect(res.body.active).toBe(false);
      expect(res.body.locations).toEqual([]);
    });
  });

  describe('GET /api/agents/:id/machines (with source field)', () => {
    it('returns machines with source=camera when SQ disabled', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
      const res = await request(app).get('/api/agents/Brandoa1/machines').expect(200);
      expect(res.body.agentId).toBe('Brandoa1');
      expect(res.body.source).toBe('camera');
      expect(res.body.machines).toBeDefined();
      expect(Array.isArray(res.body.machines)).toBe(true);
    });

    it('returns default machines with unknown status', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
      const res = await request(app).get('/api/agents/Brandoa1/machines').expect(200);
      const machines = res.body.machines;
      expect(machines.length).toBeGreaterThan(0);
      machines.forEach((m: any) => {
        expect(m.status).toBe('unknown');
        expect(m.id).toBeDefined();
        expect(m.label).toBeDefined();
        expect(m.type).toMatch(/^(washer|dryer)$/);
      });
    });
  });

  describe('POST /api/agents/:id/machines (camera-based update)', () => {
    it('accepts camera-based status update', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
      const res = await request(app)
        .post('/api/agents/Brandoa1/machines')
        .send({
          machines: [
            { id: 'w1', label: 'Washer 1', type: 'washer', status: 'running' },
          ],
        })
        .expect(200);
      expect(res.body.ok).toBe(true);

      // Verify cached
      const getRes = await request(app).get('/api/agents/Brandoa1/machines').expect(200);
      expect(getRes.body.machines[0].status).toBe('running');
      expect(getRes.body.source).toBe('camera');
    });

    it('returns 400 for missing machines array', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
      await request(app)
        .post('/api/agents/Brandoa1/machines')
        .send({})
        .expect(400);
    });
  });

  describe('Machine detail endpoint (SQ disabled)', () => {
    it('returns 400 when Speed Queen not configured', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
      const res = await request(app)
        .get('/api/agents/Brandoa1/machines/w1/detail')
        .expect(400);
      expect(res.body.error).toContain('Speed Queen integration not configured');
    });
  });

  describe('Machine command endpoint (SQ disabled)', () => {
    it('returns 400 when Speed Queen not configured', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
      const res = await request(app)
        .post('/api/agents/Brandoa1/machines/w1/command')
        .send({ commandType: 'remote_start' })
        .expect(400);
      expect(res.body.error).toContain('Speed Queen integration not configured');
    });
  });

  describe('Backward compatibility', () => {
    it('still serves Brandoa2 default machines when SQ disabled', async () => {
      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa2' });
      const res = await request(app).get('/api/agents/Brandoa2/machines').expect(200);
      const machines = res.body.machines;
      // Brandoa2 has 4 washers + 6 dryers = 10
      expect(machines).toHaveLength(10);
      const washers = machines.filter((m: any) => m.type === 'washer');
      const dryers = machines.filter((m: any) => m.type === 'dryer');
      expect(washers).toHaveLength(4);
      expect(dryers).toHaveLength(6);
    });
  });
});
