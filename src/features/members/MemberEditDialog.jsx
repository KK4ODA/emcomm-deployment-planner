import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { AresGroupPicker } from '@/components/common/AresGroupPicker';
import { useAresGroups } from '@/hooks/useEntities';
import { validateCallsign, normalizeCallsign } from '@/lib/callsign';

/**
 * Admin edit of another member's profile fields and ARES groups.
 * @param {{ open: boolean, onClose: () => void, onSave: (data: Object) => void, member: Object|null, submitting?: boolean }} props
 */
export function MemberEditDialog({ open, onClose, onSave, member, submitting }) {
  const [form, setForm] = useState({ full_name: '', call_sign: '', phone: '', aprs_call_sign: '', ares_group_ids: [] });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const { data: groups = [] } = useAresGroups({ enabled: open });

  useEffect(() => {
    if (open && member) {
      setErrors({});
      setForm({ full_name: member.full_name || '', call_sign: member.call_sign || '', phone: member.phone || '', aprs_call_sign: member.aprs_call_sign || '', ares_group_ids: member.ares_group_ids || [] });
    }
  }, [open, member]);

  const submit = (e) => {
    e.preventDefault();
    /** @type {Record<string, string>} */
    const next = {};
    const cs = validateCallsign(form.call_sign); if (!cs.isValid) next.call_sign = cs.error;
    const aprs = validateCallsign(form.aprs_call_sign); if (!aprs.isValid) next.aprs_call_sign = aprs.error;
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>{member?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Full name" required>
            {({ id }) => <Input id={id} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Call sign" error={errors.call_sign}>
              {({ id, invalid }) => <Input id={id} value={form.call_sign} onChange={(e) => setForm({ ...form, call_sign: normalizeCallsign(e.target.value) })} className="font-mono uppercase" invalid={invalid} />}
            </FormField>
            <FormField label="APRS call sign" error={errors.aprs_call_sign}>
              {({ id, invalid }) => <Input id={id} value={form.aprs_call_sign} onChange={(e) => setForm({ ...form, aprs_call_sign: normalizeCallsign(e.target.value) })} placeholder="W1ABC-9" className="font-mono uppercase" invalid={invalid} />}
            </FormField>
          </div>
          <FormField label="Phone">
            {({ id }) => <Input id={id} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </FormField>
          <AresGroupPicker groups={groups} value={form.ares_group_ids} onChange={(ids) => setForm({ ...form, ares_group_ids: ids })} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
