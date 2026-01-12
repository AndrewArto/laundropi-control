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
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
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
});
