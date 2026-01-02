import request from 'supertest';

const setupApp = async () => {
  process.env.NODE_ENV = 'test';
  process.env.CENTRAL_DB_PATH = ':memory:';
  process.env.UI_TOKEN = 'test-token';
  process.env.REQUIRE_UI_TOKEN = 'true';
  process.env.CORS_ORIGINS = 'http://localhost';
  process.env.REQUIRE_CORS_ORIGINS = 'true';
  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('API basic flows', () => {
  it('registers agent and manages groups', async () => {
    const app = await setupApp();
    const agentId = 'test-agent';
    const auth = { Authorization: 'Bearer test-token' };

    await request(app).post('/api/agents').set(auth).send({ agentId, secret: 's' }).expect(200);

    const groupPayload = {
      name: 'Group1',
      entries: [{ agentId, relayIds: [1, 2] }],
      onTime: '07:00',
      offTime: '08:00',
      days: ['Mon'],
      active: true,
    };

    const createRes = await request(app).post(`/api/agents/${agentId}/groups`).set(auth).send(groupPayload).expect(200);
    expect(createRes.body.name).toBe('Group1');

    const listRes = await request(app).get(`/api/agents/${agentId}/groups`).set(auth).expect(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0].entries[0].relayIds).toContain(1);

    const dash = await request(app).get(`/api/dashboard?agentId=${agentId}`).set(auth).expect(200);
    expect(dash.body.groups.length).toBe(1);
    expect(Array.isArray(dash.body.relays)).toBe(true);
  });
});
