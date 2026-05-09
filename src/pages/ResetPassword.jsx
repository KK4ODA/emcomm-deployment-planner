import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Lands the user from a Supabase password-recovery email.
 * The recovery token arrives in the URL hash (#access_token=...&type=recovery)
 * and is auto-consumed by the Supabase JS client thanks to detectSessionInUrl: true,
 * which fires a PASSWORD_RECOVERY auth event we listen for below.
 */
export default function ResetPassword() {
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // The PASSWORD_RECOVERY event may fire before this component mounts
    // (the SDK processes the URL hash on initialization). So we don't rely on it
    // alone — we also check for an active session: if the user landed on
    // /reset-password and has a session, they came from a recovery link.
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryReady(true);
    });

    // Give the SDK ~1s to consume any recovery hash, then check session.
    const t = setTimeout(() => {
      if (cancelled) return;
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          setRecoveryReady(true);
        } else {
          setTokenInvalid(true);
        }
      });
    }, 1000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success('Password updated. You are now signed in.');
      // Small delay so the toast renders before the navigation
      setTimeout(() => { window.location.href = '/'; }, 600);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update password');
      setSubmitting(false);
    }
  };

  if (tokenInvalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="h-5 w-5" /> Invalid or expired link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              This password reset link isn't valid anymore. Reset links expire after a short time and can only be used once.
            </p>
            <Link to="/Login">
              <Button className="w-full bg-slate-900 hover:bg-slate-800">Back to sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-3 bg-slate-900 rounded-xl">
            <Radio className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">EmComm Planner</h1>
            <p className="text-sm text-slate-500">Reset your password</p>
          </div>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-center text-lg">Set a new password</CardTitle>
          </CardHeader>
          <CardContent>
            {!recoveryReady ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Type it again"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                    {errorMsg}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
