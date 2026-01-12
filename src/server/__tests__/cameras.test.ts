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
});
