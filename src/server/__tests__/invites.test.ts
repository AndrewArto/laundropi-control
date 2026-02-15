import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

const TEST_ADMIN_PASSWORD = 'test-admin-password-123';
const TEST_VIEWER_PASSWORD = 'viewer-password-456';

const setupApp = async () => {
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
  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
  process.env.INITIAL_ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
  process.env.VIEWER_DEFAULT_EXPIRY_DAYS = '30';
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('Invite API authorization and expiry', () => {
  it('blocks viewers from managing invites', async () => {
    const app = await setupApp();
    const admin = request.agent(app);
    const viewer = request.agent(app);

    await admin.post('/auth/login').send({ username: 'admin', password: TEST_ADMIN_PASSWORD }).expect(200);
    await admin.post('/api/users').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD, role: 'viewer' }).expect(200);
    await viewer.post('/auth/login').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD }).expect(200);

    await viewer
      .post('/api/invites')
      .send({ email: 'new-viewer@example.com', expiryDays: 7 })
      .expect(403);

    await viewer
      .get('/api/invites')
      .expect(403);

    await viewer
      .delete('/api/invites/doesnotmatter')
      .expect(403);
  });

  it('uses per-invite expiry when creating account from token', async () => {
    const app = await setupApp();
    const admin = request.agent(app);

    await admin.post('/auth/login').send({ username: 'admin', password: TEST_ADMIN_PASSWORD }).expect(200);

    const now = Date.now();
    const inviteRes = await admin
      .post('/api/invites')
      .send({ email: 'invited@example.com', expiryDays: 2 })
      .expect(200);

    const pending = await admin.get('/api/invites').expect(200);
    expect(pending.body[0].createdBy).toBe('admin');

    const mockUrl = String(inviteRes.body?.mockUrl || '');
    expect(mockUrl).toContain('token=');
    const token = new URL(mockUrl).searchParams.get('token');
    expect(token).toBeTruthy();
    const inviteToken = String(token);

    await request(app).get(`/api/invites/validate/${inviteToken}`).expect(200);
    await request(app)
      .post(`/api/invites/complete/${inviteToken}`)
      .send({ password: 'viewer-pass-1234' })
      .expect(200);

    const db = await import('../db');
    const createdUser = db.getUiUser('invited@example.com');
    expect(createdUser).toBeTruthy();
    expect(createdUser?.expiresAt).toBeTruthy();

    const expected = 2 * 24 * 60 * 60 * 1000;
    expect(createdUser!.expiresAt!).toBeGreaterThanOrEqual(now + expected - 60_000);
    expect(createdUser!.expiresAt!).toBeLessThanOrEqual(now + expected + 60_000);
    expect(createdUser!.expiresAt!).toBeLessThan(now + (3 * 24 * 60 * 60 * 1000));
  });
});
