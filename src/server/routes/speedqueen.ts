import express = require('express');
import type { SpeedQueenService } from '../services/speedqueen';
import type { MockSpeedQueenService } from '../services/speedqueen-mock';
import type { LaundryMachine, SpeedQueenCommandType } from '../../../types';
import { listMachineEvents } from '../db';

type SQService = SpeedQueenService | MockSpeedQueenService;

export interface SpeedQueenRouterDeps {
  getService: () => SQService | null;
  getMachineStatusCache: () => Map<string, { machines: LaundryMachine[]; lastAnalyzed: number; source?: string }>;
  isKnownLaundry: (agentId: string) => boolean;
  requireAdminOrUser: express.RequestHandler;
  requireUiAuth: express.RequestHandler;
  isSpeedQueenEnabled: () => boolean;
  getSpeedQueenLocations: () => string;
  getSessionUser: (req: express.Request) => string | null;
}

export function createSpeedQueenRouter(deps: SpeedQueenRouterDeps): express.Router {
  const router = express.Router();

  // Get machine detail with cycles
  router.get('/agents/:id/machines/:machineId/detail', async (req, res) => {
    const { id: agentId, machineId } = req.params;
    if (!deps.isKnownLaundry(agentId)) {
      return res.status(404).json({ error: 'agent not found' });
    }
    const service = deps.getService();
    if (!service) {
      return res.status(400).json({ error: 'Speed Queen integration not configured' });
    }

    if ('notifyUiActivity' in service) {
      (service as SpeedQueenService).notifyUiActivity();
    }

    const mapping = service.getMachineMapping(agentId, machineId);
    if (!mapping) {
      return res.status(404).json({ error: 'machine not found in Speed Queen mapping' });
    }

    try {
      const cycles = await service.getMachineCycles(agentId, machineId);
      const cache = deps.getMachineStatusCache();
      const cached = cache.get(agentId);
      const machine = cached?.machines?.find((m: LaundryMachine) => m.id === machineId);

      res.json({
        machine: machine || { id: machineId, label: mapping.label, type: mapping.type, status: 'unknown', lastUpdated: Date.now() },
        cycles,
        locationId: mapping.locationId,
        speedqueenId: mapping.speedqueenId,
        model: mapping.model,
      });
    } catch (err: any) {
      console.error(`[speedqueen] Failed to get detail for ${agentId}/${machineId}:`, err);
      res.status(500).json({ error: 'Failed to fetch machine detail' });
    }
  });

  // Send command to a machine
  router.post('/agents/:id/machines/:machineId/command', deps.requireAdminOrUser, async (req, res) => {
    const { id: agentId, machineId } = req.params;
    if (!deps.isKnownLaundry(agentId)) {
      return res.status(404).json({ error: 'agent not found' });
    }
    const service = deps.getService();
    if (!service) {
      return res.status(400).json({ error: 'Speed Queen integration not configured' });
    }

    const { commandType, params } = req.body || {};
    if (!commandType) {
      return res.status(400).json({ error: 'commandType required' });
    }

    const validCommands: SpeedQueenCommandType[] = [
      'remote_start', 'remote_stop', 'remote_vend',
      'start_dryer_with_time', 'clear_error', 'set_out_of_order',
      'rapid_advance', 'clear_partial_vend',
    ];
    if (!validCommands.includes(commandType)) {
      return res.status(400).json({ error: `Invalid commandType. Valid: ${validCommands.join(', ')}` });
    }

    try {
      // Record pending command for initiator tracking
      if ('recordPendingCommand' in service) {
        const mapping = service.getMachineMapping(agentId, machineId);
        if (mapping) {
          const username = deps.getSessionUser(req) || 'unknown';
          (service as SpeedQueenService).recordPendingCommand(mapping.speedqueenId, username, commandType);
        }
      }

      const result = await service.sendMachineCommand(agentId, machineId, commandType, params || {});
      console.log(`[speedqueen] Command ${commandType} sent to ${agentId}/${machineId}: ${JSON.stringify(result).slice(0, 200)}`);
      res.json({ ok: true, command: result });
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('No Speed Queen mapping')) {
        return res.status(404).json({ error: `No Speed Queen mapping for ${agentId}/${machineId}` });
      }
      if (msg.includes('Unknown parameter') || msg.includes('Unknown command type')) {
        return res.status(400).json({ error: msg });
      }
      console.error(`[speedqueen] Command failed for ${agentId}/${machineId}:`, err);
      res.status(500).json({ error: 'Command failed' });
    }
  });

  // Get command status
  router.get('/agents/:id/machines/:machineId/command/:commandId', async (req, res) => {
    const { id: agentId, machineId, commandId } = req.params;
    const service = deps.getService();
    if (!service) {
      return res.status(400).json({ error: 'Speed Queen integration not configured' });
    }

    try {
      const result = await service.getCommandStatus(agentId, machineId, commandId);
      res.json(result);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('No Speed Queen mapping')) {
        return res.status(404).json({ error: `No Speed Queen mapping for ${agentId}/${machineId}` });
      }
      console.error(`[speedqueen] Command status failed for ${agentId}/${machineId}/${commandId}:`, err);
      res.status(500).json({ error: 'Failed to get command status' });
    }
  });

  // Check if Speed Queen is enabled
  router.get('/speedqueen/status', (_req, res) => {
    const service = deps.getService();
    res.json({
      enabled: deps.isSpeedQueenEnabled(),
      active: service?.isActive() ?? false,
      locations: deps.getSpeedQueenLocations()
        ? deps.getSpeedQueenLocations().split(',').map((s: string) => s.trim())
        : [],
    });
  });

  // Machine events log
  router.get('/machine-events', deps.requireUiAuth, (req, res) => {
    const { agentId, machineId, from, to, limit } = req.query;
    try {
      const events = listMachineEvents({
        agentId: agentId as string | undefined,
        machineId: machineId as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json(events);
    } catch (err: any) {
      console.error('[machine-events] Query failed:', err);
      res.status(500).json({ error: 'Failed to fetch machine events' });
    }
  });

  return router;
}
