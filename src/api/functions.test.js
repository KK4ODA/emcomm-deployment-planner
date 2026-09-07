import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));

const { invokeFunction, describeFunctionError, exportDeployment, inviteUser, cleanupDeletedUser } = await import('./functions.js');

describe('edge function invocation', () => {
  beforeEach(() => mock.supabase.functions.invoke.mockReset());

  it('returns the response body on success', async () => {
    mock.supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await invokeFunction('x', { a: 1 })).toEqual({ ok: true });
    expect(mock.supabase.functions.invoke).toHaveBeenCalledWith('x', { body: { a: 1 } });
  });

  it('surfaces the server-provided error message from an HTTP error', async () => {
    const context = new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
    mock.supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } });
    await expect(invokeFunction('x')).rejects.toThrow('Admin access required');
  });

  it('falls back to the generic message when the body is not JSON', async () => {
    const err = { message: 'Failed to send a request to the Edge Function' };
    expect((await describeFunctionError(err)).message).toBe(err.message);
    expect((await describeFunctionError(null)).message).toBe('Request failed');
  });

  it('named wrappers send the expected payloads', async () => {
    mock.supabase.functions.invoke.mockResolvedValue({ data: 'TEXT', error: null });
    await exportDeployment({ deploymentId: 'd1', includeGoKit: false });
    expect(mock.supabase.functions.invoke).toHaveBeenLastCalledWith('export-deployment', { body: { deploymentId: 'd1', format: 'txt', includeGoKit: false } });
    await inviteUser({ email: 'a@b.c', role: 'viewer', aresGroupIds: ['g1'] });
    expect(mock.supabase.functions.invoke).toHaveBeenLastCalledWith('invite-user', { body: { email: 'a@b.c', role: 'viewer', aresGroupIds: ['g1'] } });
    await cleanupDeletedUser('KK4ODA');
    expect(mock.supabase.functions.invoke).toHaveBeenLastCalledWith('cleanup-deleted-user', { body: { callSign: 'KK4ODA' } });
  });
});
