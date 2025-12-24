import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.CENTRAL_PORT || 4000);
const AGENT_SECRET = process.env.CENTRAL_AGENT_SECRET || 'secret';

type AgentRecord = { socket: WebSocket; lastHeartbeat: number };
const agents: Map<string, AgentRecord> = new Map();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/agents', (_req, res) => {
  const list = Array.from(agents.entries()).map(([id, record]) => ({
    agentId: id,
    lastHeartbeat: record.lastHeartbeat,
    online: record.socket.readyState === WebSocket.OPEN,
  }));
  res.json(list);
});

app.post('/api/agents/:id/relays/:relayId/toggle', (req, res) => {
  const { id, relayId } = req.params;
  const target = agents.get(id);
  if (!target || target.socket.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: 'agent not connected' });
  }
  const state = req.body?.state === 'on' ? 'on' : 'off';
  target.socket.send(JSON.stringify({ type: 'set_relay', relayId: Number(relayId), state }));
  res.json({ ok: true, sent: { relayId: Number(relayId), state } });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/agent' });

wss.on('connection', (socket) => {
  let agentId: string | null = null;

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!agentId && msg.type === 'hello') {
        if (msg.secret !== AGENT_SECRET) {
          console.warn('[central] invalid secret from', msg.agentId);
          socket.close();
          return;
        }
        agentId = msg.agentId;
        agents.set(agentId, { socket, lastHeartbeat: Date.now() });
        console.log('[central] agent connected', agentId);
        return;
      }

      if (!agentId) {
        console.warn('[central] message before hello, dropping');
        return;
      }

      if (msg.type === 'heartbeat') {
        const record = agents.get(agentId);
        if (record) record.lastHeartbeat = Date.now();
      }
      // log other messages for now
      console.log('[central] message from', agentId, msg);
    } catch (err) {
      console.error('[central] failed to parse message', err);
    }
  });

  socket.on('close', () => {
    if (agentId) {
      agents.delete(agentId);
      console.log('[central] agent disconnected', agentId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[central] HTTP+WS listening on ${PORT}`);
  console.log(`[central] WS endpoint ws://localhost:${PORT}/agent`);
});
