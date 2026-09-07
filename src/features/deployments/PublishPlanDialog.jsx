import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';
import { formatDateTime } from '@/lib/time';

/**
 * Publish the current plan as a new version. Everyone with an assignment in
 * the deployment is notified and sees the note on their packet until they
 * acknowledge it.
 * @param {{ open: boolean, onClose: () => void, deployment: Object, onPublish: (note: string) => void, submitting?: boolean }} props
 */
export function PublishPlanDialog({ open, onClose, deployment, onPublish, submitting }) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  const next = (deployment?.plan_version || 1) + 1;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish plan v{next}</DialogTitle>
          <DialogDescription>
            {deployment?.plan_published_at
              ? <>Current version v{deployment.plan_version}, published {formatDateTime(deployment.plan_published_at)}. </>
              : <>This is the first published version. </>}
            Everyone assigned to <strong>{deployment?.name}</strong> gets a notification and a "what changed" banner on their packet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onPublish(note); }} className="space-y-4">
          <FormField label="What changed" hint="One or two lines, in the operator's words. Shown on every packet.">
            {({ id }) => <Textarea id={id} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. SAG net moved to 145.450 (backup repeater). AID MILE 12 reports at 05:15, not 05:30." autoFocus />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting}><Send /> Publish and notify</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
