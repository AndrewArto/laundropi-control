export const AGENT_STALE_MS = 8_000;
export const PENDING_RELAY_TTL_MS = 5_000;
export const CAMERA_FRAME_REFRESH_MS = 1_000;
export const CAMERA_WARMUP_MS = 15_000;
export const DEFAULT_AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID ?? 'dev-agent';
export const DEFAULT_AGENT_SECRET = (import.meta as any).env?.VITE_AGENT_SECRET ?? 'secret';
export const IS_TEST_ENV = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || false;
export const BRAND_LOGO_URL = '/washcontrol-logo.png?v=20260112';
