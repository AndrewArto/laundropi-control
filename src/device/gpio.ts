import fs from 'fs';

type RelayState = 'on' | 'off';

// Simplified GPIO wrapper; in real deployment swap to onoff/pinctrl as in server.js.
class GpioController {
  private state: Map<number, RelayState> = new Map();
  private mockPersistPath: string;

  constructor(persistPath = '/tmp/laundropi-relays.json') {
    this.mockPersistPath = persistPath;
    this.loadState();
  }

  setRelayState(relayId: number, state: RelayState) {
    this.state.set(relayId, state);
    this.persistState();
    console.log(`[gpio] relay ${relayId} -> ${state}`);
    // TODO: integrate onoff/pinctrl hardware writes here.
  }

  getRelayState(relayId: number): RelayState {
    return this.state.get(relayId) || 'off';
  }

  getSnapshot(): { id: number; state: RelayState }[] {
    return Array.from(this.state.entries()).map(([id, state]) => ({ id, state }));
  }

  private persistState() {
    try {
      fs.writeFileSync(this.mockPersistPath, JSON.stringify(this.getSnapshot(), null, 2));
    } catch (err) {
      console.warn('[gpio] persist failed', err);
    }
  }

  private loadState() {
    try {
      if (fs.existsSync(this.mockPersistPath)) {
        const raw = fs.readFileSync(this.mockPersistPath, 'utf-8');
        const arr = JSON.parse(raw) as { id: number; state: RelayState }[];
        arr.forEach(r => this.state.set(r.id, r.state));
      }
    } catch (err) {
      console.warn('[gpio] load failed', err);
    }
  }
}

export const gpio = new GpioController();
export type { RelayState };
