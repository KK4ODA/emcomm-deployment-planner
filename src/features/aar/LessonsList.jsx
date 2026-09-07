import React, { useState } from 'react';
import { Plus, Trash2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Section } from '@/components/common/Section';
import { LESSON_CATEGORIES, LESSON_STATUS } from '@/lib/aar';

const NONE = '__none__';
const VARIANT = { warning: 'warning', info: 'info', success: 'success', muted: 'muted' };

/**
 * Lessons for a deployment: add, change status, attach to a position.
 * Carried-forward lessons from the previous copy show up here first.
 * @param {{ lessons: Object[], positions: Object[], canEdit: boolean, onAdd: (data: Object) => void, onUpdate: (id: string, patch: Object) => void, onDelete: (id: string) => void, busy?: boolean }} props
 */
export function LessonsList({ lessons, positions, canEdit, onAdd, onUpdate, onDelete, busy }) {
  const [draft, setDraft] = useState({ category: 'process', finding: '', recommendation: '', position_id: '' });
  const positionName = new Map(positions.map(p => [p.id, p.tactical_callsign || p.name]));
  const add = (e) => {
    e.preventDefault();
    if (!draft.finding.trim()) return;
    onAdd({ category: draft.category, finding: draft.finding.trim(), recommendation: draft.recommendation.trim() || null, position_id: draft.position_id || null });
    setDraft({ category: 'process', finding: '', recommendation: '', position_id: '' });
  };
  const carried = lessons.filter(l => l.status === 'carried_forward');
  const rest = lessons.filter(l => l.status !== 'carried_forward');

  return (
    <Section title="Lessons" icon={Lightbulb} aside={`${lessons.length}`} bodyClassName="p-0">
      {canEdit && (
        <form onSubmit={add} className="grid gap-2 border-b p-3 sm:grid-cols-[9rem_1fr_1fr_10rem_auto]">
          <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
            <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(LESSON_CATEGORIES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={draft.finding} onChange={(e) => setDraft({ ...draft, finding: e.target.value })} placeholder="What we learned (finding)" aria-label="Finding" required />
          <Input value={draft.recommendation} onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })} placeholder="What to do next time" aria-label="Recommendation" />
          <Select value={draft.position_id || NONE} onValueChange={(v) => setDraft({ ...draft, position_id: v === NONE ? '' : v })}>
            <SelectTrigger aria-label="Position"><SelectValue placeholder="Position" /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Whole deployment</SelectItem>{positions.map(p => <SelectItem key={p.id} value={p.id}>{p.tactical_callsign || p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="submit" loading={busy}><Plus /> Add</Button>
        </form>
      )}
      {lessons.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No lessons yet. Turn feedback and log entries into findings here; open ones follow the deployment when you duplicate it.</p> : (
        <ul className="divide-y">
          {[...carried, ...rest].map(l => (
            <li key={l.id} className="flex flex-wrap items-start gap-2 px-3 py-2 text-sm">
              <Badge variant="outline">{LESSON_CATEGORIES[l.category] || l.category}</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{l.finding}</p>
                {l.recommendation && <p className="text-muted-foreground">→ {l.recommendation}</p>}
                <p className="text-xs text-muted-foreground">{l.position_id && positionName.get(l.position_id) ? `Position: ${positionName.get(l.position_id)}` : 'Whole deployment'}{l.carried_from_lesson_id ? ' · carried from the previous deployment' : ''}</p>
              </div>
              {canEdit ? (
                <Select value={l.status} onValueChange={(v) => onUpdate(l.id, { status: v })}>
                  <SelectTrigger className="h-8 w-40 text-xs" aria-label="Status"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(LESSON_STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : <Badge variant={VARIANT[LESSON_STATUS[l.status]?.tone] || 'outline'}>{LESSON_STATUS[l.status]?.label}</Badge>}
              {canEdit && <Button variant="ghost" size="icon-sm" aria-label="Delete lesson" className="text-destructive hover:text-destructive" onClick={() => onDelete(l.id)}><Trash2 /></Button>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
