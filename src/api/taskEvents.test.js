import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));

const { offlineStorage } = await import('@/lib/offline/storage');
const {
  generateULID, getDeviceId, applyTaskEvent, createTaskEvent, updateTaskEvent, deleteTaskEvent, listTasksLocal,
} = await import('./taskEvents.js');

const actor = { id: '00000000-0000-4000-8000-000000000001', call_sign: 'KK4ODA' };

async function resetStores() {
  await offlineStorage.clearStore('entities.tasks');
  await offlineStorage.clearStore('events');
  await offlineStorage.clearStore('outbox');
}

describe('ULID and device id', () => {
  it('generates 26-char Crockford base32 ids that sort by time', () => {
    const a = generateULID();
    const b = generateULID();
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a.slice(0, 10) <= b.slice(0, 10)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('persists a stable device id in localStorage', () => {
    const first = getDeviceId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getDeviceId()).toBe(first);
  });
});

describe('applyTaskEvent (local materialisation)', () => {
  beforeEach(resetStores);

  it('materialises a create event with defaults', async () => {
    await applyTaskEvent({ op: 'create', entity_id: 't1', ts: '2026-01-01T00:00:00.000Z', patch: { name: 'Raise mast' } });
    const tasks = await listTasksLocal();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 't1', name: 'Raise mast', status: 'pending', priority: 'medium', created_at: '2026-01-01T00:00:00.000Z' });
  });

  it('never regresses status (most-advanced wins)', async () => {
    await applyTaskEvent({ op: 'create', entity_id: 't1', ts: 'x', patch: { name: 'A', status: 'completed' } });
    await applyTaskEvent({ op: 'update', entity_id: 't1', ts: 'y', patch: { status: 'pending' } });
    expect((await listTasksLocal())[0].status).toBe('completed');
    await applyTaskEvent({ op: 'update', entity_id: 't1', ts: 'y', patch: { status: 'in_progress' } });
    expect((await listTasksLocal())[0].status).toBe('completed');
  });

  it('advances status forward and patches other fields', async () => {
    await applyTaskEvent({ op: 'create', entity_id: 't1', ts: 'x', patch: { name: 'A' } });
    await applyTaskEvent({ op: 'update', entity_id: 't1', ts: 'y', patch: { status: 'in_progress', priority: 'high' } });
    const [t] = await listTasksLocal();
    expect(t.status).toBe('in_progress');
    expect(t.priority).toBe('high');
  });

  it('ignores updates for unknown tasks and removes tasks on delete', async () => {
    await applyTaskEvent({ op: 'update', entity_id: 'ghost', ts: 'y', patch: { name: 'x' } });
    expect(await listTasksLocal()).toHaveLength(0);
    await applyTaskEvent({ op: 'create', entity_id: 't1', ts: 'x', patch: { name: 'A' } });
    await applyTaskEvent({ op: 'delete', entity_id: 't1', ts: 'z', patch: {} });
    expect(await listTasksLocal()).toHaveLength(0);
  });
});

describe('event dispatch', () => {
  beforeEach(async () => {
    await resetStores();
    mock.calls.length = 0;
    mock.supabase.from.mockClear();
    mock.setResponse({ data: null, error: null });
  });

  it('queues the event to the outbox when offline and still applies it locally', async () => {
    const created = await createTaskEvent({ name: 'Offline task', deployment_location_id: 'loc1' }, actor, false);
    expect(created.id).toBeTruthy();
    const outbox = await offlineStorage.getAllEntities('outbox');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: 'task', op: 'create', entity_id: created.id, actor_call_sign: 'KK4ODA', sig: 'unsigned' });
    expect(mock.supabase.from).not.toHaveBeenCalled();
    expect(await listTasksLocal()).toHaveLength(1);
  });

  it('posts to the events table when online and leaves the outbox empty', async () => {
    await createTaskEvent({ name: 'Online task' }, actor, true);
    expect(mock.supabase.from).toHaveBeenCalledWith('events');
    expect(mock.lastCalls('insert')).toHaveLength(1);
    expect(await offlineStorage.getAllEntities('outbox')).toHaveLength(0);
  });

  it('falls back to the outbox when the online insert fails', async () => {
    mock.setResponse({ data: null, error: { message: 'RLS denied' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await updateTaskEvent('t9', { status: 'completed' }, actor, 'dep1', true);
    expect(await offlineStorage.getAllEntities('outbox')).toHaveLength(1);
    warn.mockRestore();
  });

  it('records the actor and deployment on delete events', async () => {
    await deleteTaskEvent('t9', actor, 'dep1', false);
    const [evt] = await offlineStorage.getAllEntities('outbox');
    expect(evt).toMatchObject({ op: 'delete', entity_id: 't9', deployment_id: 'dep1', actor_user_id: actor.id });
    expect(evt.actor_device_id).toBe(getDeviceId());
  });
});
