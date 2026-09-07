import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { AresGroupPicker } from '@/components/common/AresGroupPicker';
import { RoleBadge } from '@/components/common/Badges';
import { useAresGroups } from '@/hooks/useEntities';
import { ROLES } from '@/lib/permissions';
import { parseRoster, rosterSummary, ROSTER_TEMPLATE } from '@/lib/roster';
import { downloadBlob } from '@/lib/download';
import { inviteUser } from '@/api/functions';
import { cn } from '@/lib/utils';

/**
 * Import a roster CSV: preview every row, then invite the new people and
 * add the existing ones to the chosen groups, one call each, with progress.
 * @param {{ open: boolean, onClose: () => void, existingUsers: Object[], currentUserRole: string, onDone: () => void }} props
 */
export function RosterImportDialog({ open, onClose, existingUsers, currentUserRole, onDone }) {
  const fileRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const [text, setText] = useState('');
  const [role, setRole] = useState(/** @type {string} */ (ROLES.PENDING));
  const [groupIds, setGroupIds] = useState(/** @type {string[]} */ ([]));
  const [progress, setProgress] = useState(/** @type {{ done: number, total: number, results: Array<{ email: string, ok: boolean, message: string }> }|null} */ (null));
  const { data: groups = [] } = useAresGroups({ enabled: open });
  const roles = currentUserRole === ROLES.ADMIN ? [ROLES.PENDING, ROLES.VIEWER, ROLES.OPERATOR, ROLES.PLANNER] : [ROLES.PENDING, ROLES.VIEWER, ROLES.OPERATOR];

  const parsed = useMemo(() => text.trim() ? parseRoster(text, { existingEmails: existingUsers.map(u => u.email).filter(Boolean), existingCallSigns: existingUsers.map(u => u.call_sign).filter(Boolean) }) : null, [text, existingUsers]);
  const summary = parsed ? rosterSummary(parsed.rows) : null;
  const importable = parsed ? parsed.rows.filter(r => r.status !== 'invalid') : [];

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setText(await f.text());
  };

  const reset = () => { setText(''); setProgress(null); setGroupIds([]); setRole(ROLES.PENDING); };
  const close = () => { if (progress && progress.done < progress.total) return; reset(); onClose(); };

  const run = async () => {
    const results = [];
    setProgress({ done: 0, total: importable.length, results });
    for (const r of importable) {
      try {
        const res = await inviteUser({ email: r.email, role: r.role || role, aresGroupIds: groupIds, call_sign: r.call_sign, full_name: r.full_name, phone: r.phone, license_class: r.license_class });
        results.push({ email: r.email, ok: true, message: res?.message || 'Done' });
      } catch (err) {
        results.push({ email: r.email, ok: false, message: err?.message || 'Failed' });
      }
      setProgress({ done: results.length, total: importable.length, results: [...results] });
    }
    onDone();
  };

  const finished = progress && progress.done === progress.total;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Import roster</DialogTitle>
          <DialogDescription>A CSV with an <strong>email</strong> column; call sign, name, phone and licence class are picked up when present. New people get an invitation email; existing members are added to the groups you choose. Nothing is sent until you confirm the preview.</DialogDescription>
        </DialogHeader>

        {!progress && (
          <>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv,.txt,.tsv" className="hidden" onChange={onFile} aria-label="Choose a CSV file" />
              <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Choose CSV</Button>
              <Button variant="ghost" onClick={() => downloadBlob(ROSTER_TEMPLATE, 'roster-template.csv', 'text/csv;charset=utf-8')}><Download /> Template</Button>
            </div>
            <FormField label="Or paste the rows" hint="First line is the header. Commas, tabs or semicolons.">
              {({ id }) => <Textarea id={id} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'email,call sign,name,phone,license class\noperator@example.com,KK4ODA,Facundo,404-555-0100,Extra'} className="font-mono text-xs" />}
            </FormField>

            {parsed && parsed.missing.length > 0 && <p className="text-sm text-destructive" role="alert">No email column found. Headers seen: {parsed.columns.join(', ') || 'none recognised'}.</p>}

            {summary && summary.total > 0 && (
              <>
                <p className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="success">{summary.new} new</Badge>
                  <Badge variant="info">{summary.existing} already members</Badge>
                  {summary.invalid > 0 && <Badge variant="critical">{summary.invalid} skipped</Badge>}
                </p>
                <div className="max-h-64 overflow-auto rounded-md border text-xs">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted/60 text-left"><tr><th className="px-2 py-1">Line</th><th className="px-2 py-1">Email</th><th className="px-2 py-1">Call</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Status</th></tr></thead>
                    <tbody className="divide-y">
                      {parsed.rows.map(r => (
                        <tr key={r.line} className={cn(r.status === 'invalid' && 'bg-destructive/5 text-muted-foreground')}>
                          <td className="px-2 py-1 tnum">{r.line}</td>
                          <td className="px-2 py-1 font-mono">{r.email}</td>
                          <td className="px-2 py-1 font-mono">{r.call_sign || ''}</td>
                          <td className="px-2 py-1">{r.full_name || ''}</td>
                          <td className="px-2 py-1">{r.status === 'invalid' ? <span className="text-destructive">{r.problems.join('; ')}</span> : r.status === 'existing' ? 'add to groups' : 'invite'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Role for new people" hint="A role column in the file overrides this per row.">
                    {({ id }) => (
                      <Select value={role} onValueChange={setRole}>
                        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                        <SelectContent>{roles.map(r => <SelectItem key={r} value={r}><RoleBadge role={r} /></SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <AresGroupPicker groups={groups} value={groupIds} onChange={setGroupIds} required hint="Everyone in the file joins these groups" />
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={run} disabled={!importable.length || !groupIds.length}><UserCheck /> Invite {importable.length} {importable.length === 1 ? 'person' : 'people'}</Button>
            </DialogFooter>
          </>
        )}

        {progress && (
          <>
            <p className="text-sm font-medium">{finished ? 'Done.' : 'Sending…'} {progress.done} of {progress.total}</p>
            <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
            <ul className="max-h-64 divide-y overflow-auto rounded-md border text-xs">
              {progress.results.map(r => (
                <li key={r.email} className="flex items-center gap-2 px-2 py-1">
                  {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  <span className="font-mono">{r.email}</span>
                  <span className={cn('text-muted-foreground', !r.ok && 'text-destructive')}>{r.message}</span>
                </li>
              ))}
            </ul>
            {finished && (
              <p className="text-xs text-muted-foreground">{progress.results.filter(r => r.ok).length} succeeded, {progress.results.filter(r => !r.ok).length} failed. Invited people appear as “Pending approval” until they set a password and you confirm their role.</p>
            )}
            <DialogFooter><Button onClick={close} disabled={!finished}>Close</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
