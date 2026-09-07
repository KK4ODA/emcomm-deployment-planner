import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { User, Radio, Phone, Mail, Lock, UserPlus, Save, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { FormField } from '@/components/common/FormField';
import { Badge } from '@/components/ui/badge';
import { RoleBadge } from '@/components/common/Badges';
import { useAuth } from '@/lib/AuthContext';
import { useAresGroups } from '@/hooks/useEntities';
import { updateProfile, updateEmail, updatePassword } from '@/api/auth';
import { validateCallsign, validateEmail, normalizeCallsign } from '@/lib/callsign';
import { describeError } from '@/components/common/ErrorState';
import { AvatarUploader } from '@/features/profile/AvatarUploader';
import { AddMemberPanel } from '@/features/profile/AddMemberPanel';
import { AboutPanel } from '@/features/about/AboutPanel';

const TABS = ['profile', 'security', 'add-member', 'about'];

export default function Profile() {
  const { user, refreshProfile, isOfflineSession } = useAuth();
  const isAdmin = user?.app_role === 'admin';
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.includes(requested) && (requested !== 'add-member' || isAdmin) ? requested : 'profile';
  const selectTab = (value) => setParams(value === 'profile' ? {} : { tab: value }, { replace: true });

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
      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="profile"><User className="h-4 w-4" /> My profile</TabsTrigger>
          <TabsTrigger value="security"><Lock className="h-4 w-4" /> Sign-in</TabsTrigger>
          {isAdmin && <TabsTrigger value="add-member"><UserPlus className="h-4 w-4" /> Add member</TabsTrigger>}
          <TabsTrigger value="about"><Info className="h-4 w-4" /> About</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <ProfileForm user={user} onSaved={refreshProfile} />
            <Card className="self-start">
              <CardHeader><CardTitle>Photo</CardTitle></CardHeader>
              <CardContent><AvatarUploader user={user} onChanged={refreshProfile} /></CardContent>
            </Card>
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

        <TabsContent value="about">
          <AboutPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProfileForm({ user, onSaved }) {
  const { data: groups = [] } = useAresGroups();
  const [form, setForm] = useState({ full_name: '', call_sign: '', phone: '', aprs_call_sign: '' });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({ full_name: user.full_name || '', call_sign: user.call_sign || '', phone: user.phone || '', aprs_call_sign: user.aprs_call_sign || '' });
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    const cs = validateCallsign(form.call_sign); if (!cs.isValid) next.call_sign = cs.error;
    const aprs = validateCallsign(form.aprs_call_sign); if (!aprs.isValid) next.aprs_call_sign = aprs.error;
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
          <div className="space-y-1.5">
            <p className="text-sm font-medium">ARES groups</p>
            <div className="flex flex-wrap gap-1.5">
              {(user?.ares_group_ids || []).map(id => <Badge key={id} variant="info">{groups.find(g => g.id === id)?.name ?? id}</Badge>)}
              {!(user?.ares_group_ids || []).length && <span className="text-xs text-muted-foreground">None yet</span>}
            </div>
            <p className="text-xs text-muted-foreground">Membership is granted by a group admin. Ask an admin to add you to another group.</p>
          </div>
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
