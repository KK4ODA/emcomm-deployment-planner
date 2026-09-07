import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { updatePassword } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { InlineSpinner } from '@/components/common/LoadingState';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { describeError } from '@/components/common/ErrorState';
import { ROUTES } from '@/app/routes';

const MIN_PASSWORD = 8;

/**
 * Landing page for Supabase password-recovery links. The token arrives in
 * the URL hash and is consumed by the client (detectSessionInUrl), which
 * fires PASSWORD_RECOVERY; we also accept any live session as proof the
 * user came from a valid link.
 */
export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) setReady(true);
        else setInvalid(true);
      });
    }, 1000);
    return () => { cancelled = true; subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters`); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success('Password updated. You are signed in.');
      setTimeout(() => window.location.assign(ROUTES.dashboard), 500);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <AuthLayout title="Link expired" description="Password reset links can only be used once and expire quickly.">
        <Button asChild className="w-full"><Link to={ROUTES.login}>Back to sign in</Link></Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set a new password">
      {!ready ? (
        <div className="flex justify-center py-6"><InlineSpinner label="Verifying link" /></div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="New password" required hint={`At least ${MIN_PASSWORD} characters`}>
            {({ id }) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />}
          </FormField>
          <FormField label="Confirm new password" required error={error}>
            {({ id, invalid: isInvalid }) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required invalid={isInvalid} />}
          </FormField>
          <Button type="submit" className="w-full" loading={busy}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
