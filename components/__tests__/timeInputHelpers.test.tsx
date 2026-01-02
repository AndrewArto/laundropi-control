import { describe, it, expect } from 'vitest';
import { __timeHelpers } from '../../App';

const { to24h, normalizeTimeInput } = __timeHelpers;

describe('time input helpers', () => {
  it('normalizes AM/PM to 24h', () => {
    expect(to24h('12:30 PM')).toBe('12:30');
    expect(to24h('12:05 am')).toBe('00:05');
    expect(to24h('1:09 pm')).toBe('13:09');
  });

  it('auto-inserts colon for HHMM', () => {
    expect(normalizeTimeInput('1234')).toBe('12:34');
    expect(normalizeTimeInput('073')).toBe('07:3');
    expect(normalizeTimeInput('07:30')).toBe('07:30');
  });
});
