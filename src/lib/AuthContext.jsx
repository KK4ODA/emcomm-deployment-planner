import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/api/supabaseClient';
import {
  fetchProfile,
  getSessionWithTimeout,
  readCachedIdentity,
  saveCachedIdentity,
  clearCachedIdentity,
  signOut as signOutRequest,
} from '@/api/auth';

/**
 * @typedef {import('@/api/auth').UserProfile} UserProfile
 *
 * @typedef {Object} AuthState
 * @property {UserProfile|null} user
 * @property {boolean} isAuthenticated
 * @property {boolean} isLoadingAuth
 * @property {boolean} isOfflineSession true when the profile came from the local cache because the backend was unreachable
 * @property {{ type: 'auth_required'|'unknown', message: string }|null} authError
 * @property {() => Promise<void>} logout
 * @property {() => Promise<void>} refreshProfile re-read the profile row (after edits)
 */

const AuthContext = createContext(/** @type {AuthState|null} */ (null));

export const LOGIN_PATH = '/Login';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(/** @type {UserProfile|null} */ (null));
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);
  const [authError, setAuthError] = useState(null);

  const applyCachedIdentity = useCallback((expectedId) => {
    const cached = readCachedIdentity();
    if (!cached || (expectedId && cached.id !== expectedId)) return false;
    setUser(cached);
    setIsOfflineSession(true);
    setAuthError(null);
    setIsLoadingAuth(false);
    return true;
  }, []);

  const loadUserProfile = useCallback(async (authUser) => {
    try {
      const profile = await fetchProfile(authUser);
      setUser(profile);
      setIsOfflineSession(false);
      setAuthError(null);
      setIsLoadingAuth(false);
      saveCachedIdentity(profile);
    } catch (error) {
      console.error('Failed to load user profile:', error);
      if (applyCachedIdentity(authUser.id)) return;
      setAuthError({ type: 'unknown', message: error.message || 'Failed to load user profile' });
      setIsLoadingAuth(false);
    }
  }, [applyCachedIdentity]);

  const checkSession = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    const session = await getSessionWithTimeout();
    if (session?.user) {
      await loadUserProfile(session.user);
      return;
    }
    // No live session: fall back to the cached identity so the app opens offline.
    if (applyCachedIdentity()) return;
    setUser(null);
    setIsLoadingAuth(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
  }, [loadUserProfile, applyCachedIdentity]);

  useEffect(() => {
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await loadUserProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        clearCachedIdentity();
        setUser(null);
        setIsOfflineSession(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [checkSession, loadUserProfile]);

  const logout = useCallback(async () => {
    clearCachedIdentity();
    setUser(null);
    setIsOfflineSession(false);
    try {
      await signOutRequest();
    } catch (error) {
      // Offline sign-out still clears the local session; nothing else to do.
      console.warn('Sign-out request failed:', error);
    }
    window.location.assign(LOGIN_PATH);
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isLoadingAuth,
    isOfflineSession,
    authError,
    logout,
    refreshProfile: checkSession,
  }), [user, isLoadingAuth, isOfflineSession, authError, logout, checkSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** @returns {AuthState} */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
