import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

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
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('User management API', () => {
  it('creates users and tracks last login', async () => {
    const app = await setupApp();
    const admin = request.agent(app);

    await admin.post('/auth/login').send({ username: 'admin', password: 'admin' }).expect(200);

    const initial = await admin.get('/api/users').expect(200);
    expect(initial.body.some((u: any) => u.username === 'admin')).toBe(true);

    await admin.post('/api/users').send({ username: 'bob', password: 'pw', role: 'user' }).expect(200);
    await admin.put('/api/users/bob/role').send({ role: 'admin' }).expect(200);
    await admin.put('/api/users/bob/password').send({ password: 'newpw' }).expect(200);

    const bobAgent = request.agent(app);
    await bobAgent.post('/auth/login').send({ username: 'bob', password: 'newpw' }).expect(200);

    const listAfter = await admin.get('/api/users').expect(200);
    const bob = listAfter.body.find((u: any) => u.username === 'bob');
    expect(bob).toBeTruthy();
    expect(bob.lastLoginAt).not.toBeNull();
  });
});
