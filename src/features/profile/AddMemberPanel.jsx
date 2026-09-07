import React, { useState } from 'react';
import { toast } from 'sonner';
import { Search, UserPlus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { db } from '@/api/db';
import { upsertMemberProfile } from '@/api/functions';
import { validateEmail, validateCallsign, normalizeCallsign } from '@/lib/callsign';

const EMPTY = { email: '', full_name: '', call_sign: '', phone: '', aprs_call_sign: '' };

/**
 * Admin tool: look a member up by email, then either update their profile
 * or invite them with the profile pre-filled.
 */
export function AddMemberPanel() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(/** @type {'idle'|'searching'|'found'|'not_found'} */ ('idle'));
  const [existing, setExisting] = useState(null);
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [saving, setSaving] = useState(false);

  const reset = () => { setForm(EMPTY); setStatus('idle'); setExisting(null); setErrors({}); };

  const lookup = async () => {
    const v = validateEmail(form.email);
    if (!v.isValid) { setErrors({ email: v.error }); return; }
    setErrors({});
    setStatus('searching');
    try {
      const rows = await db.users.where({ email: form.email.trim() });
      const row = rows[0] ?? null;
      setExisting(row);
      setForm(f => ({ ...f, full_name: row?.full_name || '', call_sign: row?.call_sign || '', phone: row?.phone || '', aprs_call_sign: row?.aprs_call_sign || '' }));
      setStatus(row ? 'found' : 'not_found');
    } catch (err) {
      toast.error(`Lookup failed: ${err.message || 'unknown error'}`);
      setStatus('idle');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    if (!form.full_name.trim()) next.full_name = 'Required';
    if (!form.phone.trim()) next.phone = 'Required';
    const cs = validateCallsign(form.call_sign); if (!form.call_sign) next.call_sign = 'Required'; else if (!cs.isValid) next.call_sign = cs.error;
    const aprs = validateCallsign(form.aprs_call_sign); if (!aprs.isValid) next.aprs_call_sign = aprs.error;
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const res = await upsertMemberProfile({ ...form, email: form.email.trim() });
      toast.success(res.message);
      reset();
    } catch (err) {
      toast.error(`Failed: ${err.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const locked = status !== 'idle' && status !== 'searching';

  return (
    <div className="space-y-4">
      <FormField label="Member email" required error={errors.email} hint="Look up the address first. Existing members are updated; new ones are invited.">
        {({ id, invalid }) => (
          <div className="flex gap-2">
            <Input id={id} type="email" value={form.email} disabled={locked} invalid={invalid} onChange={(e) => setForm({ ...form, email: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !locked) { e.preventDefault(); lookup(); } }} placeholder="member@example.com" />
            {locked ? (
              <Button type="button" variant="outline" onClick={reset}><RotateCcw /> Start over</Button>
            ) : (
              <Button type="button" onClick={lookup} loading={status === 'searching'} disabled={!form.email}><Search /> Look up</Button>
            )}
          </div>
        )}
      </FormField>

      {status === 'found' && (
        <p className="rounded-md border border-info/30 bg-info/10 p-3 text-sm"><strong>Existing member:</strong> {existing?.full_name || existing?.email}. Saving updates their profile; their password is unaffected.</p>
      )}
      {status === 'not_found' && (
        <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm"><strong>New member.</strong> An invitation email will be sent; they set their own password. The fields below pre-fill their profile.</p>
      )}

      {locked && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Full name" required error={errors.full_name}>
            {({ id, invalid }) => <Input id={id} value={form.full_name} invalid={invalid} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Call sign" required error={errors.call_sign}>
              {({ id, invalid }) => <Input id={id} value={form.call_sign} invalid={invalid} onChange={(e) => setForm({ ...form, call_sign: normalizeCallsign(e.target.value) })} className="font-mono uppercase" />}
            </FormField>
            <FormField label="APRS call sign" error={errors.aprs_call_sign}>
              {({ id, invalid }) => <Input id={id} value={form.aprs_call_sign} invalid={invalid} onChange={(e) => setForm({ ...form, aprs_call_sign: normalizeCallsign(e.target.value) })} placeholder="W1ABC-9" className="font-mono uppercase" />}
            </FormField>
          </div>
          <FormField label="Phone" required error={errors.phone}>
            {({ id, invalid }) => <Input id={id} type="tel" value={form.phone} invalid={invalid} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </FormField>
          <Button type="submit" loading={saving} className="w-full sm:w-auto"><UserPlus /> {status === 'found' ? 'Update member' : 'Send invitation'}</Button>
        </form>
      )}
    </div>
  );
}
