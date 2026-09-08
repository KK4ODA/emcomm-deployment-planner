import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { reportMutationError } from '@/hooks/useEntities';
import { exportChannelLibrary, importChannelLibrary } from '@/lib/channelLibrary';
import { channelSummary } from '@/lib/comms';
import { downloadBlob, safeFileName } from '@/lib/download';

/**
 * Hand a channel library to another group as a file, or take one in. The
 * receiving side only adds channels it does not already have.
 * @param {{ channels: Object[], groupId: string, groupName?: string, exportedBy?: string, canEdit: boolean }} props
 */
export function ChannelLibraryTransfer({ channels, groupId, groupName = '', exportedBy = '', canEdit }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [preview, setPreview] = useState(/** @type {ReturnType<typeof importChannelLibrary>|null} */ (null));

  const exportFile = () => {
    const doc = exportChannelLibrary(channels, { groupName, exportedBy });
    downloadBlob(JSON.stringify(doc, null, 2), `channels-${safeFileName(groupName || 'library')}.json`, 'application/json');
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const r = importChannelLibrary(await f.text(), channels);
    if (r.error) { toast.error(r.error); return; }
    setPreview(r);
  };
  const doImport = useMutation({
    mutationFn: async () => {
      let order = Math.max(0, ...channels.map(c => c.sort_order || 0));
      for (const c of preview.rows) { order += 1; await db.channels.create({ ...c, sort_order: order, ares_group_id: groupId, active: true }); }
      return preview.rows.length;
    },
    onSuccess: (n) => { queryClient.invalidateQueries({ queryKey: queryKeys.channels }); setPreview(null); toast.success(`${n} channel${n === 1 ? '' : 's'} added to the library`); },
    onError: reportMutationError('Import channels'),
  });

  return (
    <>
      <Button variant="outline" onClick={exportFile} disabled={!channels.length} title="Save the library as a file another group can import"><Download /> Export</Button>
      {canEdit && (
        <>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} aria-label="Choose a channel library file" />
          <Button variant="outline" onClick={() => fileRef.current?.click()} title="Add channels from another group's exported file"><Upload /> Import</Button>
        </>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import channel library</DialogTitle>
            <DialogDescription>{preview?.source.group ? `From ${preview.source.group}` : 'From another group'}{preview?.source.exported_by ? ` (${preview.source.exported_by})` : ''}. Channels you already have, by name and frequency, are skipped.</DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              <p className="text-sm"><strong>{preview.rows.length}</strong> new channel{preview.rows.length === 1 ? '' : 's'}{preview.duplicates.length ? `, ${preview.duplicates.length} already in your library` : ''}.</p>
              {preview.rows.length > 0 && (
                <ul className="max-h-60 divide-y overflow-y-auto rounded-md border text-sm">
                  {preview.rows.map((c, i) => <li key={i} className="flex justify-between gap-2 px-3 py-1.5"><span className="font-medium">{c.name}</span><span className="font-mono text-xs text-muted-foreground">{channelSummary(c)}</span></li>)}
                </ul>
              )}
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button onClick={() => doImport.mutate()} disabled={!preview?.rows.length} loading={doImport.isPending}><Upload /> Add {preview?.rows.length ?? 0}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
