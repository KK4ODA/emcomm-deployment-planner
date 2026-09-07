import React from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ROUTES } from '@/app/routes';
import { LESSON_CATEGORIES } from '@/lib/aar';

/**
 * Lessons carried from the previous copy of this deployment, shown where the
 * planner is making the decisions they apply to. Renders nothing when empty.
 * @param {{ lessons: Object[], positions?: Object[] }} props
 */
export function CarriedLessons({ lessons, positions = [] }) {
  if (!lessons.length) return null;
  const positionName = new Map(positions.map(p => [p.id, p.tactical_callsign || p.name]));
  return (
    <aside className="mb-4 rounded-lg border border-info/40 bg-info/5 p-3 text-sm" aria-label="Lessons from last time">
      <p className="mb-1 flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-info" /> From last time ({lessons.length})</p>
      <ul className="space-y-1">
        {lessons.slice(0, 5).map(l => (
          <li key={l.id} className="flex flex-wrap items-baseline gap-x-2">
            <Badge variant="outline" className="text-[10px]">{LESSON_CATEGORIES[l.category] || l.category}</Badge>
            <span>{l.finding}</span>
            {l.recommendation && <span className="text-muted-foreground">→ {l.recommendation}</span>}
            {l.position_id && positionName.get(l.position_id) && <span className="text-xs text-muted-foreground">({positionName.get(l.position_id)})</span>}
          </li>
        ))}
      </ul>
      <Link to={ROUTES.aar} className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline">{lessons.length > 5 ? `All ${lessons.length} lessons and mark them addressed` : 'Mark them addressed under After action'}</Link>
    </aside>
  );
}
