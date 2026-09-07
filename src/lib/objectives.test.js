import { describe, it, expect } from 'vitest';
import { objectiveActions, objectiveSummary, sortObjectives, objectivesToCopy } from './objectives';

const me = { id: 'u1' };

describe('objectiveActions', () => {
  it('lets an operator claim, finish, release and undo their own', () => {
    expect(objectiveActions({ status: 'open' }, me, false).map(a => a.status)).toEqual(['claimed']);
    expect(objectiveActions({ status: 'claimed', claimed_by: 'u1' }, me, false).map(a => a.status)).toEqual(['done', 'open']);
    expect(objectiveActions({ status: 'claimed', claimed_by: 'u2' }, me, false)).toEqual([]);
    expect(objectiveActions({ status: 'done', completed_by: 'u1' }, me, false).map(a => a.status)).toEqual(['claimed']);
    expect(objectiveActions({ status: 'dropped' }, me, false)).toEqual([]);
  });
  it('gives planners the extra moves', () => {
    expect(objectiveActions({ status: 'open' }, me, true).map(a => a.status)).toEqual(['claimed', 'done', 'dropped']);
    expect(objectiveActions({ status: 'claimed', claimed_by: 'u2' }, me, true).map(a => a.status)).toEqual(['done', 'open', 'dropped']);
    expect(objectiveActions({ status: 'dropped' }, me, true).map(a => a.status)).toEqual(['open']);
  });
});

describe('summary, order and copy', () => {
  const list = [
    { id: '1', title: 'Pass 10 messages', status: 'done', points: 100, sort_order: 2 },
    { id: '2', title: 'Solar contact', status: 'open', points: 100, sort_order: 1 },
    { id: '3', title: 'Satellite QSO', status: 'claimed', points: 100, sort_order: 3, claimed_by: 'u2' },
    { id: '4', title: 'Skip this', status: 'dropped', points: 50 },
  ];
  it('counts and totals points excluding dropped', () => {
    expect(objectiveSummary(list)).toEqual({ total: 4, open: 1, claimed: 1, done: 1, dropped: 1, points: 300, pointsDone: 100 });
  });
  it('orders open, claimed, done, dropped', () => {
    expect(sortObjectives(list).map(o => o.id)).toEqual(['2', '3', '1', '4']);
  });
  it('copies fresh, unclaimed objectives without the dropped ones', () => {
    const copy = objectivesToCopy(list, 'd2');
    expect(copy).toHaveLength(3);
    expect(copy[0]).toEqual({ deployment_id: 'd2', title: 'Pass 10 messages', description: null, category: null, points: 100, status: 'open', sort_order: 2 });
  });
});
