import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RELAYS_CONFIG, RelayConfig } from './config';

type RelayState = 'on' | 'off';
type Driver = 'mock' | 'shell';

class MockGpio {
  private val = 1;
  constructor(private pin: number) {
    console.log(`[Mock] Pin ${pin} Init`);
  }
  writeSync(val: number) {
    this.val = val;
    console.log(`[Mock] Pin ${this.pin} -> ${val}`);
  }
}

class ShellGpio {
  constructor(private pin: number) {
    try {
      require('child_process').execSync(`pinctrl set ${pin} op`, { stdio: 'ignore' });
    } catch {
      try {
        require('child_process').execSync(`raspi-gpio set ${pin} op`, { stdio: 'ignore' });
      } catch {
        // ignore
      }
    }
  }
  writeSync(val: number) {
    const level = val ? 'dh' : 'dl';
    try {
      require('child_process').execSync(`pinctrl set ${this.pin} ${level}`, { stdio: 'ignore' });
    } catch {
      try {
        require('child_process').execSync(`raspi-gpio set ${this.pin} ${level}`, { stdio: 'ignore' });
      } catch (err) {
        console.error(`[ShellGpio] Failed to write to pin ${this.pin}`, err);
      }
    }
  }
}

class GpioController {
  private state: Map<number, RelayState> = new Map();
  private mockPersistPath: string;
  private driver: Driver;
  private pins: Map<number, any> = new Map();
  private activeLow = true;

  constructor(persistPath = process.env.AGENT_RELAY_STATE_PATH || (os.platform() === 'linux' ? '/var/lib/laundropi/relays.json' : '/tmp/laundropi-relays.json')) {
    this.mockPersistPath = persistPath;
    this.driver = this.pickDriver();
    this.ensurePersistDir();
    this.loadState();
    this.initPins();
  }

  private pickDriver(): Driver {
    const forceMock = process.env.MOCK_GPIO === '1' || process.env.MOCK_GPIO === 'true';
    if (forceMock) return 'mock';
    // Non-linux hosts should never try GPIO shell drivers
    if (os.platform() !== 'linux') return 'mock';
    return 'shell';
  }

  private initPins() {
    if (this.driver === 'mock') return;
    RELAYS_CONFIG.forEach(relay => {
      if (this.pins.has(relay.id)) return;
      try {
        const pinObj = new ShellGpio(relay.gpioPin);
        this.pins.set(relay.id, pinObj);
        this.writeToPin(relay, this.getRelayState(relay.id));
      } catch (err) {
        console.error(`[gpio] failed to init relay ${relay.id}`, err);
        // fallback to mock if hardware init fails
        this.driver = 'mock';
      }
    });
  }

  setRelayState(relayId: number, state: RelayState) {
    this.state.set(relayId, state);
    this.persistState();
    const relay = RELAYS_CONFIG.find(r => r.id === relayId);
    if (!relay) return;
    this.writeToPin(relay, state);
  }

  getRelayState(relayId: number): RelayState {
    return this.state.get(relayId) || 'off';
  }

  getSnapshot(): { id: number; state: RelayState }[] {
    return Array.from(this.state.entries()).map(([id, state]) => ({ id, state }));
  }

  getMeta(): RelayConfig[] {
    return RELAYS_CONFIG;
  }

  isMock(): boolean {
    return this.driver === 'mock';
  }

  getDriver(): Driver {
    return this.driver;
  }

  private writeToPin(relay: RelayConfig, state: RelayState) {
    if (this.driver === 'mock') return;
    const pinObj = this.pins.get(relay.id);
    if (!pinObj) return;
    const level = this.activeLow ? (state === 'on' ? 0 : 1) : state === 'on' ? 1 : 0;
    pinObj.writeSync(level);
  }

  private persistState() {
    try {
      fs.writeFileSync(this.mockPersistPath, JSON.stringify(this.getSnapshot(), null, 2));
    } catch (err) {
      console.warn('[gpio] persist failed', err);
    }
  }

  private ensurePersistDir() {
    if (!this.mockPersistPath) return;
    try {
      fs.mkdirSync(path.dirname(this.mockPersistPath), { recursive: true });
    } catch (err) {
      console.warn('[gpio] ensure dir failed', err);
    }
  }

  private loadState() {
    try {
      if (fs.existsSync(this.mockPersistPath)) {
        const raw = fs.readFileSync(this.mockPersistPath, 'utf-8');
        const arr = JSON.parse(raw) as { id: number; state: RelayState }[];
        arr.forEach(r => this.state.set(r.id, r.state));
      } else {
        RELAYS_CONFIG.forEach(r => this.state.set(r.id, 'off'));
      }
    } catch (err) {
      console.warn('[gpio] load failed', err);
    }
  }
}

export const gpio = new GpioController();
export type { RelayState };
