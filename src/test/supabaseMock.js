import { vi } from 'vitest';

/**
 * Minimal chainable mock of the parts of the Supabase JS client the app uses.
 * Every query-builder method records its call and returns the builder; the
 * builder is thenable so `await supabase.from(...).select(...)` resolves to
 * the configured response.
 */
export function createSupabaseMock() {
  const calls = [];
  let nextResponse = { data: [], error: null };

  function makeBuilder(table) {
    const builder = {};
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gt', 'in', 'order', 'single', 'maybeSingle', 'limit'];
    for (const m of methods) {
      builder[m] = vi.fn((...args) => {
        calls.push({ table, method: m, args });
        return builder;
      });
    }
    builder.then = (resolve, reject) => Promise.resolve(nextResponse).then(resolve, reject);
    return builder;
  }

  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };

  const supabase = {
    from: vi.fn((table) => makeBuilder(table)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    storage: { from: vi.fn() },
  };

  return {
    supabase,
    calls,
    setResponse(r) { nextResponse = r; },
    lastCalls(method) { return calls.filter(c => c.method === method); },
  };
}
