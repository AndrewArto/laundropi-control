import fs from 'fs';

export type DayCode = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface ScheduleEntry {
  relayId: number;
  entries: { days: DayCode[]; from: string; to: string }[];
}

// Very lightweight polling scheduler; replace with cron later.
class Scheduler {
  private schedule: ScheduleEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private persistPath: string;
  private applyFn: (relayId: number, state: 'on' | 'off') => void;

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
    this.persistSchedule();
  }

  startScheduler() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 5_000);
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
      rule.entries.forEach(entry => {
        if (!entry.days.includes(day)) return;
        if (current >= entry.from && current < entry.to) {
          this.applyFn(rule.relayId, 'on');
        } else if (current >= entry.to) {
          this.applyFn(rule.relayId, 'off');
        }
      });
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
