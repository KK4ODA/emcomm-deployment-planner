import React, { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2, Plus, Ban } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/common/FormField';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDeploymentShares, reportMutationError } from '@/hooks/useEntities';
import { createShareLink } from '@/api/registrations';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { formatDateTime } from '@/lib/time';

const shareUrl = (token) => `${window.location.origin}/s/${token}`;

/**
 * Read-only links to the plan for people with no account: the partner agency,
 * the venue, the operator who cannot find the address at one in the morning.
 * Contact details are left out unless the planner opts in, and the link can
 * be revoked. Only the hash of the token is stored.
 * @param {{ open: boolean, onClose: () => void, deployment: Object }} props
 */
export function ShareLinksDialog({ open, onClose, deployment }) {
  const sharesQ = useDeploymentShares(open ? deployment.id : null);
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [includeContacts, setIncludeContacts] = useState(false);
  const [issued, setIssued] = useState(/** @type {string|null} */ (null));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...queryKeys.deploymentShares, deployment.id] });

  const create = useMutation({
    mutationFn: () => createShareLink({ deploymentId: deployment.id, label: label.trim() || 'Shared link', includeContacts }),
    onSuccess: (r) => { setIssued(r.token); setLabel(''); setIncludeContacts(false); invalidate(); toast.success('Link created', { description: 'Copy it now; it is not shown again.' }); },
    onError: reportMutationError('Create link'),
  });
  const revoke = useMutation({
    mutationFn: (/** @type {string} */ id) => db.deploymentShares.update(id, { revoked_at: new Date().toISOString() }),
    onSuccess: () => { invalidate(); toast.success('Link revoked'); },
    onError: reportMutationError('Revoke link'),
  });

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied'); }
    catch { toast.error('Could not copy', { description: text }); }
  };

  const rows = sharesQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setIssued(null); onClose(); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share the plan read-only</DialogTitle>
          <DialogDescription>
            Anyone with the link sees the times, the sites with addresses and arrival notes, and the units. No sign-in, no editing, and no personal phone numbers unless you include contacts.
          </DialogDescription>
        </DialogHeader>

        {issued && (
          <div className="rounded-md border border-success/40 bg-success/5 p-3">
            <p className="mb-1.5 text-xs font-medium">New link, shown once</p>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl(issued)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={() => copy(shareUrl(issued))}><Copy /></Button>
            </div>
          </div>
        )}

        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <FormField label="Who is it for" hint="Shown in this list so you know what to revoke later">
            {({ id }) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. UASI exercise staff, Fire Station 10" />}
          </FormField>
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={includeContacts} onCheckedChange={setIncludeContacts} aria-label="Include contacts" />
            <span>
              Include contacts
              <span className="block text-xs text-muted-foreground">Adds each site&apos;s contact person and each unit&apos;s lead call sign. Leave off for a link you cannot control.</span>
            </span>
          </label>
          <Button type="submit" loading={create.isPending}><Plus /> Create link</Button>
        </form>

        {rows.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {rows.map(r => {
              const dead = r.revoked_at || (r.expires_at && new Date(r.expires_at) < new Date());
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.include_contacts && <Badge variant="warning">contacts</Badge>}
                  {dead ? <Badge variant="muted">revoked</Badge> : <Badge variant="success">live</Badge>}
                  <span className="text-xs text-muted-foreground">{r.view_count} view{r.view_count === 1 ? '' : 's'}{r.last_viewed_at ? `, last ${formatDateTime(r.last_viewed_at, 'MMM d HH:mm')}` : ''}</span>
                  {!dead && <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => revoke.mutate(r.id)}><Ban className="h-3.5 w-3.5" /> Revoke</Button>}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter><Button variant="outline" onClick={() => { setIssued(null); onClose(); }}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
