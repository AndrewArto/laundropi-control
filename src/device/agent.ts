import * as dotenv from 'dotenv';
import WebSocket = require('ws');
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { gpio } from './gpio';
import { createScheduler, ScheduleEntry } from './scheduler';
import { RELAYS_CONFIG } from './config';
import { analyzeFrame, getMachineConfig } from './machineDetection';
import type { LaundryMachine } from '../../types';

dotenv.config({ path: process.env.AGENT_ENV_FILE || '.env.agent' });

const argv = process.argv.slice(2);
const parseArg = (flag: string): string | undefined => {
  const idx = argv.findIndex(a => a === flag);
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  const kv = argv.find(a => a.startsWith(`${flag}=`));
  return kv ? kv.split('=').slice(1).join('=') : undefined;
};

const AGENT_ID = parseArg('--id') || process.env.AGENT_ID || 'agent-dev';
const AGENT_SECRET = process.env.AGENT_SECRET || 'secret';
const AGENT_WS_URL = process.env.AGENT_WS_URL || 'ws://localhost:4000/agent';
const SCHEDULE_STORAGE_PATH = process.env.AGENT_SCHEDULE_PATH || '/var/lib/laundropi/schedule.json';
const GO2RTC_CONFIG_PATH = process.env.GO2RTC_CONFIG_PATH || '/var/lib/laundropi/go2rtc.yaml';
const GO2RTC_API_URL = process.env.GO2RTC_API_URL || 'http://127.0.0.1:1984';
const GO2RTC_FRAME_PATH = process.env.GO2RTC_FRAME_PATH || '/api/frame.jpeg';
const GO2RTC_RELOAD_URL = process.env.GO2RTC_RELOAD_URL || '';
const parseDurationMs = (value: string | undefined, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const CAMERA_FRAME_FETCH_TIMEOUT_MS = parseDurationMs(process.env.CAMERA_FRAME_FETCH_TIMEOUT_MS, 3000);
const CAMERA_FRAME_CACHE_MS = parseDurationMs(process.env.CAMERA_FRAME_CACHE_MS, 5000);
const MACHINE_DETECTION_INTERVAL_MS = parseDurationMs(process.env.MACHINE_DETECTION_INTERVAL_MS, 10000); // 10s default
const MACHINE_DETECTION_ENABLED = process.env.MACHINE_DETECTION_ENABLED !== 'false';

let ws: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let machineDetectionTimer: NodeJS.Timeout | null = null;
let lastMachineStatus: LaundryMachine[] = [];

const ensureScheduleDir = () => {
  const dir = path.dirname(SCHEDULE_STORAGE_PATH);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.warn(`[agent] failed to ensure schedule dir ${dir}`, err);
  }
};

ensureScheduleDir();

const scheduler = createScheduler(
  (relayId, state) => gpio.setRelayState(relayId, state),
  () => gpio.getSnapshotWithTimestamps(),
  SCHEDULE_STORAGE_PATH
);
scheduler.startScheduler();
let scheduleVersion: string | null = null;

type CameraConfig = {
  id: string;
  name: string;
  position: string;
  sourceType: string;
  enabled: boolean;
  streamKey: string;
  rtspUrl: string | null;
};

let cameraConfigs: CameraConfig[] = [];
const cameraConfigById = new Map<string, CameraConfig>();
const cameraFrameCache = new Map<string, { ts: number; contentType: string; data: string }>();
const cameraFrameInFlight = new Map<string, Promise<FrameResult>>();
let lastGo2rtcPayload: string | null = null;

const ensureGo2rtcDir = () => {
  const dir = path.dirname(GO2RTC_CONFIG_PATH);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.warn(`[agent] failed to ensure go2rtc dir ${dir}`, err);
  }
};

ensureGo2rtcDir();

const buildGo2rtcConfig = (cameras: CameraConfig[]) => {
  const lines: string[] = ['streams:'];
  const sources = cameras.filter(cam => cam.sourceType === 'rtsp' && cam.rtspUrl);
  if (!sources.length) {
    lines.push('  # no RTSP camera sources configured');
  } else {
    sources.forEach(cam => {
      const quoted = JSON.stringify(cam.rtspUrl);
      lines.push(`  ${cam.streamKey}: ${quoted}`);
    });
  }
  return `${lines.join('\n')}\n`;
};

const writeGo2rtcConfig = (cameras: CameraConfig[]) => {
  try {
    const payload = buildGo2rtcConfig(cameras);
    if (payload === lastGo2rtcPayload) return;
    try {
      if (fs.existsSync(GO2RTC_CONFIG_PATH)) {
        const existing = fs.readFileSync(GO2RTC_CONFIG_PATH, 'utf8');
        if (existing === payload) {
          lastGo2rtcPayload = payload;
          return;
        }
      }
    } catch (err) {
      console.warn('[agent] failed to read existing go2rtc config', err);
    }
    fs.writeFileSync(GO2RTC_CONFIG_PATH, payload, 'utf8');
    lastGo2rtcPayload = payload;
    if (GO2RTC_RELOAD_URL) {
      void fetch(GO2RTC_RELOAD_URL, { method: 'POST' }).catch(err => {
        console.warn('[agent] go2rtc reload failed', err);
      });
    } else {
      console.log('[agent] go2rtc config updated (restart required)');
    }
  } catch (err) {
    console.warn('[agent] failed to write go2rtc config', err);
  }
};

