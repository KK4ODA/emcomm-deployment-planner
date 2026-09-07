import React, { useEffect, useState } from 'react';
import { Send, Users, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/common/FormField';
import { formatDateTime } from '@/lib/time';
import { usePlanChanges } from './usePlanChanges';
import { toPublishPayload } from '@/lib/planDiff';

/**
 * Publish the current plan as a new version. Shows what changed per position
 * since the last publication; only operators on changed positions are
 * notified (with their changes) unless "notify everyone" is ticked.
 * @param {{ open: boolean, onClose: () => void, deployment: Object, onPublish: (note: string, extra: { changes: Object[], notifyAll: boolean }) => void, submitting?: boolean }} props
 */
export function PublishPlanDialog({ open, onClose, deployment, onPublish, submitting }) {
  const [note, setNote] = useState('');
  const [notifyAll, setNotifyAll] = useState(false);
  const { loading, result } = usePlanChanges(open ? deployment : null);
  const changed = result?.changed ?? [];
  const nothingChanged = !!result && changed.length === 0;
  useEffect(() => { if (open) { setNote(''); setNotifyAll(false); } }, [open]);
  useEffect(() => { if (nothingChanged) setNotifyAll(true); }, [nothingChanged]);
  const next = (deployment?.plan_version || 1) + 1;
  const recipients = result ? (notifyAll ? result.assignedUserIds.size : result.affectedUserIds.size) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish plan v{next}</DialogTitle>
          <DialogDescription>
            {deployment?.plan_published_at
              ? <>Current version v{deployment.plan_version}, published {formatDateTime(deployment.plan_published_at)}. </>
              : <>This is the first published version. </>}
            Operators whose packet changed get a notification saying what changed and a banner on their packet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onPublish(note, { changes: toPublishPayload(result?.entries ?? []), notifyAll }); }} className="space-y-4">
          <div className="rounded-md border bg-muted/30 text-sm">
            <p className="flex items-center gap-2 border-b px-3 py-2 font-medium">
              {loading || !result ? 'Comparing with the last published plan…'
                : nothingChanged ? <><CheckCircle2 className="h-4 w-4 text-success" /> No packet changed since v{deployment.plan_version || 1}</>
                : <>{changed.length} of {result.entries.length} position{result.entries.length === 1 ? '' : 's'} changed</>}
            </p>
            {changed.length > 0 && (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto px-3 py-2" aria-label="Changes since last publication">
                {changed.map(e => (
                  <li key={e.position.id}>
                    <span className="font-medium">{e.position.tactical_callsign || e.position.name}</span>
                    <ul className="ml-4 list-disc text-muted-foreground">{e.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FormField label="Note to operators" hint={nothingChanged ? 'Nothing changed in any packet; use the note for things the plan does not carry (weather, parking, reminders).' : 'Optional. Shown above the per-position changes. One or two lines, in the operator\'s words.'}>
            {({ id }) => <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rain expected after 14:00; bring cover for your radio." autoFocus />}
          </FormField>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={notifyAll} onCheckedChange={(v) => setNotifyAll(v === true)} className="mt-0.5" disabled={!result} />
            <span><span className="font-medium">Notify everyone assigned</span><span className="block text-xs text-muted-foreground">Not only the {result?.affectedUserIds.size ?? 0} operator{result?.affectedUserIds.size === 1 ? '' : 's'} on changed positions.</span></span>
          </label>
          <DialogFooter className="sm:items-center">
            {recipients != null && <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> {recipients} operator{recipients === 1 ? '' : 's'} will be notified</span>}
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} disabled={loading || !result}><Send /> Publish v{next}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
