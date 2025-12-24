import WebSocket from 'ws';
import dotenv from 'dotenv';
import { gpio } from './gpio';
import { createScheduler, ScheduleEntry } from './scheduler';

dotenv.config();

const AGENT_ID = process.env.AGENT_ID || 'agent-dev';
const AGENT_SECRET = process.env.AGENT_SECRET || 'secret';
const AGENT_WS_URL = process.env.AGENT_WS_URL || 'ws://localhost:4000/agent';

let ws: WebSocket | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

const scheduler = createScheduler((relayId, state) => gpio.setRelayState(relayId, state));
scheduler.startScheduler();

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
  | { type: 'update_schedule'; schedules: ScheduleEntry[] };

function handleMessage(msg: IncomingMessage) {
  console.log('[agent] incoming message', msg);
  if (msg.type === 'set_relay') {
    gpio.setRelayState(msg.relayId, msg.state);
  }
  if (msg.type === 'update_schedule') {
    scheduler.setSchedule(msg.schedules);
  }
}

function send(payload: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    send({
      type: 'heartbeat',
      agentId: AGENT_ID,
      status: {
        relays: gpio.getSnapshot(),
        time: new Date().toISOString(),
      },
    });
  }, 5000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

connect();
