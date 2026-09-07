import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));
vi.mock('@/lib/query-client', () => ({ queryClientInstance: { invalidateQueries: vi.fn() } }));

const { offlineStorage, STORES } = await import('@/lib/offline/storage');
const { drainOutbox, fetchAndApplyInbox, refreshPendingCount, getPendingCount, getFailedCount, listDeadLetters, discardDeadLetter, retryDeadLetter, isPermanentError } = await import('./syncEngine');

const event = (id, op = 'update', patch = { status: 'in_progress' }) => ({ id, ts: '2026-03-01T00:00:00Z', entity: 'task', entity_id: `t-${id}`, op, patch, _queued_at: 1 });

/** Route each events insert to a scripted response by event id. */
function scriptInserts(byId) {
  mock.supabase.from.mockImplementation((table) => {
    const builder = {
      insert: vi.fn(async (row) => byId[row.id] ?? { data: null, error: null }),
      select: vi.fn(() => builder), eq: vi.fn(() => builder), gt: vi.fn(() => builder), order: vi.fn(() => builder),
      then: (resolve, reject) => Promise.resolve(byId.__select ?? { data: [], error: null }).then(resolve, reject),
    };
    builder.table = table;
    return builder;
  });
}

beforeEach(async () => {
  await offlineStorage.init();
  for (const s of Object.values(STORES)) await offlineStorage.clearStore(s);
  mock.supabase.from.mockReset();
});

describe('isPermanentError', () => {
  it('classifies Postgres and HTTP codes', () => {
    expect(isPermanentError({ code: '42501' })).toBe(true);
    expect(isPermanentError({ code: '23503' })).toBe(true);
    expect(isPermanentError({ status: 403 })).toBe(true);
    expect(isPermanentError({ status: 429 })).toBe(false);
    expect(isPermanentError({ status: 503 })).toBe(false);
    expect(isPermanentError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isPermanentError(null)).toBe(false);
  });
});

describe('drainOutbox', () => {
  it('sends queued events oldest first and removes them', async () => {
    await offlineStorage.saveEntity('outbox', event('02B'));
    await offlineStorage.saveEntity('outbox', event('01A'));
    const order = [];
    scriptInserts(new Proxy({}, { get: (_, id) => { if (typeof id === 'string' && id !== '__select') order.push(id); return { error: null }; } }));
    const r = await drainOutbox();
    expect(r).toEqual({ sent: 2, failed: 0, remaining: 0 });
    expect(order).toEqual(['01A', '02B']);
    expect(await offlineStorage.getAllEntities('outbox')).toEqual([]);
    expect(getPendingCount()).toBe(0);
  });

  it('dead-letters a permanent rejection and keeps going', async () => {
    await offlineStorage.saveEntity('outbox', event('01A'));
    await offlineStorage.saveEntity('outbox', event('02B'));
    scriptInserts({ '01A': { error: { code: '42501', message: 'permission denied for table events' } }, '02B': { error: null } });
    const r = await drainOutbox();
    expect(r).toEqual({ sent: 1, failed: 1, remaining: 0 });
    const left = await offlineStorage.getAllEntities('outbox');
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: '01A', _error: 'permission denied for table events' });
    expect(getPendingCount()).toBe(0);
    expect(getFailedCount()).toBe(1);
  });

  it('stops at a transient failure so order is preserved', async () => {
    await offlineStorage.saveEntity('outbox', event('01A'));
    await offlineStorage.saveEntity('outbox', event('02B'));
    scriptInserts({ '01A': { error: { message: 'Failed to fetch' } }, '02B': { error: null } });
    const r = await drainOutbox();
    expect(r).toEqual({ sent: 0, failed: 0, remaining: 2 });
    expect((await offlineStorage.getAllEntities('outbox')).map(e => e.id).sort()).toEqual(['01A', '02B']);
    expect(getPendingCount()).toBe(2);
  });

  it('skips dead letters on later drains until retried', async () => {
    await offlineStorage.saveEntity('outbox', { ...event('01A'), _error: 'nope' });
    const inserts = [];
    scriptInserts(new Proxy({}, { get: (_, id) => { if (typeof id === 'string' && id !== '__select') inserts.push(id); return { error: null }; } }));
    expect(await drainOutbox()).toEqual({ sent: 0, failed: 0, remaining: 0 });
    expect(inserts).toEqual([]);
    const letters = await listDeadLetters();
    expect(letters).toEqual([expect.objectContaining({ id: '01A', kind: 'task', error: 'nope' })]);
    await retryDeadLetter(letters[0]);  // syncNow probes the network; the entry itself is requeued
    expect((await offlineStorage.getEntity('outbox', '01A'))?._error).toBeUndefined();
    await discardDeadLetter(letters[0]);
    expect(await offlineStorage.getEntity('outbox', '01A')).toBeNull();
  });
});

describe('fetchAndApplyInbox', () => {
  it('applies new events, skips ones already seen, and advances the high-water mark', async () => {
    await offlineStorage.saveEntity(STORES.tasks, { id: 't-01A', name: 'Raise mast', status: 'pending' });
    await offlineStorage.saveEntity('events', { ...event('01A'), _local: true });   // ours, already applied
    scriptInserts({ __select: { data: [event('01A'), event('02B', 'update', { status: 'completed' })].map(e => ({ ...e, entity_id: 't-01A' })), error: null } });
    await fetchAndApplyInbox();
    const task = await offlineStorage.getEntity(STORES.tasks, 't-01A');
    expect(task.status).toBe('completed');
    const state = await offlineStorage.getEntity(STORES.syncState, 'supabase');
    expect(state.hwm).toBe('02B');
    expect(await offlineStorage.getEntity('events', '02B')).toBeTruthy();
  });

  it('never regresses a task status from an older event', async () => {
    await offlineStorage.saveEntity(STORES.tasks, { id: 't-x', name: 'Pack', status: 'completed' });
    scriptInserts({ __select: { data: [{ ...event('03C', 'update', { status: 'pending' }), entity_id: 't-x' }], error: null } });
    await fetchAndApplyInbox();
    expect((await offlineStorage.getEntity(STORES.tasks, 't-x')).status).toBe('completed');
  });
});

describe('refreshPendingCount', () => {
  it('counts pending and failed across both outboxes', async () => {
    await offlineStorage.saveEntity('outbox', event('01A'));
    await offlineStorage.saveEntity('outbox', { ...event('02B'), _error: 'x' });
    await offlineStorage.saveEntity(STORES.intents, { id: '03C', assignment_id: 'a', status: 'checked_in', error: null });
    await offlineStorage.saveEntity(STORES.intents, { id: '04D', assignment_id: 'a', status: 'released', error: 'Not allowed' });
    await refreshPendingCount();
    expect(getPendingCount()).toBe(2);
    expect(getFailedCount()).toBe(2);
    expect((await listDeadLetters()).map(l => l.kind)).toEqual(['task', 'assignment']);
  });
});
