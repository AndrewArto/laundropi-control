import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

const TEST_ADMIN_PASSWORD = 'test-admin-123';
const TEST_VIEWER_PASSWORD = 'viewer-pass-456';

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
  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
  process.env.INITIAL_ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

describe('Camera API', () => {
  it('returns default camera slots', async () => {
    const app = await setupApp();
    const agentId = 'test-agent';

    const res = await request(app).get(`/api/agents/${agentId}/cameras`).expect(200);
    expect(res.body.cameras).toHaveLength(2);
    const positions = res.body.cameras.map((cam: any) => cam.position).sort();
    expect(positions).toEqual(['back', 'front']);
    const front = res.body.cameras.find((cam: any) => cam.position === 'front');
    expect(front.previewUrl).toContain(`/api/agents/${agentId}/cameras/`);
  });

  it('updates camera name', async () => {
    const app = await setupApp();
    const agentId = 'test-agent';

    const listRes = await request(app).get(`/api/agents/${agentId}/cameras`).expect(200);
    const cameraId = listRes.body.cameras[0].id;
    const updateRes = await request(app)
      .put(`/api/agents/${agentId}/cameras/${cameraId}`)
      .send({ name: 'Entrance Cam' })
      .expect(200);

    expect(updateRes.body.camera.name).toBe('Entrance Cam');
  });

  it('keeps mock cameras enabled when toggled', async () => {
    const app = await setupApp();
    const agentId = 'test-agent';

    const listRes = await request(app).get(`/api/agents/${agentId}/cameras`).expect(200);
    const cameraId = listRes.body.cameras[0].id;

    const updateRes = await request(app)
      .put(`/api/agents/${agentId}/cameras/${cameraId}`)
      .send({ enabled: true })
      .expect(200);

    expect(updateRes.body.camera.enabled).toBe(true);

    const listRes2 = await request(app).get(`/api/agents/${agentId}/cameras`).expect(200);
    const updated = listRes2.body.cameras.find((cam: any) => cam.id === cameraId);
    expect(updated.enabled).toBe(true);
  });

  it('rejects non-rtsp sources unless allowed', async () => {
    const agentId = 'test-agent';
    const app = await setupApp();
    const listRes = await request(app).get(`/api/agents/${agentId}/cameras`).expect(200);
    const cameraId = listRes.body.cameras[0].id;

    await request(app)
      .put(`/api/agents/${agentId}/cameras/${cameraId}`)
      .send({ sourceType: 'rtsp', rtspUrl: 'ffmpeg:device?video=TestCam' })
      .expect(400);

    const appWithAllow = await setupApp({ CAMERA_ALLOW_NON_RTSP: 'true' });
    const listRes2 = await request(appWithAllow).get(`/api/agents/${agentId}/cameras`).expect(200);
    const cameraId2 = listRes2.body.cameras[0].id;
    const updateRes = await request(appWithAllow)
      .put(`/api/agents/${agentId}/cameras/${cameraId2}`)
      .send({ sourceType: 'rtsp', rtspUrl: 'ffmpeg:device?video=TestCam' })
      .expect(200);

    expect(updateRes.body.camera.rtspUrl).toBe('ffmpeg:device?video=TestCam');
  });

  it('allows viewers to toggle camera enabled state', async () => {
    const app = await setupAppWithAuth();
    const admin = request.agent(app);
    const viewer = request.agent(app);
    const agentId = 'test-agent';

    // Login as admin and create a viewer user
    await admin.post('/auth/login').send({ username: 'admin', password: TEST_ADMIN_PASSWORD }).expect(200);
    await admin.post('/api/users').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD, role: 'viewer' }).expect(200);

    // Get camera list as admin
    const listRes = await admin.get(`/api/agents/${agentId}/cameras`).expect(200);
    const cameraId = listRes.body.cameras[0].id;
    const initialEnabled = listRes.body.cameras[0].enabled;

    // Login as viewer
    await viewer.post('/auth/login').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD }).expect(200);

    // Viewer can toggle camera enabled state
    const updateRes = await viewer
      .put(`/api/agents/${agentId}/cameras/${cameraId}`)
      .send({ enabled: !initialEnabled })
      .expect(200);

    expect(updateRes.body.camera.enabled).toBe(!initialEnabled);

    // Verify the change persisted
    const listRes2 = await viewer.get(`/api/agents/${agentId}/cameras`).expect(200);
    const updated = listRes2.body.cameras.find((cam: any) => cam.id === cameraId);
    expect(updated.enabled).toBe(!initialEnabled);
  });

  it('blocks viewers from changing camera settings other than enabled', async () => {
    const app = await setupAppWithAuth();
    const admin = request.agent(app);
    const viewer = request.agent(app);
    const agentId = 'test-agent';

    await admin.post('/auth/login').send({ username: 'admin', password: TEST_ADMIN_PASSWORD }).expect(200);
    await admin.post('/api/users').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD, role: 'viewer' }).expect(200);

    const listRes = await admin.get(`/api/agents/${agentId}/cameras`).expect(200);
    const cameraId = listRes.body.cameras[0].id;

    await viewer.post('/auth/login').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD }).expect(200);

    await viewer
      .put(`/api/agents/${agentId}/cameras/${cameraId}`)
      .send({ name: 'Viewer Rename Attempt' })
      .expect(403);
  });

  it('blocks viewers from posting machine status updates', async () => {
    const app = await setupAppWithAuth();
    const admin = request.agent(app);
    const viewer = request.agent(app);
    const agentId = 'test-agent';

    await admin.post('/auth/login').send({ username: 'admin', password: TEST_ADMIN_PASSWORD }).expect(200);
    await admin.post('/api/users').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD, role: 'viewer' }).expect(200);
    await viewer.post('/auth/login').send({ username: 'viewer1', password: TEST_VIEWER_PASSWORD }).expect(200);

    await viewer
      .post(`/api/agents/${agentId}/machines`)
      .send({ machines: [{ id: 'w1', label: 'Washer 1', type: 'washer', status: 'running' }] })
      .expect(403);

    await admin
      .post(`/api/agents/${agentId}/machines`)
      .send({ machines: [{ id: 'w1', label: 'Washer 1', type: 'washer', status: 'running' }] })
      .expect(200);
  });
});
