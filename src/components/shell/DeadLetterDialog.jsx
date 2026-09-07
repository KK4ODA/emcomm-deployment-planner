import React, { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listDeadLetters, discardDeadLetter, retryDeadLetter } from '@/api/syncEngine';
import { formatDateTime } from '@/lib/time';

/**
 * Queued changes the server refused for good: shown so nothing is silently
 * lost. Retry after the cause is fixed (a role granted, a task recreated),
 * or discard.
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function DeadLetterDialog({ open, onClose }) {
  const [letters, setLetters] = useState(/** @type {Awaited<ReturnType<typeof listDeadLetters>>} */ ([]));
  const [busyId, setBusyId] = useState(/** @type {string|null} */ (null));
  const reload = () => listDeadLetters().then(setLetters).catch(() => setLetters([]));
  useEffect(() => { if (open) reload(); }, [open]);

  const act = async (letter, fn) => {
    setBusyId(letter.id);
    try { await fn(letter); } finally { setBusyId(null); await reload(); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Changes the server refused</DialogTitle>
          <DialogDescription>These were saved on this device but rejected when sent, usually a permission or a record that no longer exists. They will not be retried on their own.</DialogDescription>
        </DialogHeader>
        {letters.length === 0 ? <p className="text-sm text-muted-foreground">Nothing outstanding.</p> : (
          <ul className="divide-y rounded-md border text-sm">
            {letters.map(l => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Badge variant="outline">{l.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.summary}</p>
                  <p className="text-xs text-destructive">{l.error}</p>
                  {l.at && <p className="text-xs text-muted-foreground">queued {formatDateTime(new Date(l.at).toISOString())}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => act(l, retryDeadLetter)} loading={busyId === l.id}><RotateCcw /> Retry</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => act(l, discardDeadLetter)} disabled={busyId === l.id} aria-label={`Discard ${l.summary}`}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
