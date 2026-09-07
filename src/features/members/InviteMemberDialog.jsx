import React, { useEffect, useState } from 'react';
import { UserPlus, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { AresGroupPicker } from '@/components/common/AresGroupPicker';
import { RoleBadge } from '@/components/common/Badges';
import { useAresGroups } from '@/hooks/useEntities';
import { ROLES, getRoleDescription } from '@/lib/permissions';
import { validateEmail } from '@/lib/callsign';

/**
 * @param {{ open: boolean, onClose: () => void, onInvite: (data: { email: string, role: string, aresGroupIds: string[] }) => void, currentUserRole: string, submitting?: boolean }} props
 */
export function InviteMemberDialog({ open, onClose, onInvite, currentUserRole, submitting }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(/** @type {string} */ (ROLES.PENDING));
  const [groupIds, setGroupIds] = useState([]);
  const [error, setError] = useState('');
  const { data: groups = [] } = useAresGroups({ enabled: open });

  useEffect(() => { if (open) { setEmail(''); setRole(ROLES.PENDING); setGroupIds([]); setError(''); } }, [open]);

  const roles = currentUserRole === ROLES.ADMIN
    ? [ROLES.PENDING, ROLES.VIEWER, ROLES.OPERATOR, ROLES.PLANNER, ROLES.ADMIN]
    : [ROLES.PENDING, ROLES.VIEWER, ROLES.OPERATOR];

  const submit = (e) => {
    e.preventDefault();
    const v = validateEmail(email);
    if (!v.isValid) { setError(v.error); return; }
    if (!groupIds.length) { setError('Select at least one ARES group'); return; }
    setError('');
    onInvite({ email: email.trim(), role, aresGroupIds: groupIds });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Invite member</DialogTitle>
          <DialogDescription>They receive an email with a link to set their password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Email" required icon={Mail} error={error && !groupIds.length && error.includes('ARES') ? undefined : error}>
            {({ id, invalid }) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operator@example.com" required invalid={invalid} autoFocus />}
          </FormField>
          <FormField label="Initial role" hint={getRoleDescription(role)}>
            {({ id }) => (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map(r => <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <AresGroupPicker groups={groups} value={groupIds} onChange={setGroupIds} required hint="Which groups' deployments they can see" />
          {error.includes('ARES') && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">Start new members as “Pending approval” and upgrade them after verifying their licence.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={submitting}>Send invitation</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
