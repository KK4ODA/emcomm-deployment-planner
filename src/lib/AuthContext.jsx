import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

// Cached identity bundle (Phase 1 lite per design doc §10).
// We persist the user profile to localStorage on every successful load so the
// app can stay "logged in" when offline (Service Worker serves cached assets;
// IndexedDB serves data; this lets AuthContext serve the user state).
//
// Phase 2 will add Ed25519 signing for verification by BBS / LAN peers.
const CACHE_KEY = 'emcomm_cached_identity';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function saveCachedIdentity(profile) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      profile,
      issued_at: Date.now(),
      expires_at: Date.now() + CACHE_TTL_MS,
    }));
  } catch (_) { /* localStorage full or denied; ignore */ }
}

function readCachedIdentity() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const bundle = JSON.parse(raw);
    if (!bundle?.profile || !bundle?.expires_at) return null;
    if (bundle.expires_at < Date.now()) return null; // expired
    return bundle.profile;
  } catch (_) {
    return null;
  }
}

function clearCachedIdentity() {
  try { localStorage.removeItem(CACHE_KEY); } catch (_) { /* ignore */ }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // Keep isLoadingPublicSettings for compatibility with App.jsx (always false since no Base44 app settings)
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  // True when the active session is from the localStorage cache (Supabase unreachable)
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  useEffect(() => {
    // Check initial session
    checkSession();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          await loadUserProfile(session.user);
        } else if (event === 'SIGNED_OUT') {
          clearCachedIdentity();
          setUser(null);
          setIsAuthenticated(false);
          setIsOfflineSession(false);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Session refreshed, user stays logged in
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      // 3-second timeout so a hung Supabase call falls back to cache fast
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );

      let session = null;
      try {
        const result = await Promise.race([sessionPromise, timeoutPromise]);
        session = result?.data?.session ?? null;
      } catch (_) {
        session = null;
      }

      if (session?.user) {
        await loadUserProfile(session.user);
        return;
      }

      // No live session — try the cached identity bundle
      const cached = readCachedIdentity();
      if (cached) {
        setUser(cached);
        setIsAuthenticated(true);
        setIsOfflineSession(true);
        setIsLoadingAuth(false);
        return;
      }

      // No session and no usable cache — require login
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } catch (error) {
      console.error('Session check failed:', error);

      // Even if Supabase is fully unreachable, try cache before giving up
      const cached = readCachedIdentity();
      if (cached) {
        setUser(cached);
        setIsAuthenticated(true);
        setIsOfflineSession(true);
        setIsLoadingAuth(false);
        return;
      }

      setAuthError({ type: 'auth_required', message: 'Authentication required' });
      setIsLoadingAuth(false);
    }
  };

  const loadUserProfile = async (authUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      let resolvedProfile;
      if (error) {
        // Profile might not exist yet (race condition with trigger)
        if (error.code === 'PGRST116') {
          // No profile row found — set minimal user from auth
          resolvedProfile = {
            id: authUser.id,
            email: authUser.email,
            full_name: authUser.user_metadata?.full_name || '',
            app_role: 'pending',
            ares_group_ids: []
          };
        } else {
          throw error;
        }
      } else {
        resolvedProfile = profile;
      }

      setUser(resolvedProfile);
      setIsAuthenticated(true);
      setIsOfflineSession(false);
      setIsLoadingAuth(false);
      saveCachedIdentity(resolvedProfile);
    } catch (error) {
      console.error('Failed to load user profile:', error);

      // If the profile fetch failed but we have a cached identity, fall back
      const cached = readCachedIdentity();
      if (cached && cached.id === authUser.id) {
        setUser(cached);
        setIsAuthenticated(true);
        setIsOfflineSession(true);
        setIsLoadingAuth(false);
        return;
      }

      setAuthError({
        type: 'unknown',
        message: error.message || 'Failed to load user profile'
      });
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    clearCachedIdentity();
    setUser(null);
    setIsAuthenticated(false);
    setIsOfflineSession(false);
    await supabase.auth.signOut();
    window.location.href = '/Login';
  };

  const navigateToLogin = () => {
    window.location.href = '/Login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      isOfflineSession,
      authError,
      logout,
      navigateToLogin,
      checkAppState: checkSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
