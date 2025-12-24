import * as fs from 'fs';

export type DayCode = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface ScheduleEntry {
  relayId: number;
  entries: { days: DayCode[]; from: string; to: string }[];
}

class Scheduler {
  private schedule: ScheduleEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastStates: Map<number, 'on' | 'off'> = new Map();
  private persistPath: string;
  private applyFn: (relayId: number, state: 'on' | 'off') => void;
  private debug = process.env.SCHEDULE_DEBUG === '1' || process.env.SCHEDULE_DEBUG === 'true';

  constructor(applyFn: (relayId: number, state: 'on' | 'off') => void, persistPath = '/tmp/laundropi-schedule.json') {
    this.applyFn = applyFn;
    this.persistPath = persistPath;
  }

  loadScheduleFromFile(path = this.persistPath) {
    try {
      if (fs.existsSync(path)) {
        const raw = fs.readFileSync(path, 'utf-8');
        this.schedule = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[scheduler] load failed', err);
    }
  }

  setSchedule(schedule: ScheduleEntry[]) {
    this.schedule = schedule;
    this.lastStates.clear();
    this.persistSchedule();
    if (this.debug) {
      console.log('[scheduler] setSchedule', JSON.stringify(schedule, null, 2));
    }
  }

  startScheduler() {
    if (this.timer) return;
    // Tick every second for better on-time accuracy
    this.timer = setInterval(() => this.tick(), 1_000);
    this.tick(); // immediate evaluation
  }

  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSchedule() {
    return this.schedule;
  }

  private tick() {
    const now = new Date();
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()] as DayCode;
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const current = `${hh}:${mm}`;

    this.schedule.forEach(rule => {
      const shouldBeOn = rule.entries.some(entry => entry.days.includes(day) && current >= entry.from && current < entry.to);
      const nextState: 'on' | 'off' = shouldBeOn ? 'on' : 'off';
      const prevState = this.lastStates.get(rule.relayId);
      if (prevState !== nextState) {
        if (this.debug) {
          console.log('[scheduler] transition', { relayId: rule.relayId, from: prevState, to: nextState, current, rule: rule.entries });
        }
        this.applyFn(rule.relayId, nextState);
        this.lastStates.set(rule.relayId, nextState);
      }
    });
  }

  private persistSchedule(path = this.persistPath) {
    try {
      fs.writeFileSync(path, JSON.stringify(this.schedule, null, 2));
    } catch (err) {
      console.warn('[scheduler] persist failed', err);
    }
  }
}

export function createScheduler(applyFn: (relayId: number, state: 'on' | 'off') => void, persistPath?: string) {
  const scheduler = new Scheduler(applyFn, persistPath);
  scheduler.loadScheduleFromFile();
  return scheduler;
}