function connect() {
  console.log(`[agent] connecting to ${AGENT_WS_URL} as ${AGENT_ID}`);
  ws = new WebSocket(AGENT_WS_URL);

  ws.on('open', () => {
    console.log('[agent] connected');
    send({
      type: 'hello',
      agentId: AGENT_ID,
      secret: AGENT_SECRET,
      version: '1.0.0',
      relays: RELAYS_CONFIG,
    });
    startHeartbeat();
    startMachineDetection();
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (err) {
      console.error('[agent] failed to parse message', err);
    }
  });

  ws.on('close', () => {
    console.warn('[agent] socket closed, retrying in 3s');
    stopHeartbeat();
    stopMachineDetection();
    setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error('[agent] socket error', err);
  });
}

type IncomingMessage =
  | { type: 'set_relay'; relayId: number; state: 'on' | 'off' }
  | { type: 'update_schedule'; schedules: ScheduleEntry[]; version?: string }
  | { type: 'update_cameras'; cameras: CameraConfig[] }
  | { type: 'camera_frame_request'; cameraId: string; requestId: string };

function handleMessage(msg: IncomingMessage) {
  if (msg.type === 'update_cameras') {
    console.log(`[agent] incoming message update_cameras count=${Array.isArray(msg.cameras) ? msg.cameras.length : 0}`);
  } else if (msg.type === 'camera_frame_request') {
    console.log('[agent] incoming message camera_frame_request', msg.cameraId);
  } else {
    console.log('[agent] incoming message', msg);
  }
  if (msg.type === 'set_relay') {
    gpio.setRelayState(msg.relayId, msg.state);
    console.log(`[agent] set_relay relay=${msg.relayId} state=${msg.state}`);
    // Push immediate status so UI doesn't wait for heartbeat tick
    sendStatus();
  }
  if (msg.type === 'update_schedule') {
    scheduler.setSchedule(msg.schedules);
    scheduleVersion = (msg as any).version || null;
    console.log(`[agent] update_schedule entries=${msg.schedules.length} version=${scheduleVersion || 'n/a'}`);
    sendStatus();
  }
  if (msg.type === 'update_cameras') {
    const list = Array.isArray(msg.cameras) ? msg.cameras : [];
    cameraConfigs = list.map((cam) => ({
      id: String(cam.id || ''),
      name: String(cam.name || ''),
      position: String(cam.position || 'front'),
      sourceType: String(cam.sourceType || 'pattern'),
      enabled: Boolean(cam.enabled),
      streamKey: String(cam.streamKey || cam.id || ''),
      rtspUrl: cam.rtspUrl ? String(cam.rtspUrl) : null,
    })).filter(cam => cam.id && cam.streamKey);
    cameraConfigById.clear();
    cameraConfigs.forEach(cam => cameraConfigById.set(cam.id, cam));
    console.log(`[agent] update_cameras count=${cameraConfigs.length}`);
    writeGo2rtcConfig(cameraConfigs);
  }
  if (msg.type === 'camera_frame_request') {
    void handleCameraFrameRequest(msg.cameraId, msg.requestId);
  }
}

async function handleCameraFrameRequest(cameraId: string, requestId: string) {
  const camera = cameraConfigById.get(cameraId);
  if (!camera) {
    send({ type: 'camera_frame', requestId, ok: false, error: 'camera not found' });
    return;
  }
  if (!camera.enabled) {
    send({ type: 'camera_frame', requestId, ok: false, error: 'camera disabled' });
    return;
  }
  if (camera.sourceType !== 'rtsp' || !camera.rtspUrl) {
    send({ type: 'camera_frame', requestId, ok: false, error: 'camera not configured' });
    return;
  }
  const result = await getCameraFrame(camera);
  if (result.ok) {
    send({
      type: 'camera_frame',
      requestId,
      ok: true,
      contentType: result.contentType,
      data: result.data,
    });
    return;
  }
  send({ type: 'camera_frame', requestId, ok: false, error: result.error });
}

type FrameResult =
  | { ok: true; contentType: string; data: string; ts: number }
  | { ok: false; error: string; ts: number };

const getCachedFrame = (cameraId: string) => {
  if (CAMERA_FRAME_CACHE_MS <= 0) return null;
  const cached = cameraFrameCache.get(cameraId);
  if (!cached) return null;
  if (Date.now() - cached.ts > CAMERA_FRAME_CACHE_MS) {
    cameraFrameCache.delete(cameraId);
    return null;
  }
  return cached;
};

