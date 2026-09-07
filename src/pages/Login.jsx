import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormField } from '@/components/common/FormField';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { signIn, signUp, requestPasswordReset } from '@/api/auth';
import { useAuth } from '@/lib/AuthContext';
import { describeError } from '@/components/common/ErrorState';
import { ROUTES } from '@/app/routes';

const MIN_PASSWORD = 8;

export default function Login() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState(/** @type {'signin'|'signup'|'reset'} */ ('signin'));

  if (!isLoadingAuth && isAuthenticated) {
    return <Navigate to={location.state?.from || ROUTES.dashboard} replace />;
  }

  if (mode === 'reset') {
    return (
      <AuthLayout title="Reset your password" description="We will email you a link to choose a new password.">
        <ResetForm onBack={() => setMode('signin')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Use the account your ARES group admin set up for you."
      footer={<span>Trouble signing in? Contact your group administrator.</span>}
    >
      <Tabs value={mode} onValueChange={(v) => setMode(/** @type {any} */ (v))}>
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="signin"><SignInForm onForgot={() => setMode('reset')} /></TabsContent>
        <TabsContent value="signup"><SignUpForm onDone={() => setMode('signin')} /></TabsContent>
      </Tabs>
    </AuthLayout>
  );
}

function SignInForm({ onForgot }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
      // AuthProvider picks up SIGNED_IN and the <Navigate> above takes over.
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormField label="Email" required>
        {({ id }) => <Input id={id} type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
      </FormField>
      <FormField label="Password" required error={error}>
        {({ id, invalid }) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required invalid={invalid} />}
      </FormField>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onForgot} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Forgot password?
        </button>
      </div>
      <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
    </form>
  );
}

function SignUpForm({ onDone }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters`); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await signUp({ email: form.email.trim(), password: form.password, fullName: form.fullName.trim() });
      toast.success('Account created. Check your email for a confirmation link, then sign in.');
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormField label="Full name" required>
        {({ id }) => <Input id={id} autoComplete="name" value={form.fullName} onChange={set('fullName')} required />}
      </FormField>
      <FormField label="Email" required>
        {({ id }) => <Input id={id} type="email" autoComplete="email" value={form.email} onChange={set('email')} required />}
      </FormField>
      <FormField label="Password" required hint={`At least ${MIN_PASSWORD} characters`}>
        {({ id }) => <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />}
      </FormField>
      <FormField label="Confirm password" required error={error}>
        {({ id, invalid }) => <Input id={id} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required invalid={invalid} />}
      </FormField>
      <p className="text-xs text-muted-foreground">New accounts start as “Pending approval” until an admin assigns a role.</p>
      <Button type="submit" className="w-full" loading={busy}>Create account</Button>
    </form>
  );
}

function ResetForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await requestPasswordReset(email.trim(), `${window.location.origin}${ROUTES.resetPassword}`);
      setSent(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          <p className="font-medium">Reset email sent</p>
          <p className="mt-1 text-muted-foreground">Check the inbox for <span className="font-mono">{email}</span> and follow the link. It expires after a short time.</p>
        </div>
        <Button variant="outline" className="w-full" onClick={onBack}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormField label="Email" required error={error}>
        {({ id, invalid }) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus invalid={invalid} />}
      </FormField>
      <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>Back to sign in</Button>
      <p className="sr-only"><Link to={ROUTES.login}>Sign in</Link></p>
    </form>
  );
}
