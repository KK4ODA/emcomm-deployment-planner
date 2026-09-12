import React, { useEffect, useRef, useState } from 'react';
import { Upload, FolderOpen, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { parseBundle } from '@/lib/deploymentBundle';
import { formatDateTime } from '@/lib/time';

/** Where the examples shipped with the app live (public/examples). */
export const EXAMPLES_INDEX_URL = '/examples/index.json';

/**
 * Import a deployment file (exported from this or another group) or one of
 * the examples shipped with the app. Shows what the file holds, lets the
 * planner rename it, pick the group and optionally move it to a new date.
 * @param {{
 *   open: boolean, onClose: () => void, groups: Array<{ id: string, name: string }>, defaultGroupId?: string,
 *   onSubmit: (data: { bundle: Object, name: string, groupId: string, newStartsAt: string|null }) => void, submitting?: boolean
 * }} props
 */
export function ImportDeploymentDialog({ open, onClose, groups, defaultGroupId = '', onSubmit, submitting }) {
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [loaded, setLoaded] = useState(/** @type {ReturnType<typeof parseBundle>|null} */ (null));
  const [sourceLabel, setSourceLabel] = useState('');
  const [examples, setExamples] = useState(/** @type {Array<{ file: string, title: string, description?: string }>} */ ([]));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [newStart, setNewStart] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoaded(null); setError(''); setName(''); setNewStart(''); setSourceLabel(''); setGroupId(defaultGroupId || groups[0]?.id || '');
    let cancelled = false;
    fetch(EXAMPLES_INDEX_URL, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : { examples: [] })).then(j => { if (!cancelled) setExamples(Array.isArray(j?.examples) ? j.examples : []); }).catch(() => { if (!cancelled) setExamples([]); });
    return () => { cancelled = true; };
  }, [open, defaultGroupId, groups]);

  const take = (text, label) => {
    const r = parseBundle(text);
    if (r.error) { setError(r.error); setLoaded(null); return; }
    setError(''); setLoaded(r); setSourceLabel(label); setName(r.bundle.deployment.name);
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    take(await f.text(), f.name);
  };
  const loadExample = async (ex) => {
    setBusy(ex.file); setError('');
    try {
      const r = await fetch(`/examples/${ex.file}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      take(await r.text(), ex.title);
    } catch (err) {
      setError(`Could not load the example (${err.message})`);
    } finally { setBusy(''); }
  };

  const c = loaded?.counts;
  const b = loaded?.bundle;
  const summary = c ? [
    `${c.sites} site${c.sites === 1 ? '' : 's'}`, `${c.positions} position${c.positions === 1 ? '' : 's'} with ${c.shifts} shift${c.shifts === 1 ? '' : 's'}`,
    c.periods ? `${c.periods} period${c.periods === 1 ? '' : 's'}` : null, c.planRows ? `a comms plan with ${c.planRows} channel row${c.planRows === 1 ? '' : 's'} (${c.channels} library channel${c.channels === 1 ? '' : 's'})` : null,
    c.items ? `${c.items} equipment item${c.items === 1 ? '' : 's'}` : null, c.tasks ? `${c.tasks} task${c.tasks === 1 ? '' : 's'}` : null,
    c.layers ? `${c.layers} map layer${c.layers === 1 ? '' : 's'}` : null, c.objectives ? `${c.objectives} objective${c.objectives === 1 ? '' : 's'}` : null, c.safety ? 'a safety checklist' : null,
  ].filter(Boolean) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import a deployment</DialogTitle>
          <DialogDescription>From a file another planner exported, or from an example shipped with the app. People, assignments and history are never in a file; you get the structure, ready to staff.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} aria-label="Choose a deployment file" />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Choose a file</Button>
          {sourceLabel && <span className="text-xs text-muted-foreground">Loaded: {sourceLabel}</span>}
        </div>
        {examples.length > 0 && (
          <div className="rounded-md border">
            <p className="border-b px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Examples</p>
            <ul className="divide-y text-sm">
              {examples.map(ex => (
                <li key={ex.file} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="font-medium">{ex.title}</p>{ex.description && <p className="text-xs text-muted-foreground">{ex.description}</p>}</div>
                  <Button size="sm" variant="outline" onClick={() => loadExample(ex)} disabled={!!busy}>{busy === ex.file ? <Loader2 className="animate-spin" /> : <FolderOpen />} Load</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {b && (
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && groupId) onSubmit({ bundle: b, name: name.trim(), groupId, newStartsAt: newStart ? new Date(newStart).toISOString() : null }); }} className="space-y-4 border-t pt-4">
            <p className="text-sm"><strong>{b.deployment.name}</strong>{b.source?.group ? ` from ${b.source.group}` : ''}{b.app_version ? ` (EmComm Planner ${b.app_version})` : ''}: {summary.join(', ')}.</p>
            <FormField label="Name" required>
              {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required />}
            </FormField>
            {groups.length > 1 && (
              <FormField label="ARES group" required>
                {({ id }) => (
                  <Select value={groupId} onValueChange={setGroupId}>
                    <SelectTrigger id={id}><SelectValue placeholder="Select ARES group" /></SelectTrigger>
                    <SelectContent>{groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </FormField>
            )}
            <FormField label="Move to a new start" hint={b.deployment.starts_at ? `Optional. The file starts ${formatDateTime(b.deployment.starts_at)}; every shift and period moves by the same offset.` : 'Optional. Leave empty to keep the dates in the file.'}>
              {({ id }) => <Input id={id} type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} />}
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button type="submit" loading={submitting} disabled={!name.trim() || !groupId}><Upload /> Import</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
