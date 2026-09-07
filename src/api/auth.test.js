import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));

const auth = await import('./auth.js');

describe('cached identity', () => {
  const profile = { id: 'u1', email: 'op@example.com', app_role: 'operator', ares_group_ids: ['g1'] };

  it('round-trips a profile through localStorage', () => {
    auth.saveCachedIdentity(profile, 1_000);
    expect(auth.readCachedIdentity(2_000)).toEqual(profile);
  });

  it('expires after the TTL', () => {
    auth.saveCachedIdentity(profile, 1_000);
    expect(auth.readCachedIdentity(1_000 + auth.CACHED_IDENTITY_TTL_MS + 1)).toBeNull();
  });

  it('returns null for missing or corrupt bundles', () => {
    expect(auth.readCachedIdentity()).toBeNull();
    localStorage.setItem(auth.CACHED_IDENTITY_KEY, '{not json');
    expect(auth.readCachedIdentity()).toBeNull();
    localStorage.setItem(auth.CACHED_IDENTITY_KEY, JSON.stringify({ profile }));
    expect(auth.readCachedIdentity()).toBeNull();
  });

  it('clears the bundle', () => {
    auth.saveCachedIdentity(profile);
    auth.clearCachedIdentity();
    expect(auth.readCachedIdentity()).toBeNull();
  });
});

describe('profiles', () => {
  beforeEach(() => {
    mock.calls.length = 0;
    mock.supabase.from.mockClear();
  });

  it('derives a pending profile from the auth user when no row exists', async () => {
    mock.setResponse({ data: null, error: null });
    const p = await auth.fetchProfile({ id: 'u9', email: 'new@example.com', user_metadata: { full_name: 'New Op' } });
    expect(p).toEqual({ id: 'u9', email: 'new@example.com', full_name: 'New Op', app_role: 'pending', ares_group_ids: [] });
  });

  it('returns the users row when present', async () => {
    const row = { id: 'u1', app_role: 'admin' };
    mock.setResponse({ data: row, error: null });
    expect(await auth.fetchProfile({ id: 'u1' })).toBe(row);
    expect(mock.supabase.from).toHaveBeenCalledWith('users');
  });

  it('only sends editable fields on profile update', async () => {
    mock.setResponse({ data: { id: 'u1' }, error: null });
    await auth.updateProfile('u1', { call_sign: 'KK4ODA', phone: '555', app_role: 'admin', id: 'evil', email: 'x' });
    expect(mock.lastCalls('update')[0].args[0]).toEqual({ call_sign: 'KK4ODA', phone: '555' });
    expect(mock.lastCalls('eq')[0].args).toEqual(['id', 'u1']);
  });
});

describe('session helpers', () => {
  it('signIn passes credentials to Supabase and unwraps errors', async () => {
    mock.supabase.auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    await auth.signIn('a@b.c', 'pw');
    expect(mock.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' });
    mock.supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: new Error('Invalid login credentials') });
    await expect(auth.signIn('a@b.c', 'bad')).rejects.toThrow('Invalid login credentials');
  });

  it('signUp stores the full name in user metadata', async () => {
    mock.supabase.auth.signUp.mockResolvedValue({ data: {}, error: null });
    await auth.signUp({ email: 'a@b.c', password: 'pw', fullName: 'Ada' });
    expect(mock.supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw', options: { data: { full_name: 'Ada' } } });
  });

  it('getSessionWithTimeout returns null when the client hangs', async () => {
    mock.supabase.auth.getSession.mockImplementation(() => new Promise(() => {}));
    expect(await auth.getSessionWithTimeout(10)).toBeNull();
  });

  it('requestPasswordReset forwards the redirect URL', async () => {
    await auth.requestPasswordReset('a@b.c', 'https://app/reset-password');
    expect(mock.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', { redirectTo: 'https://app/reset-password' });
  });
});
