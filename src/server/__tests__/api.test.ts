import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

const setupApp = async () => {
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
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('API basic flows', () => {
  it('registers agent and manages groups', async () => {
    const app = await setupApp();
    const agentId = 'test-agent';

    await request(app).post('/api/agents').send({ agentId, secret: 's' }).expect(200);

    const groupPayload = {
      name: 'Group1',
      entries: [{ agentId, relayIds: [1, 2] }],
      onTime: '07:00',
      offTime: '08:00',
      days: ['Mon'],
      active: true,
    };

    const createRes = await request(app).post(`/api/agents/${agentId}/groups`).send(groupPayload).expect(200);
    expect(createRes.body.name).toBe('Group1');

    const listRes = await request(app).get(`/api/agents/${agentId}/groups`).expect(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].entries[0].relayIds).toContain(1);

    const dash = await request(app).get(`/api/dashboard?agentId=${agentId}`).expect(200);
    expect(dash.body.groups.length).toBe(1);
    expect(Array.isArray(dash.body.relays)).toBe(true);
  });
});
