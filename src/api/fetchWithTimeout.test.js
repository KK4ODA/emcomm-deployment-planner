import { describe, it, expect, vi } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

const hang = (_input, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason)); });

describe('fetchWithTimeout', () => {
  it('rejects a request that never answers', async () => {
    vi.useFakeTimers();
    const f = fetchWithTimeout(1000, hang);
    const p = f('https://example.test/rest/v1/x');
    const settled = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1001);
    await settled;
    vi.useRealTimers();
  });

  it('passes a normal response straight through and clears the timer', async () => {
    const base = vi.fn(async (_input, _init) => new Response('ok'));
    const f = fetchWithTimeout(1000, base);
    const res = await f('https://example.test', { method: 'GET' });
    expect(await res.text()).toBe('ok');
    expect(base.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('honours the caller\'s own abort signal', async () => {
    const f = fetchWithTimeout(60_000, hang);
    const ac = new AbortController();
    const p = f('https://example.test', { signal: ac.signal });
    ac.abort(new Error('cancelled by caller'));
    await expect(p).rejects.toThrow('cancelled by caller');
  });
});
