import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, Plus, FileDown, PenLine, Lock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { QueryState } from '@/components/common/QueryState';
import { DeploymentGate } from '@/components/common/DeploymentGate';
import { Section } from '@/components/common/Section';
import { FormField } from '@/components/common/FormField';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useCurrentDeployment } from '@/contexts/DeploymentContext';
import { useSafetyChecklists, reportMutationError } from '@/hooks/useEntities';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { hasPermission } from '@/lib/permissions';
import { newChecklistItems, checklistProgress, checklistText, SAFETY_TEMPLATE_NAME } from '@/lib/safety';
import { downloadBlob, safeFileName } from '@/lib/download';
import { formatDateTime } from '@/lib/time';
import { renderSafetyChecklistPdf } from '@/features/safety/safetyPdf';
import { cn } from '@/lib/utils';

/** /safety: the Safety Officer checklist for the deployment, signed once. */
export default function Safety() {
  return <DeploymentGate><SafetyContent /></DeploymentGate>;
}

function SafetyContent() {
  const { user } = useAuth();
  const { deployment, deploymentId } = useCurrentDeployment();
  const queryClient = useQueryClient();
  const listQ = useSafetyChecklists();
  const canEdit = hasPermission(user?.app_role, 'MANAGE_SAFETY');
  const { confirm, dialog } = useConfirm();
  const checklist = useMemo(() => (listQ.data ?? []).find(c => c.deployment_id === deploymentId) ?? null, [listQ.data, deploymentId]);
  const [signName, setSignName] = useState('');
  const [exporting, setExporting] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.safetyChecklists });

  const create = useMutation({
    mutationFn: () => db.safetyChecklists.create({ deployment_id: deploymentId, template_name: SAFETY_TEMPLATE_NAME, items: newChecklistItems(), created_by: user?.id ?? null }),
    onSuccess: invalidate, onError: reportMutationError('Start checklist'),
  });
  const update = useMutation({
    mutationFn: (/** @type {Object} */ patch) => db.safetyChecklists.update(checklist.id, patch),
    onSuccess: invalidate, onError: reportMutationError('Save checklist'),
  });
  const sign = useMutation({
    mutationFn: () => db.safetyChecklists.update(checklist.id, { signed_name: signName.trim(), signed_at: new Date().toISOString() }),
    onSuccess: () => { invalidate(); toast.success('Signed. The checklist is now locked.'); }, onError: reportMutationError('Sign checklist'),
  });
  const remove = useMutation({ mutationFn: () => db.safetyChecklists.remove(checklist.id), onSuccess: invalidate, onError: reportMutationError('Delete checklist') });

  const signed = !!checklist?.signed_at;
  const items = checklist?.items ?? [];
  const progress = checklistProgress(items);
  const setItem = (id, patch) => update.mutate({ items: items.map(i => (i.id === id ? { ...i, ...patch } : i)) });
  const addItem = (text) => update.mutate({ items: [...items, { id: `c${Date.now()}`, text, state: 'pending', note: null }] });
  const removeItem = (id) => update.mutate({ items: items.filter(i => i.id !== id) });
  const exportPdf = async () => {
    setExporting(true);
    try { downloadBlob(await renderSafetyChecklistPdf({ deployment, checklist, preparedByName: user?.full_name }), `Safety_${safeFileName(deployment.name)}.pdf`, 'application/pdf'); }
    catch (err) { toast.error(err?.message || 'Could not build the PDF'); }
    finally { setExporting(false); }
  };

  return (
    <QueryState queries={[listQ]}>
      <PageHeader
        icon={ShieldCheck}
        eyebrow={deployment.name}
        title="Safety checklist"
        description="Walk the site, answer every line, sign. Once signed it is locked and becomes part of the deployment record; Field Day scores it as a bonus."
        actions={checklist && (
          <>
            <Button variant="outline" onClick={exportPdf} loading={exporting}><FileDown /> PDF</Button>
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(checklistText(checklist)).then(() => toast.success('Copied as text')).catch(() => toast.error('Clipboard unavailable')); }}>Copy text</Button>
            {canEdit && !signed && <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => { if (await confirm({ title: 'Delete this checklist?', destructive: true })) remove.mutate(); }}><Trash2 /> Delete</Button>}
          </>
        )}
      />

      {!checklist ? (
        <EmptyState icon={ShieldCheck} title="No safety checklist yet" description={canEdit ? 'Start from the standard list (fuel, power, antennas, first aid, weather, site), edit the lines to fit the site, then sign it on the day.' : 'The coordinator or Safety Officer starts the checklist.'} action={canEdit && <Button onClick={() => create.mutate()} loading={create.isPending}><Plus /> Start checklist</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Section title={checklist.template_name} icon={ShieldCheck} aside={signed ? <Badge variant="success"><Lock className="mr-1 h-3 w-3" /> Signed</Badge> : `${progress.ok + progress.na} of ${progress.total} answered`} bodyClassName="p-0">
            <ul className="divide-y">
              {items.map((it, idx) => (
                <li key={it.id} className={cn('flex flex-wrap items-start gap-2 px-3 py-2 text-sm', it.state === 'ok' && 'bg-success/5', it.state === 'na' && 'opacity-70')}>
                  <span className="w-6 shrink-0 pt-1 text-xs text-muted-foreground tnum">{idx + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p>{it.text}</p>
                    {(it.note || (!signed && canEdit)) && (
                      signed || !canEdit
                        ? it.note && <p className="text-xs text-muted-foreground">{it.note}</p>
                        : <Input value={it.note || ''} onChange={(e) => setItem(it.id, { note: e.target.value || null })} placeholder="Note (optional)" className="mt-1 h-8 text-xs" aria-label={`Note for item ${idx + 1}`} />
                    )}
                  </div>
                  {signed || !canEdit ? (
                    <Badge variant={it.state === 'ok' ? 'success' : it.state === 'na' ? 'muted' : 'warning'}>{it.state === 'ok' ? 'OK' : it.state === 'na' ? 'N/A' : 'Open'}</Badge>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant={it.state === 'ok' ? 'default' : 'outline'} onClick={() => setItem(it.id, { state: it.state === 'ok' ? 'pending' : 'ok' })} aria-pressed={it.state === 'ok'}>OK</Button>
                      <Button size="sm" variant={it.state === 'na' ? 'secondary' : 'ghost'} onClick={() => setItem(it.id, { state: it.state === 'na' ? 'pending' : 'na' })} aria-pressed={it.state === 'na'}>N/A</Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove item ${idx + 1}`} className="text-destructive hover:text-destructive" onClick={() => removeItem(it.id)}><Trash2 /></Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!signed && canEdit && <AddItem onAdd={addItem} />}
          </Section>

          <div className="space-y-4">
            <Section title="Notes" icon={PenLine}>
              {signed || !canEdit
                ? <p className="whitespace-pre-line text-sm">{checklist.notes || <span className="text-muted-foreground">None.</span>}</p>
                : <Textarea rows={4} defaultValue={checklist.notes || ''} onBlur={(e) => { if (e.target.value !== (checklist.notes || '')) update.mutate({ notes: e.target.value.trim() || null }); }} placeholder="Hazards specific to this site, who the Safety Officer is, anything the next event should know." />}
            </Section>
            <Section title="Signature" icon={Lock}>
              {signed ? (
                <p className="text-sm">Signed by <strong>{checklist.signed_name || 'the Safety Officer'}</strong> on {formatDateTime(checklist.signed_at)}. Locked.</p>
              ) : canEdit ? (
                <form onSubmit={(e) => { e.preventDefault(); if (progress.complete && signName.trim()) sign.mutate(); }} className="space-y-3">
                  <p className="text-sm text-muted-foreground">{progress.complete ? 'Every line is answered. Sign to lock the checklist.' : `${progress.pending} line${progress.pending === 1 ? '' : 's'} still open. Mark each OK or N/A before signing.`}</p>
                  <FormField label="Safety Officer" required hint="Name and call sign as it should appear on the record">
                    {({ id }) => <Input id={id} value={signName} onChange={(e) => setSignName(e.target.value)} placeholder={`${user?.full_name || ''}${user?.call_sign ? ` ${user.call_sign}` : ''}`.trim()} required />}
                  </FormField>
                  <Button type="submit" disabled={!progress.complete || !signName.trim()} loading={sign.isPending}><Lock /> Sign and lock</Button>
                </form>
              ) : <p className="text-sm text-muted-foreground">Not yet signed.</p>}
            </Section>
          </div>
        </div>
      )}
      {dialog}
    </QueryState>
  );
}

function AddItem({ onAdd }) {
  const [text, setText] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(''); } }} className="flex gap-2 border-t p-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a site-specific line" aria-label="New checklist line" />
      <Button type="submit" variant="outline" disabled={!text.trim()}><Plus /> Add</Button>
    </form>
  );
}
