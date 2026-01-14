import * as dotenv from 'dotenv';
import WebSocket = require('ws');
import * as fs from 'fs';
import * as path from 'path';
import { gpio } from './gpio';
import { createScheduler, ScheduleEntry } from './scheduler';
import { RELAYS_CONFIG } from './config';

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
const CAMERA_FRAME_FETCH_TIMEOUT_MS = Number(process.env.CAMERA_FRAME_FETCH_TIMEOUT_MS || 3000);

let ws: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

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
  const active = cameras.filter(cam => cam.enabled && cam.sourceType === 'rtsp' && cam.rtspUrl);
  if (!active.length) {
    lines.push('  # no RTSP cameras configured');
  } else {
    active.forEach(cam => {
      const quoted = JSON.stringify(cam.rtspUrl);
      lines.push(`  ${cam.streamKey}: ${quoted}`);
    });
  }
  return `${lines.join('\n')}\n`;
};

const writeGo2rtcConfig = (cameras: CameraConfig[]) => {
  try {
    const payload = buildGo2rtcConfig(cameras);
    fs.writeFileSync(GO2RTC_CONFIG_PATH, payload, 'utf8');
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
      send({ type: 'camera_frame', requestId, ok: false, error: `go2rtc ${res.status}` });
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    send({
      type: 'camera_frame',
      requestId,
      ok: true,
      contentType,
      data: buf.toString('base64'),
    });
  } catch (err) {
    send({ type: 'camera_frame', requestId, ok: false, error: 'frame fetch failed' });
  }
}

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

connect();
