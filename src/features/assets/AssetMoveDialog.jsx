import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';

const NONE = '__none__';
const TITLES = { checked_out: 'I have it', transferred: 'Hand to someone', on_site: 'On site', returned: 'Returned to storage', retired: 'Retire', restored: 'Back in service' };

/**
 * Confirm a custody move with the details it needs: who, which deployment,
 * which site, a note.
 * @param {{ open: boolean, onClose: () => void, asset: Object|null, action: string|null, users: Object[], deployments: Object[], sites: Object[], currentDeploymentId?: string|null, onConfirm: (args: { toUserId: string|null, deploymentId: string|null, siteId: string|null, note: string }) => void, submitting?: boolean }} props
 */
export function AssetMoveDialog({ open, onClose, asset, action, users, deployments, sites, currentDeploymentId = null, onConfirm, submitting }) {
  const [toUserId, setToUserId] = useState('');
  const [deploymentId, setDeploymentId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setToUserId('');
    setDeploymentId(asset?.deployment_id || currentDeploymentId || '');
    setSiteId(asset?.site_id || '');
    setNote('');
  }, [open, asset, currentDeploymentId]);
  if (!asset || !action) return null;
  const needsUser = action === 'transferred';
  const needsDeployment = action === 'checked_out' || action === 'on_site' || action === 'transferred';
  const needsSite = action === 'on_site';
  const depSites = sites.filter(s => s.deployment_id === deploymentId);
  const ok = (!needsUser || toUserId) && (!needsSite || siteId || !depSites.length);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[action] || action}: {asset.name}</DialogTitle>
          <DialogDescription>Every move is recorded with your name and the time, so the next person can find it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (ok) onConfirm({ toUserId: toUserId || null, deploymentId: deploymentId || null, siteId: siteId || null, note }); }} className="space-y-3">
          {needsUser && (
            <FormField label="Who has it now" required>
              {({ id }) => (
                <Select value={toUserId || NONE} onValueChange={(v) => setToUserId(v === NONE ? '' : v)}>
                  <SelectTrigger id={id}><SelectValue placeholder="Pick a member" /></SelectTrigger>
                  <SelectContent><SelectItem value={NONE}>Pick a member</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.call_sign || u.full_name || u.email}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          )}
          {needsDeployment && (
            <FormField label="For which deployment" hint="Optional; ties it to the teardown checklist">
              {({ id }) => (
                <Select value={deploymentId || NONE} onValueChange={(v) => { setDeploymentId(v === NONE ? '' : v); setSiteId(''); }}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value={NONE}>None / general use</SelectItem>{deployments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          )}
          {needsSite && depSites.length > 0 && (
            <FormField label="Which site" required>
              {({ id }) => (
                <Select value={siteId || NONE} onValueChange={(v) => setSiteId(v === NONE ? '' : v)}>
                  <SelectTrigger id={id}><SelectValue placeholder="Pick a site" /></SelectTrigger>
                  <SelectContent><SelectItem value={NONE}>Pick a site</SelectItem>{depSites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Note" hint="Optional: “in the blue bin”, “left with the site captain”">
            {({ id }) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={!ok}>{TITLES[action] || 'Confirm'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
