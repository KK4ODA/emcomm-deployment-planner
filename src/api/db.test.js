import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));

const { db, TABLES, stripReadOnly, createRepository } = await import('./db.js');

describe('database repositories', () => {
  beforeEach(() => {
    mock.calls.length = 0;
    mock.supabase.from.mockClear();
    mock.setResponse({ data: [], error: null });
  });

  it('maps repositories to Supabase table names', async () => {
    await db.locations.list();
    await db.commsPlanChannels.list();
    await db.aresGroups.list();
    expect(mock.supabase.from).toHaveBeenCalledWith('deployment_locations');
    expect(mock.supabase.from).toHaveBeenCalledWith('comms_plan_channels');
    expect(mock.supabase.from).toHaveBeenCalledWith('ares_groups');
    expect(Object.keys(db).sort()).toEqual(Object.keys(TABLES).sort());
  });

  it('orders descending when asked', async () => {
    await db.deployments.list({ orderBy: 'created_at', ascending: false });
    expect(mock.lastCalls('order')[0].args).toEqual(['created_at', { ascending: false }]);
  });

  it('orders ascending by default and skips order when no column is given', async () => {
    await db.categories.list({ orderBy: 'sort_order' });
    expect(mock.lastCalls('order')[0].args).toEqual(['sort_order', { ascending: true }]);
    mock.calls.length = 0;
    await db.categories.list();
    expect(mock.lastCalls('order')).toHaveLength(0);
  });

  it('returns an empty array when the response has no rows', async () => {
    mock.setResponse({ data: null, error: null });
    expect(await db.users.list()).toEqual([]);
  });

  it('findById uses maybeSingle and short-circuits on a falsy id', async () => {
    mock.setResponse({ data: { id: 'd1' }, error: null });
    expect(await db.deployments.findById('d1')).toEqual({ id: 'd1' });
    expect(mock.lastCalls('eq')[0].args).toEqual(['id', 'd1']);
    expect(mock.lastCalls('maybeSingle')).toHaveLength(1);
    mock.supabase.from.mockClear();
    expect(await db.deployments.findById(null)).toBeNull();
    expect(mock.supabase.from).not.toHaveBeenCalled();
  });

  it('applies equality filters for every criteria key', async () => {
    await db.notifications.where({ user_email: 'a@b.c', read: false }, { orderBy: 'created_at', ascending: false });
    const eqs = mock.lastCalls('eq').map(c => c.args);
    expect(eqs).toContainEqual(['user_email', 'a@b.c']);
    expect(eqs).toContainEqual(['read', false]);
    expect(mock.lastCalls('order')[0].args).toEqual(['created_at', { ascending: false }]);
  });

  it('strips read-only columns before updating', async () => {
    mock.setResponse({ data: { id: '1' }, error: null });
    await db.tasks.update('1', { id: '1', created_at: 'x', updated_at: 'y', created_by: 'u', name: 'Keep me', status: 'completed' });
    expect(mock.lastCalls('update')[0].args[0]).toEqual({ name: 'Keep me', status: 'completed' });
    expect(mock.lastCalls('eq')[0].args).toEqual(['id', '1']);
  });

  it('stripReadOnly does not mutate its input', () => {
    const input = { id: '1', name: 'n', created_at: 'x' };
    expect(stripReadOnly(input)).toEqual({ name: 'n' });
    expect(input.id).toBe('1');
  });

  it('create inserts and returns the single created row', async () => {
    mock.setResponse({ data: { id: 'new' }, error: null });
    expect(await db.items.create({ name: 'Radio' })).toEqual({ id: 'new' });
    expect(mock.lastCalls('insert')[0].args[0]).toEqual({ name: 'Radio' });
    expect(mock.lastCalls('single')).toHaveLength(1);
  });

  it('remove deletes by id', async () => {
    await db.items.remove('x1');
    expect(mock.lastCalls('delete')).toHaveLength(1);
    expect(mock.lastCalls('eq')[0].args).toEqual(['id', 'x1']);
  });

  it('throws when Supabase returns an error', async () => {
    mock.setResponse({ data: null, error: new Error('boom') });
    await expect(db.users.list()).rejects.toThrow('boom');
    await expect(db.users.remove('1')).rejects.toThrow('boom');
  });

  it('subscribe registers a postgres_changes listener and returns an unsubscribe', () => {
    const cb = vi.fn();
    const unsubscribe = createRepository('tasks').subscribe(cb);
    expect(mock.supabase.channel).toHaveBeenCalled();
    unsubscribe();
    expect(mock.supabase.removeChannel).toHaveBeenCalled();
  });
});
