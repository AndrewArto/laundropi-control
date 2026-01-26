import request from 'supertest';
import { describe, it, expect, vi, beforeAll } from 'vitest';

const TEST_ADMIN_PASSWORD = 'test-admin-123';
const TEST_VIEWER_PASSWORD = 'viewer-pass-456';

const setupApp = async () => {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.CENTRAL_DB_PATH = ':memory:';
  process.env.CENTRAL_ENV_FILE = '/dev/null';
  process.env.ALLOW_INSECURE = 'true';
  process.env.CORS_ORIGINS = 'http://localhost';
  process.env.REQUIRE_CORS_ORIGINS = 'false';
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

const setupAppWithAuth = async () => {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.CENTRAL_DB_PATH = ':memory:';
  process.env.CENTRAL_ENV_FILE = '/dev/null';
  process.env.ALLOW_INSECURE = 'false';
  process.env.REQUIRE_UI_AUTH = 'true';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.SESSION_COOKIE_SECURE = 'false';
  process.env.CORS_ORIGINS = 'http://localhost';
  process.env.REQUIRE_CORS_ORIGINS = 'false';
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
  process.env.INITIAL_ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('Revenue API', () => {
  it('creates, updates, and summarizes revenue entries', async () => {
    const app = await setupApp();
    const agentId = 'Laundry-1';
    const entryDate = '2026-01-07';

    const createPayload = {
      entryDate,
      coinsTotal: 120,
      euroCoinsCount: 40,
      billsTotal: 55,
      deductions: [{ amount: 10, comment: 'Cleaning' }],
    };

    const created = await request(app)
      .put(`/api/revenue/${agentId}`)
      .send(createPayload)
      .expect(200);

    expect(created.body.entry.agentId).toBe(agentId);
    expect(created.body.entry.entryDate).toBe(entryDate);
    expect(created.body.entry.deductionsTotal).toBe(10);
    expect(created.body.entry.hasEdits).toBe(false);

    const extraPayload = {
      entryDate: '2026-01-09',
      coinsTotal: 0,
      euroCoinsCount: 0,
      billsTotal: 0,
      deductions: [{ amount: 5, comment: 'Maintenance' }],
    };

    await request(app)
      .put(`/api/revenue/${agentId}`)
      .send(extraPayload)
      .expect(200);

    const otherAgentId = 'Laundry-2';
    const otherPayload = {
      entryDate: '2026-01-08',
      coinsTotal: 50,
      euroCoinsCount: 15,
      billsTotal: 20,
      deductions: [{ amount: 20, comment: 'Repairs' }],
    };

    await request(app)
      .put(`/api/revenue/${otherAgentId}`)
      .send(otherPayload)
      .expect(200);

    const updatePayload = {
      entryDate,
      coinsTotal: 130,
      euroCoinsCount: 41,
      billsTotal: 60,
      deductions: [],
    };

    const updated = await request(app)
      .put(`/api/revenue/${agentId}`)
      .send(updatePayload)
      .expect(200);

    expect(updated.body.entry.coinsTotal).toBe(130);
    expect(updated.body.entry.hasEdits).toBe(true);
    const auditFields = (updated.body.audit || [])
      .filter((item: any) => item.oldValue !== null)
      .map((item: any) => item.field);
    expect(auditFields).toContain('coinsTotal');

    const summary = await request(app)
      .get(`/api/revenue/summary?date=${entryDate}`)
      .expect(200);

    expect(summary.body.week.overall).toBe(180);
    expect(summary.body.month.overall).toBe(180);
    expect(summary.body.week.profitLossOverall).toBe(155);
    expect(summary.body.month.profitLossOverall).toBe(155);
    expect(summary.body.week.totalsByAgent[agentId]).toBe(130);
    expect(summary.body.week.profitLossByAgent[agentId]).toBe(125);
    expect(summary.body.week.totalsByAgent[otherAgentId]).toBe(50);
    expect(summary.body.week.profitLossByAgent[otherAgentId]).toBe(30);
  });

  it('allows viewers to read revenue but not write', async () => {
    const app = await setupAppWithAuth();
    const admin = request.agent(app);
    const viewer = request.agent(app);
    const agentId = 'Laundry-1';
    const entryDate = '2026-01-10';

    // Login as admin and create a viewer user
    await admin.post('/auth/login').send({ username: 'admin', password: TEST_ADMIN_PASSWORD }).expect(200);
    await admin.post('/api/users').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD, role: 'viewer' }).expect(200);

    // Admin creates a revenue entry
    const createPayload = {
      entryDate,
      coinsTotal: 100,
      euroCoinsCount: 30,
      billsTotal: 50,
      deductions: [],
    };
    await admin.put(`/api/revenue/${agentId}`).send(createPayload).expect(200);

    // Login as viewer
    await viewer.post('/auth/login').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD }).expect(200);

    // Viewer can read revenue summary (GET)
    const summary = await viewer.get(`/api/revenue/summary?date=${entryDate}`).expect(200);
    expect(summary.body).toHaveProperty('week');
    expect(summary.body).toHaveProperty('month');

    // Viewer can read revenue entries (GET)
    const entries = await viewer.get(`/api/revenue/entries?startDate=${entryDate}&endDate=${entryDate}`).expect(200);
    expect(Array.isArray(entries.body.entries)).toBe(true);

    // Viewer cannot write revenue (PUT) - should get 403
    const updatePayload = {
      entryDate,
      coinsTotal: 200,
      euroCoinsCount: 60,
      billsTotal: 100,
      deductions: [],
    };
    await viewer.put(`/api/revenue/${agentId}`).send(updatePayload).expect(403);
  });
});
