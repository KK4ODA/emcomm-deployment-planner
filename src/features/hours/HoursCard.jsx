import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Plus, Trash2, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/common/FormField';
import { useHourEntries, reportMutationError } from '@/hooks/useEntities';
import { db } from '@/api/db';
import { queryKeys } from '@/lib/queryKeys';
import { hoursByMonth, hoursCsv, ACTIVITY_TYPES } from '@/lib/operations';
import { downloadBlob } from '@/lib/download';
import { formatDate } from '@/lib/time';

/**
 * The operator's participation hours: derived from check-in/out, plus a
 * 15-second form for admin, planning and maintenance work.
 * @param {{ user: Object }} props
 */
export function HoursCard({ user }) {
  const queryClient = useQueryClient();
  const hoursQ = useHourEntries();
  const [form, setForm] = useState({ occurred_on: new Date().toISOString().slice(0, 10), activity_type: 'admin', hours: '1', description: '' });
  const mine = useMemo(() => (hoursQ.data ?? []).filter(e => e.user_id === user?.id), [hoursQ.data, user?.id]);
  const months = useMemo(() => hoursByMonth(mine), [mine]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.hourEntries });

  const add = useMutation({
    mutationFn: () => db.hourEntries.create({
      user_id: user.id, ares_group_id: user.ares_group_ids?.[0] ?? null, occurred_on: form.occurred_on, activity_type: form.activity_type,
      hours: Number(form.hours), source: 'manual', description: form.description.trim() || null,
    }),
    onSuccess: () => { invalidate(); setForm(f => ({ ...f, hours: '1', description: '' })); toast.success('Hours added'); },
    onError: reportMutationError('Add hours'),
  });
  const remove = useMutation({
    mutationFn: (/** @type {string} */ id) => db.hourEntries.remove(id),
    onSuccess: invalidate,
    onError: reportMutationError('Delete hours'),
  });

  const total = mine.reduce((s, e) => s + Number(e.hours || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> My hours</CardTitle>
            <CardDescription>Event hours are recorded automatically when you check out. Add planning, admin and maintenance time here; nobody has to ask.</CardDescription>
          </div>
          {mine.length > 0 && <Button variant="outline" size="sm" onClick={() => downloadBlob(hoursCsv(mine, new Map([[user.id, user]])), `hours_${user.call_sign || 'me'}.csv`, 'text/csv;charset=utf-8')}><Download /> CSV</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); if (Number(form.hours) > 0) add.mutate(); }} className="grid gap-2 sm:grid-cols-[9rem_1fr_5rem_1fr_auto] sm:items-end">
          <FormField label="Date">{({ id }) => <Input id={id} type="date" value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} required />}</FormField>
          <FormField label="Activity">
            {({ id }) => (
              <Select value={form.activity_type} onValueChange={(v) => setForm({ ...form, activity_type: v })}>
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACTIVITY_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label="Hours">{({ id }) => <Input id={id} type="number" min={0.25} max={48} step={0.25} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} required />}</FormField>
          <FormField label="What">{({ id }) => <Input id={id} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Drill planning call" />}</FormField>
          <Button type="submit" loading={add.isPending}><Plus /> Add</Button>
        </form>

        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hours yet. Your first check-out will add them automatically.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm"><strong className="tnum">{Math.round(total * 100) / 100}</strong> hours recorded in total.</p>
            {months.map(m => (
              <details key={m.month} open={m === months[0]} className="rounded-md border">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium">
                  {formatDate(`${m.month}-01`, 'MMMM yyyy')}
                  <span className="tnum ml-auto">{m.total} h</span>
                  <span className="flex flex-wrap gap-1">{Object.entries(m.byType).map(([t, h]) => <Badge key={t} variant="muted" className="text-[10px]">{ACTIVITY_TYPES[t] || t}: {h}</Badge>)}</span>
                </summary>
                <ul className="divide-y border-t text-sm">
                  {m.entries.map(e => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                      <span className="tnum w-24 text-xs text-muted-foreground">{formatDate(e.occurred_on, 'MMM d')}</span>
                      <span className="min-w-0 flex-1 truncate">{e.description || ACTIVITY_TYPES[e.activity_type]}</span>
                      {e.estimated && <Badge variant="warning" className="text-[10px]" title="No check-in or check-out time; the scheduled shift was used">estimated</Badge>}
                      <span className="tnum font-medium">{e.hours} h</span>
                      {e.source === 'manual' && <Button variant="ghost" size="icon-sm" aria-label="Delete entry" className="text-destructive hover:text-destructive" onClick={() => remove.mutate(e.id)}><Trash2 /></Button>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
