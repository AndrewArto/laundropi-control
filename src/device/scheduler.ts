import * as fs from 'fs';

export type DayCode = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface ScheduleEntry {
  relayId: number;
  entries: { days: DayCode[]; from: string; to: string }[];
}

type RelaySnapshot = { id: number; state: 'on' | 'off'; updatedAt?: number };

class Scheduler {
  private schedule: ScheduleEntry[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastStates: Map<number, 'on' | 'off'> = new Map();
  private lastTick: number = Date.now();
  private lastShouldBeOn: Map<number, boolean> = new Map();
  private suppressUntilBoundary: Set<number> = new Set();
  private persistPath: string | null;
  private applyFn: (relayId: number, state: 'on' | 'off') => void;
  private getSnapshotFn?: () => RelaySnapshot[];
  private debug = process.env.SCHEDULE_DEBUG === '1' || process.env.SCHEDULE_DEBUG === 'true';

  constructor(applyFn: (relayId: number, state: 'on' | 'off') => void, getSnapshotFn?: () => RelaySnapshot[], persistPath: string | null = '/tmp/laundropi-schedule.json') {
    this.applyFn = applyFn;
    this.getSnapshotFn = getSnapshotFn;
    this.persistPath = persistPath;
  }

  loadScheduleFromFile(path = this.persistPath) {
    try {
      if (path && fs.existsSync(path)) {
        const raw = fs.readFileSync(path, 'utf-8');
        this.schedule = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[scheduler] load failed', err);
    }
  }

  setSchedule(schedule: ScheduleEntry[]) {
    this.schedule = schedule;
    // Do not flip relays immediately when schedule is updated; wait for next boundary
    this.suppressUntilBoundary.clear();
    schedule.forEach(rule => this.suppressUntilBoundary.add(rule.relayId));
    this.lastShouldBeOn.clear();
    this.persistSchedule();
    if (this.debug) {
      console.log('[scheduler] setSchedule', JSON.stringify(schedule, null, 2));
    }
  }

  startScheduler() {
    if (this.timer) return;
    this.bootstrapFromPersistedState();
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
    const nowTs = Date.now();
    if (nowTs - this.lastTick > 65_000) {
      // If we skipped more than a minute (sleep/wake), reset lastStates to force reapply
      if (this.debug) console.log('[scheduler] large gap detected, resetting lastStates');
      this.lastStates.clear();
    }
    this.lastTick = nowTs;

    const now = new Date();

    this.schedule.forEach(rule => {
      const shouldBeOn = this.computeShouldBeOn(rule, now);
      const prevShould = this.lastShouldBeOn.get(rule.relayId);
      const boundary = prevShould !== undefined && prevShould !== shouldBeOn;
      this.lastShouldBeOn.set(rule.relayId, shouldBeOn);

      const isSuppressed = this.suppressUntilBoundary.has(rule.relayId);
      if (isSuppressed && !boundary) {
        // Skip enforcement until the next boundary
        return;
      }
      if (boundary) {
        this.suppressUntilBoundary.delete(rule.relayId);
      }

      const nextState: 'on' | 'off' = shouldBeOn ? 'on' : 'off';
      const prevState = this.lastStates.get(rule.relayId);
      if (boundary) {
        if (this.debug) {
          console.log('[scheduler] transition', { relayId: rule.relayId, from: prevState, to: nextState, current, rule: rule.entries });
        }
        this.applyFn(rule.relayId, nextState);
        this.lastStates.set(rule.relayId, nextState);
      }
    });
  }

  private bootstrapFromPersistedState(now = new Date()) {
    if (!this.getSnapshotFn || this.schedule.length === 0) return;
    const snapshot = this.getSnapshotFn();
    if (!Array.isArray(snapshot) || snapshot.length === 0) return;

    const nowTs = now.getTime();
    const snapshotMap = new Map(snapshot.map(entry => [entry.id, entry]));

    this.schedule.forEach(rule => {
      const state = snapshotMap.get(rule.relayId);
      const shouldBeOn = this.computeShouldBeOn(rule, now);
      this.lastShouldBeOn.set(rule.relayId, shouldBeOn);

      if (!state?.updatedAt) {
        if (state) {
          this.lastStates.set(rule.relayId, state.state);
        }
        return;
      }

      const nextBoundary = this.getNextBoundaryAfter(rule, new Date(state.updatedAt));
      if (nextBoundary !== null && nextBoundary <= nowTs) {
        const nextState: 'on' | 'off' = shouldBeOn ? 'on' : 'off';
        if (state.state !== nextState) {
          this.applyFn(rule.relayId, nextState);
        }
        this.lastStates.set(rule.relayId, nextState);
      } else {
        this.lastStates.set(rule.relayId, state.state);
      }
    });
  }

  private computeShouldBeOn(rule: ScheduleEntry, now: Date) {
    const daysOrder: DayCode[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = daysOrder[now.getDay()];
    const prevDay = daysOrder[(now.getDay() + 6) % 7];
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const current = `${hh}:${mm}`;

    return rule.entries.some(entry => {
      const from = entry.from;
      const to = entry.to;
      if (from <= to) {
        // Same-day window
        return entry.days.includes(day) && current >= from && current < to;
      }
      // Overnight window (e.g., 22:00 -> 06:00)
      const startsToday = entry.days.includes(day) && current >= from;
      const continuesFromPrev = entry.days.includes(prevDay) && current < to;
      return startsToday || continuesFromPrev;
    });
  }

  private getNextBoundaryAfter(rule: ScheduleEntry, since: Date): number | null {
    const daysOrder: DayCode[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sinceTs = since.getTime();
    const candidates: number[] = [];

    for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
      const base = new Date(since);
      base.setDate(base.getDate() + dayOffset);
      const dayName = daysOrder[base.getDay()];

      rule.entries.forEach(entry => {
        if (!entry.days.includes(dayName)) return;

        const start = this.withTime(base, entry.from).getTime();
        if (start > sinceTs) candidates.push(start);

        const endBase = entry.from <= entry.to ? base : new Date(base.getTime() + 24 * 60 * 60 * 1000);
        const end = this.withTime(endBase, entry.to).getTime();
        if (end > sinceTs) candidates.push(end);
      });
    }

    if (!candidates.length) return null;
    return Math.min(...candidates);
  }

  private withTime(base: Date, time: string) {
    const [hh, mm] = time.split(':').map(val => Number.parseInt(val, 10));
    const next = new Date(base);
    next.setHours(hh || 0, mm || 0, 0, 0);
    return next;
  }

  private persistSchedule(path = this.persistPath) {
    if (!path) return;
    try {
      fs.writeFileSync(path, JSON.stringify(this.schedule, null, 2));
    } catch (err) {
      console.warn('[scheduler] persist failed', err);
    }
  }
}

export function createScheduler(
  applyFn: (relayId: number, state: 'on' | 'off') => void,
  getSnapshotFn?: () => RelaySnapshot[],
  persistPath?: string | null
) {
  const scheduler = new Scheduler(
    applyFn,
    getSnapshotFn,
    persistPath === undefined ? '/tmp/laundropi-schedule.json' : persistPath
  );
  scheduler.loadScheduleFromFile();
  return scheduler;
}
