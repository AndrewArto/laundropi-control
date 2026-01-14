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

  it('maps dev ui port to central port', () => {
    const base = resolveBaseUrl({
      location: { protocol: 'http:', hostname: 'localhost', port: '3000' },
    });
    expect(base).toBe('http://localhost:4000');
  });

  it('returns empty when no env and not dev port', () => {
    const base = resolveBaseUrl({
      location: { protocol: 'https:', hostname: 'example.com', port: '443' },
    });
    expect(base).toBe('');
  });
});
