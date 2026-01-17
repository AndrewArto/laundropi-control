import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';

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
});
