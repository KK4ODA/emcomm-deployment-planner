import React, { useState } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AresGroupPicker } from '@/components/common/AresGroupPicker';
import { useAuth } from '@/lib/AuthContext';
import { useAresGroups } from '@/hooks/useEntities';
import { updateProfile } from '@/api/auth';

/**
 * First-run gate: non-admin members must belong to at least one ARES group
 * before they can see deployments. Rendered inside the shell; shows nothing
 * once the profile has groups.
 */
export function RequireAresGroup() {
  const { user, refreshProfile } = useAuth();
  const { data: groups = [] } = useAresGroups({ enabled: !!user });
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const needsGroups = user && user.app_role !== 'admin' && !(user.ares_group_ids?.length > 0) && groups.length > 0;
  if (!needsGroups) return null;

  const save = async () => {
    if (!selected.length) { toast.error('Select at least one ARES group'); return; }
    setSaving(true);
    try {
      await updateProfile(user.id, { ares_group_ids: selected });
      await refreshProfile();
      toast.success('ARES groups saved');
    } catch (err) {
      toast.error(`Could not save: ${err.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent hideClose onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="max-w-md">
        <DialogHeader>
          <div className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-md bg-info/10 text-info">
            <Users className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle>Select your ARES groups</DialogTitle>
          <DialogDescription>
            Deployments are shared within ARES groups. Choose the groups you belong to; an admin can adjust this later.
          </DialogDescription>
        </DialogHeader>
        <AresGroupPicker groups={groups} value={selected} onChange={setSelected} required maxHeight="max-h-64" />
        <Button onClick={save} loading={saving} disabled={!selected.length} className="w-full">
          Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
