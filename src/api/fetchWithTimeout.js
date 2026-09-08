/**
 * A fetch that gives up. The Supabase client has no request timeout of its
 * own; a single stalled request (a token refresh that never completes after
 * the laptop wakes, a dropped connection mid-request) left every later call
 * waiting on it, and the page sat on its skeleton until a manual reload.
 * With a deadline the stalled call rejects, React Query shows the error with
 * a Retry button, and the next attempt starts clean.
 */
export const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * @param {number} [timeoutMs]
 * @param {typeof fetch} [baseFetch]
 * @returns {typeof fetch}
 */
export function fetchWithTimeout(timeoutMs = DEFAULT_TIMEOUT_MS, baseFetch = globalThis.fetch.bind(globalThis)) {
  return (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException(`Request timed out after ${Math.round(timeoutMs / 1000)} s`, 'TimeoutError')), timeoutMs);
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
    }
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}