const fetchCameraFrame = async (camera: CameraConfig): Promise<FrameResult> => {
  const timestamp = Date.now();
  try {
    const base = GO2RTC_API_URL.replace(/\/$/, '');
    const pathPart = GO2RTC_FRAME_PATH.startsWith('/') ? GO2RTC_FRAME_PATH : `/${GO2RTC_FRAME_PATH}`;
    const url = new URL(`${base}${pathPart}`);
    url.searchParams.set('src', camera.streamKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CAMERA_FRAME_FETCH_TIMEOUT_MS);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, error: `go2rtc ${res.status}`, ts: timestamp };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      return { ok: false, error: 'empty frame', ts: timestamp };
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return { ok: true, contentType, data: buf.toString('base64'), ts: timestamp };
  } catch (err) {
    return { ok: false, error: 'frame fetch failed', ts: timestamp };
  }
};

const getCameraFrame = async (camera: CameraConfig): Promise<FrameResult> => {
  const cached = getCachedFrame(camera.id);
  if (cached) {
    return { ok: true, contentType: cached.contentType, data: cached.data, ts: cached.ts };
  }
  let inflight = cameraFrameInFlight.get(camera.id);
  if (!inflight) {
    inflight = fetchCameraFrame(camera).finally(() => {
      cameraFrameInFlight.delete(camera.id);
    });
    cameraFrameInFlight.set(camera.id, inflight);
  }
  const result = await inflight;
  if (result.ok && CAMERA_FRAME_CACHE_MS > 0) {
    cameraFrameCache.set(camera.id, { ts: result.ts, contentType: result.contentType, data: result.data });
  }
  return result;
};

function send(payload: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendStatus() {
  send({
    type: 'heartbeat',
    agentId: AGENT_ID,
    status: {
      relays: gpio.getSnapshot(),
      time: new Date().toISOString(),
      meta: RELAYS_CONFIG,
      isMock: gpio.isMock(),
      driver: gpio.getDriver(),
      scheduleVersion,
    },
  });
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(sendStatus, 2000);
  sendStatus(); // initial
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// --- Machine Detection ---

/**
 * Decode JPEG buffer to raw RGB buffer using sharp.
 * Returns { buffer, width, height } or null on error.
 */
async function decodeJpegToRgb(jpegBuffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const image = sharp(jpegBuffer);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) return null;

    const rgbBuffer = await image
      .removeAlpha()
      .raw()
      .toBuffer();

    return { buffer: rgbBuffer, width: metadata.width, height: metadata.height };
  } catch (err) {
    console.warn('[agent] failed to decode JPEG frame', err);
    return null;
  }
}

/**
 * Fetch and analyze frames from cameras for machine detection.
 */
async function runMachineDetection() {
  const config = getMachineConfig(AGENT_ID);
  if (!config) {
    console.log(`[agent] no machine config for ${AGENT_ID}, skipping detection`);
    return;
  }

  // Find cameras by position (front/back)
  const frontCamera = cameraConfigs.find(c => c.position === 'front' && c.enabled && c.sourceType === 'rtsp' && c.rtspUrl);
  const backCamera = cameraConfigs.find(c => c.position === 'back' && c.enabled && c.sourceType === 'rtsp' && c.rtspUrl);

  const allResults: LaundryMachine[] = [];

  // Analyze front camera
  if (frontCamera) {
    const result = await getCameraFrame(frontCamera);
    if (result.ok) {
      const jpegBuffer = Buffer.from(result.data, 'base64');
      const decoded = await decodeJpegToRgb(jpegBuffer);
      if (decoded) {
        const machines = analyzeFrame(AGENT_ID, 'front', decoded.buffer, decoded.width, decoded.height);
        allResults.push(...machines);
      }
    }
  }

  // Analyze back camera
  if (backCamera) {
    const result = await getCameraFrame(backCamera);
    if (result.ok) {
      const jpegBuffer = Buffer.from(result.data, 'base64');
      const decoded = await decodeJpegToRgb(jpegBuffer);
      if (decoded) {
        const machines = analyzeFrame(AGENT_ID, 'back', decoded.buffer, decoded.width, decoded.height);
        allResults.push(...machines);
      }
    }
  }

  if (allResults.length > 0) {
    lastMachineStatus = allResults;
    // Send machine status update to central server
    send({
      type: 'machine_status',
      agentId: AGENT_ID,
      machines: allResults,
    });
    console.log(`[agent] machine detection complete: ${allResults.map(m => `${m.id}=${m.status}`).join(', ')}`);
  }
}

function startMachineDetection() {
  if (!MACHINE_DETECTION_ENABLED) {
    console.log('[agent] machine detection disabled');
    return;
  }

  const config = getMachineConfig(AGENT_ID);
  if (!config) {
    console.log(`[agent] no machine config for ${AGENT_ID}, machine detection not started`);
    return;
  }

  if (machineDetectionTimer) return;

  console.log(`[agent] starting machine detection (interval=${MACHINE_DETECTION_INTERVAL_MS}ms)`);
  machineDetectionTimer = setInterval(() => {
    void runMachineDetection();
  }, MACHINE_DETECTION_INTERVAL_MS);

  // Run initial detection after a short delay to allow cameras to be configured
  setTimeout(() => {
    void runMachineDetection();
  }, 5000);
}

function stopMachineDetection() {
  if (machineDetectionTimer) {
    clearInterval(machineDetectionTimer);
    machineDetectionTimer = null;
  }
}

connect();
