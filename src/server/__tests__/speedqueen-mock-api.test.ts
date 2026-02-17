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
  delete process.env.SPEEDQUEEN_API_KEY;
  delete process.env.SPEEDQUEEN_LOCATIONS;
  delete process.env.SPEEDQUEEN_MOCK;
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  const mod = await import('../index');
  return mod;
};

describe('Speed Queen Mock API', () => {
  describe('SPEEDQUEEN_MOCK=true', () => {
    it('enables Speed Queen even without API key', async () => {
      const { app, initSpeedQueen } = await setupApp({
        SPEEDQUEEN_MOCK: 'true',
        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
      });

      // In tests, initSpeedQueen() must be called explicitly (server.listen doesn't run)
      initSpeedQueen();
      await new Promise(resolve => setTimeout(resolve, 100));

      const res = await request(app as any).get('/api/speedqueen/status').expect(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.active).toBe(true);
    });

    it('returns mock machines for Brandoa1', async () => {
      const { app, initSpeedQueen } = await setupApp({
        SPEEDQUEEN_MOCK: 'true',
        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
      });

      initSpeedQueen();
      await new Promise(resolve => setTimeout(resolve, 200));

      const res = await request(app as any).get('/api/agents/Brandoa1/machines').expect(200);
      expect(res.body.agentId).toBe('Brandoa1');
      expect(res.body.machines.length).toBe(8);
      expect(res.body.source).toBe('speedqueen');

      // Verify machine structure
      const machine = res.body.machines[0];
      expect(machine).toHaveProperty('id');
      expect(machine).toHaveProperty('label');
      expect(machine).toHaveProperty('type');
      expect(machine).toHaveProperty('status');
      expect(machine).toHaveProperty('source', 'speedqueen');
      expect(machine).toHaveProperty('speedqueenId');
      expect(machine).toHaveProperty('model');
    });

    it('returns mock machines for Brandoa2', async () => {
      const { app, initSpeedQueen } = await setupApp({
        SPEEDQUEEN_MOCK: 'true',
        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
      });

      initSpeedQueen();
      await new Promise(resolve => setTimeout(resolve, 200));

      const res = await request(app as any).get('/api/agents/Brandoa2/machines').expect(200);
      expect(res.body.machines.length).toBe(10);
    });

    it('supports machine commands in mock mode', async () => {
      const { app, initSpeedQueen } = await setupApp({
        SPEEDQUEEN_MOCK: 'true',
        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
      });

      initSpeedQueen();
      await new Promise(resolve => setTimeout(resolve, 200));

      const res = await request(app as any)
        .post('/api/agents/Brandoa1/machines/w1/command')
        .send({ commandType: 'remote_start', params: { cycleId: 'cyc_normal_80' } })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.command.id).toMatch(/^mock_cmd_/);
      expect(res.body.command.status).toBe('completed');
    });

    it('returns machine detail with mock cycles', async () => {
      const { app, initSpeedQueen } = await setupApp({
        SPEEDQUEEN_MOCK: 'true',
        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
      });

      initSpeedQueen();
      await new Promise(resolve => setTimeout(resolve, 200));

      const res = await request(app as any)
        .get('/api/agents/Brandoa1/machines/w1/detail')
        .expect(200);

      expect(res.body.machine).toBeDefined();
      expect(res.body.cycles).toBeDefined();
      expect(res.body.cycles.length).toBeGreaterThan(0);
      expect(res.body.locationId).toBe('loc_d23f6c');
      expect(res.body.speedqueenId).toBe('mac_1096b5');
      expect(res.body.model).toBe('SY80U');
    });
  });

  describe('SPEEDQUEEN_MOCK=false (default)', () => {
    it('does not enable Speed Queen without API key', async () => {
      const { app } = await setupApp({
        SPEEDQUEEN_MOCK: 'false',
        LAUNDRY_IDS: 'Brandoa1',
      });

      const res = await request(app as any).get('/api/speedqueen/status').expect(200);
      expect(res.body.enabled).toBe(false);
    });
  });
});
