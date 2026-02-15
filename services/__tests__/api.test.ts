import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../api';

describe('ApiService request behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('times out getStatus requests after 2 seconds', async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        const abortError = new Error('aborted');
        (abortError as { name: string }).name = 'AbortError';

        if (!signal) {
          reject(new Error('Expected request signal'));
          return;
        }
        if (signal.aborted) {
          reject(abortError);
          return;
        }
        signal.addEventListener('abort', () => reject(abortError), { once: true });
      });
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const pending = ApiService.getStatus('Laundry-1');
    const timeoutAssertion = expect(pending).rejects.toThrow('Request timed out. Please try again.');
    await vi.advanceTimersByTimeAsync(2_000);

    await timeoutAssertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeDefined();
  });

  it('returns dashboard payload when request completes before timeout', async () => {
    const payload = {
      relays: [],
      schedules: [],
      groups: [],
      isMock: true,
      agentId: 'Laundry-1',
      lastHeartbeat: null,
    };

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await ApiService.getStatus('Laundry-1');
    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
