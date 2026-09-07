import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createSupabaseMock } from '@/test/supabaseMock';

const mock = createSupabaseMock();
vi.mock('@/api/supabaseClient', () => ({ supabase: mock.supabase }));

const { AuthProvider, useAuth } = await import('./AuthContext.jsx');
const { saveCachedIdentity, CACHED_IDENTITY_KEY } = await import('@/api/auth');

function Probe() {
  const { user, isLoadingAuth, isOfflineSession, authError } = useAuth();
  if (isLoadingAuth) return <p>loading</p>;
  if (authError) return <p>error:{authError.type}</p>;
  return <p>{user.call_sign}{isOfflineSession ? ' (offline)' : ''}</p>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mock.supabase.auth.getSession.mockReset();
    mock.setResponse({ data: null, error: null });
  });

  it('loads the profile for a live session and caches it', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } });
    mock.setResponse({ data: { id: 'u1', call_sign: 'KK4ODA', app_role: 'admin' }, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('KK4ODA')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CACHED_IDENTITY_KEY)).profile.call_sign).toBe('KK4ODA');
  });

  it('falls back to the cached identity when there is no session', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    saveCachedIdentity({ id: 'u1', call_sign: 'W1AW', app_role: 'operator', ares_group_ids: [] });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('W1AW (offline)')).toBeInTheDocument();
  });

  it('requires authentication when there is neither session nor cache', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('error:auth_required')).toBeInTheDocument());
  });

  it('uses the cache when the profile fetch fails for the same user', async () => {
    mock.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mock.setResponse({ data: null, error: new Error('network down') });
    saveCachedIdentity({ id: 'u1', call_sign: 'N0CALL', app_role: 'viewer', ares_group_ids: [] });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('N0CALL (offline)')).toBeInTheDocument();
    spy.mockRestore();
  });
});
