/**
 * Compatibility shim: replaces the Base44 SDK with Supabase-backed implementations.
 *
 * All existing code imports `base44` from this file and uses:
 *   - base44.entities.X.list/filter/create/update/delete/subscribe
 *   - base44.auth.me/logout/redirectToLogin
 *   - base44.functions.invoke(name, payload)
 *   - base44.users.inviteUser(email, role)
 *
 * This shim provides all of these backed by Supabase.
 */
import { supabase } from './supabaseClient';
import { entities } from './entities';
import { invokeFunction } from './functions';

// Auth shim
const auth = {
  /**
   * Get the current authenticated user's profile from the users table.
   * Mimics base44.auth.me() which returns the full user profile.
   */
  async me() {
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      return this._fetchProfile(user);
    }
    return this._fetchProfile(authUser);
  },

  async _fetchProfile(authUser) {
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error || !profile) {
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || '',
        app_role: 'pending',
        ares_group_ids: [],
        call_sign: '',
        phone: '',
        aprs_call_sign: ''
      };
    }

    return profile;
  },

  /**
   * Sign out the current user.
   */
  async logout() {
    await supabase.auth.signOut();
    window.location.href = '/Login';
  },

  /**
   * Redirect to the login page.
   */
  redirectToLogin() {
    window.location.href = '/Login';
  },

  /**
   * Update the current user's profile and/or auth credentials.
   * Handles three scenarios from the Profile page:
   *   1. Profile fields (full_name, call_sign, etc.) -> update users table
   *   2. Email change ({ email, password }) -> update Supabase auth email
   *   3. Password change ({ password, newPassword }) -> update Supabase auth password
   */
  async updateMe(data) {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) throw new Error('Not authenticated');

    // Handle password change
    if (data.newPassword) {
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword
      });
      if (error) throw error;
      return;
    }

    // Handle email change
    if (data.email && data.password) {
      const { error } = await supabase.auth.updateUser({
        email: data.email
      });
      if (error) throw error;
      return;
    }

    // Handle profile update (users table)
    const { email, password, newPassword, confirmPassword, ...profileData } = data;
    const { data: result, error } = await supabase
      .from('users')
      .update(profileData)
      .eq('id', authUser.id)
      .select()
      .single();

    if (error) throw error;
    return result;
  }
};

// Functions shim
const functions = {
  invoke: invokeFunction
};

// Users shim (for invitation flow)
const users = {
  async inviteUser(email, role) {
    return invokeFunction('invite-user', { email, role });
  }
};

// Agents shim (WhatsApp integration - not available in standalone mode)
const agents = {
  getWhatsAppConnectURL() {
    return '#';
  }
};

export const base44 = {
  entities,
  auth,
  functions,
  users,
  agents,
};
