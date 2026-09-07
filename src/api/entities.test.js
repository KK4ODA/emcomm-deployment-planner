import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));

const { entities } = await import('./entities.js');

describe('entity data access (behaviour captured before refactor)', () => {
  beforeEach(() => {
    mock.calls.length = 0;
    mock.setResponse({ data: [], error: null });
  });

  it('maps entity names to Supabase table names', async () => {
    await entities.DeploymentLocation.list();
    await entities.ICS205Form.list();
    await entities.ARESGroup.list();
    expect(mock.supabase.from).toHaveBeenCalledWith('deployment_locations');
    expect(mock.supabase.from).toHaveBeenCalledWith('ics205_forms');
    expect(mock.supabase.from).toHaveBeenCalledWith('ares_groups');
  });

  it('translates "-created_date" into a descending order on created_at', async () => {
    await entities.Deployment.list('-created_date');
    expect(mock.lastCalls('order')[0].args).toEqual(['created_at', { ascending: false }]);
  });

  it('translates a plain field into an ascending order', async () => {
    await entities.Category.list('sort_order');
    expect(mock.lastCalls('order')[0].args).toEqual(['sort_order', { ascending: true }]);
  });

  it('applies equality filters for every criteria key', async () => {
    await entities.Notification.filter({ user_email: 'a@b.c', read: false });
    const eqs = mock.lastCalls('eq').map(c => c.args);
    expect(eqs).toContainEqual(['user_email', 'a@b.c']);
    expect(eqs).toContainEqual(['read', false]);
  });

  it('strips read-only columns before updating', async () => {
    mock.setResponse({ data: { id: '1' }, error: null });
    await entities.Task.update('1', {
      id: '1', created_at: 'x', updated_at: 'y', created_date: 'z', updated_date: 'w', created_by: 'u',
      name: 'Keep me', status: 'completed',
    });
    expect(mock.lastCalls('update')[0].args[0]).toEqual({ name: 'Keep me', status: 'completed' });
    expect(mock.lastCalls('eq')[0].args).toEqual(['id', '1']);
  });

  it('throws when Supabase returns an error', async () => {
    mock.setResponse({ data: null, error: new Error('boom') });
    await expect(entities.User.list()).rejects.toThrow('boom');
  });

  it('subscribe registers a postgres_changes listener and returns an unsubscribe', () => {
    const cb = vi.fn();
    const unsubscribe = entities.Task.subscribe(cb);
    expect(mock.supabase.channel).toHaveBeenCalled();
    unsubscribe();
    expect(mock.supabase.removeChannel).toHaveBeenCalled();
  });
});
