import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { User, Radio, Phone, Mail, Lock, UserPlus, Save, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { FormField } from '@/components/common/FormField';
import { AresGroupPicker } from '@/components/common/AresGroupPicker';
import { RoleBadge } from '@/components/common/Badges';
import { useAuth } from '@/lib/AuthContext';
import { useAresGroups } from '@/hooks/useEntities';
import { updateProfile, updateEmail, updatePassword } from '@/api/auth';
import { validateCallsign, validateEmail, normalizeCallsign } from '@/lib/callsign';
import { describeError } from '@/components/common/ErrorState';
import { AvatarUploader } from '@/features/profile/AvatarUploader';
import { AddMemberPanel } from '@/features/profile/AddMemberPanel';
import { platformLabel } from '@/lib/platform';

export default function Profile() {
  const { user, refreshProfile, isOfflineSession } = useAuth();
  const isAdmin = user?.app_role === 'admin';

  return (
    <>
      <PageHeader
        icon={User}
        title={user?.full_name || 'Profile'}
        description={<span className="inline-flex flex-wrap items-center gap-2">{user?.email} <RoleBadge role={user?.app_role} /></span>}
      />
      {isOfflineSession && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">You are working from a cached sign-in. Profile changes need a connection to the server.</p>
      )}
      <Tabs defaultValue="profile">
        <TabsList className="mb-2">
          <TabsTrigger value="profile"><User className="h-4 w-4" /> My profile</TabsTrigger>
          <TabsTrigger value="security"><Lock className="h-4 w-4" /> Sign-in</TabsTrigger>
          {isAdmin && <TabsTrigger value="add-member"><UserPlus className="h-4 w-4" /> Add member</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <ProfileForm user={user} onSaved={refreshProfile} />
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Photo</CardTitle></CardHeader>
                <CardContent><AvatarUploader user={user} onChanged={refreshProfile} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>About this app</CardTitle><CardDescription>Version and runtime</CardDescription></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-mono">{import.meta.env.VITE_APP_VERSION}</span></p>
                  <p className="flex justify-between"><span className="text-muted-foreground">Running as</span><span className="inline-flex items-center gap-1 capitalize"><Smartphone className="h-3.5 w-3.5" />{platformLabel()}</span></p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChangeEmailCard currentEmail={user?.email} onChanged={refreshProfile} />
            <ChangePasswordCard />
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="add-member">
            <Card className="max-w-2xl">
              <CardHeader><CardTitle>Add or update a member</CardTitle><CardDescription>Create the profile for a member before or after they sign up.</CardDescription></CardHeader>
              <CardContent><AddMemberPanel /></CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function ProfileForm({ user, onSaved }) {
  const { data: groups = [] } = useAresGroups();
  const [form, setForm] = useState({ full_name: '', call_sign: '', phone: '', aprs_call_sign: '', ares_group_ids: [] });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.app_role === 'admin';

  useEffect(() => {
    if (!user) return;
    setForm({ full_name: user.full_name || '', call_sign: user.call_sign || '', phone: user.phone || '', aprs_call_sign: user.aprs_call_sign || '', ares_group_ids: user.ares_group_ids || [] });
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    const cs = validateCallsign(form.call_sign); if (!cs.isValid) next.call_sign = cs.error;
    const aprs = validateCallsign(form.aprs_call_sign); if (!aprs.isValid) next.aprs_call_sign = aprs.error;
    if (!isAdmin && form.ares_group_ids.length === 0 && groups.length > 0) next.groups = 'Select at least one ARES group';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await updateProfile(user.id, form);
      await onSaved();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(`Could not save profile: ${describeError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Operator details</CardTitle><CardDescription>Your call sign identifies you in assignments and exports.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Full name" icon={User} required>
            {({ id }) => <Input id={id} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Call sign" icon={Radio} error={errors.call_sign} hint="e.g., W1ABC">
              {({ id, invalid }) => <Input id={id} value={form.call_sign} invalid={invalid} onChange={(e) => setForm({ ...form, call_sign: normalizeCallsign(e.target.value) })} className="font-mono text-base uppercase" />}
            </FormField>
            <FormField label="APRS call sign with SSID" icon={Radio} error={errors.aprs_call_sign} hint="-7 mobile, -9 portable">
              {({ id, invalid }) => <Input id={id} value={form.aprs_call_sign} invalid={invalid} onChange={(e) => setForm({ ...form, aprs_call_sign: normalizeCallsign(e.target.value) })} placeholder="W1ABC-9" className="font-mono text-base uppercase" />}
            </FormField>
          </div>
          <FormField label="Phone" icon={Phone} hint="For contact during deployments">
            {({ id }) => <Input id={id} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />}
          </FormField>
          <AresGroupPicker groups={groups} value={form.ares_group_ids} onChange={(ids) => setForm({ ...form, ares_group_ids: ids })} required={!isAdmin} hint="Which groups' deployments you take part in" />
          {errors.groups && <p className="text-xs text-destructive" role="alert">{errors.groups}</p>}
          <Button type="submit" loading={saving}><Save /> Save profile</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangeEmailCard({ currentEmail, onChanged }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const v = validateEmail(email);
    if (!v.isValid) { setError(v.error); return; }
    setError('');
    setBusy(true);
    try {
      await updateEmail(email.trim());
      toast.success('Confirmation sent. Open the link in your new inbox to finish the change.');
      setEmail('');
      await onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Email address</CardTitle><CardDescription>Currently {currentEmail}</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="New email" icon={Mail} error={error}>
            {({ id, invalid }) => <Input id={id} type="email" autoComplete="email" value={email} invalid={invalid} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <Button type="submit" variant="outline" loading={busy} disabled={!email}>Send confirmation</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [form, setForm] = useState({ next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (form.next.length < 8) { setError('Use at least 8 characters'); return; }
    if (form.next !== form.confirm) { setError('Passwords do not match'); return; }
    setError('');
    setBusy(true);
    try {
      await updatePassword(form.next);
      toast.success('Password updated');
      setForm({ next: '', confirm: '' });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Password</CardTitle><CardDescription>Choose a new password for this account.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="New password" icon={Lock} hint="At least 8 characters">
            {({ id }) => <Input id={id} type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />}
          </FormField>
          <FormField label="Confirm new password" icon={Lock} error={error}>
            {({ id, invalid }) => <Input id={id} type="password" autoComplete="new-password" value={form.confirm} invalid={invalid} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
          </FormField>
          <Button type="submit" variant="outline" loading={busy} disabled={!form.next}>Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}
