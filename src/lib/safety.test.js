import { describe, it, expect } from 'vitest';
import { newChecklistItems, checklistProgress, checklistText, DEFAULT_SAFETY_ITEMS } from './safety';

describe('safety checklist', () => {
  it('starts every default item pending', () => {
    const items = newChecklistItems();
    expect(items).toHaveLength(DEFAULT_SAFETY_ITEMS.length);
    expect(items[0]).toEqual({ id: 's1', text: DEFAULT_SAFETY_ITEMS[0], state: 'pending', note: null });
  });
  it('is complete only when every item is answered', () => {
    const items = newChecklistItems(['a', 'b', 'c']);
    expect(checklistProgress(items)).toEqual({ total: 3, ok: 0, na: 0, pending: 3, complete: false });
    items[0].state = 'ok'; items[1].state = 'na';
    expect(checklistProgress(items).complete).toBe(false);
    items[2].state = 'ok';
    expect(checklistProgress(items)).toMatchObject({ ok: 2, na: 1, pending: 0, complete: true });
    expect(checklistProgress([]).complete).toBe(false);
  });
  it('renders text with the signature line', () => {
    const t = checklistText({ items: [{ text: 'Fire extinguisher', state: 'ok' }, { text: 'Tower', state: 'na', note: 'no tower' }], signed_at: null });
    expect(t).toContain('- [x] Fire extinguisher');
    expect(t).toContain('- [-] Tower (no tower)');
    expect(t).toContain('Not yet signed');
  });
});
