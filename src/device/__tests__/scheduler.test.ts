import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScheduler, ScheduleEntry } from '../scheduler';

const monday = new Date('2025-01-06T06:59:00Z'); // Monday

const makeSchedule = (relayId: number, from: string, to: string, days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']): ScheduleEntry[] => [
  {
    relayId,
    entries: [{ days, from, to }]
  }
];

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(monday);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not flip state until first boundary after schedule update', () => {
    const actions: Array<{ id: number; state: string }> = [];
    const scheduler = createScheduler(
      (id, state) => actions.push({ id, state }),
      () => [{ id: 1, state: 'off' as const }],
      null
    );

    scheduler.setSchedule(makeSchedule(1, '07:00', '08:00'));
    scheduler.startScheduler();

    // Before 07:00 nothing happens
    vi.advanceTimersByTime(1000);
    expect(actions.length).toBe(0);

    // Move to 07:00 boundary -> should turn on once
    vi.setSystemTime(new Date('2025-01-06T07:00:00Z'));
    vi.advanceTimersByTime(1000);
    expect(actions).toEqual([{ id: 1, state: 'on' }]);

    // Move past off boundary -> should turn off
    vi.setSystemTime(new Date('2025-01-06T08:00:00Z'));
    vi.advanceTimersByTime(1000);
    expect(actions.at(-1)).toEqual({ id: 1, state: 'off' });
  });

  it('handles overnight window (23:00 -> 06:00 next day)', () => {
    const actions: Array<{ id: number; state: string }> = [];
    vi.setSystemTime(new Date('2025-01-06T22:50:00Z')); // Mon

    const scheduler = createScheduler(
      (id, state) => actions.push({ id, state }),
      () => [{ id: 1, state: 'off' as const }],
      null
    );

    scheduler.setSchedule(makeSchedule(1, '23:00', '06:00', ['Mon', 'Tue']));
    scheduler.startScheduler();

    // Before 23:00 nothing
    vi.advanceTimersByTime(15_000);
    expect(actions.length).toBe(0);

    // Cross to 23:00 -> ON
    vi.setSystemTime(new Date('2025-01-06T23:00:00Z'));
    vi.advanceTimersByTime(1000);
    expect(actions.at(-1)).toEqual({ id: 1, state: 'on' });

    // Next day 06:00 -> OFF
    vi.setSystemTime(new Date('2025-01-07T06:00:00Z'));
    vi.advanceTimersByTime(1000);
    expect(actions.at(-1)).toEqual({ id: 1, state: 'off' });
  });

  it('respects manual override until next boundary', () => {
    const actions: Array<{ id: number; state: string }> = [];
    let currentState: 'on' | 'off' = 'off';

    vi.setSystemTime(new Date('2025-01-06T06:59:00Z')); // Mon

    const scheduler = createScheduler(
      (id, state) => {
        actions.push({ id, state });
        currentState = state;
      },
      () => [{ id: 1, state: currentState }],
      null
    );

    scheduler.setSchedule(makeSchedule(1, '07:00', '08:00', ['Mon']));
    scheduler.startScheduler();

    // Cross to 07:00 -> ON
    vi.setSystemTime(new Date('2025-01-06T07:00:00Z'));
    vi.advanceTimersByTime(1000);
    expect(actions.at(-1)).toEqual({ id: 1, state: 'on' });

    // Manual OFF should not be overridden until schedule boundary.
    actions.length = 0;
    currentState = 'off';
    vi.advanceTimersByTime(5_000);
    expect(actions.length).toBe(0);

    // At 08:00 boundary -> OFF
    vi.setSystemTime(new Date('2025-01-06T08:00:00Z'));
    vi.advanceTimersByTime(1000);
    expect(actions.at(-1)).toEqual({ id: 1, state: 'off' });
  });
});
