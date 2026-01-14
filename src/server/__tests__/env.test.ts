import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const restoreEnv = (snapshot: NodeJS.ProcessEnv) => {
  Object.keys(process.env).forEach((key) => {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, snapshot);
};

describe('central env loading', () => {
  it('loads CENTRAL_DB_PATH from env file before DB init', async () => {
    vi.resetModules();
    const envSnapshot = { ...process.env };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laundropi-env-'));
    const dbPath = path.join(tmpDir, 'central.db');
    const envPath = path.join(tmpDir, 'central.env');
    fs.writeFileSync(envPath, `CENTRAL_DB_PATH=${dbPath}\n`, 'utf8');
    process.env.CENTRAL_ENV_FILE = envPath;
    delete process.env.CENTRAL_DB_PATH;

    try {
      await import('../db');
      expect(process.env.CENTRAL_DB_PATH).toBe(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
    } finally {
      restoreEnv(envSnapshot);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures
      }
    }
  });
});
