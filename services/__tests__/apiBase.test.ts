import { describe, it, expect } from 'vitest';
import { resolveBaseUrl } from '../api';

describe('resolveBaseUrl', () => {
  it('prefers explicit env base', () => {
    const base = resolveBaseUrl({
      envBase: 'http://localhost:3001/',
      location: { protocol: 'http:', hostname: 'localhost', port: '3000' },
    });
    expect(base).toBe('http://localhost:3001');
  });

  it('strips trailing slash from env base', () => {
    const base = resolveBaseUrl({
      envBase: 'http://example.com/api/',
    });
    expect(base).toBe('http://example.com/api');
  });

  it('returns empty when no env base (uses relative URLs)', () => {
    const base = resolveBaseUrl({
      location: { protocol: 'http:', hostname: 'localhost', port: '3000' },
    });
    expect(base).toBe('');
  });

  it('returns empty when no options provided', () => {
    const base = resolveBaseUrl();
    expect(base).toBe('');
  });

  it('handles whitespace-only env base', () => {
    const base = resolveBaseUrl({
      envBase: '   ',
    });
    expect(base).toBe('');
  });
});
