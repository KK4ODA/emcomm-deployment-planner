import { describe, it, expect } from 'vitest';
import { nextTaskStep, deskTaskActions, taskRoute, taskAttention, sortTasks, tasksForOperator, taskSummary, taskAprsText } from './tasking';

const now = new Date('2027-03-07T12:00:00Z');
const mk = (o) => ({ id: o.id || 't', seq: 1, status: 'issued', priority: 'routine', issued_at: '2027-03-07T11:50:00Z', title: 'x', ...o });

describe('tasking helpers', () => {
  it('walks the ladder one step at a time for operators, any forward step for the desk', () => {
    expect(nextTaskStep('issued')).toMatchObject({ status: 'acknowledged' });
    expect(nextTaskStep('on_scene')).toMatchObject({ status: 'complete' });
    expect(nextTaskStep('complete')).toBeNull();
    expect(deskTaskActions('en_route').map(a => a.status)).toEqual(['on_scene', 'complete', 'cancelled']);
    expect(deskTaskActions('cancelled')).toEqual([]);
  });

  it('describes the route from sites or free text', () => {
    const sites = new Map([['a', { name: 'AID 2' }], ['b', { name: 'HDBY' }]]);
    expect(taskRoute({ from_site_id: 'a', to_site_id: 'b' }, sites)).toBe('AID 2 to HDBY');
    expect(taskRoute({ from_text: 'Mile 12 ramp' }, sites)).toBe('Mile 12 ramp');
    expect(taskRoute({}, sites)).toBe('');
  });

  it('flags unacknowledged tasks by age, faster when urgent', () => {
    expect(taskAttention(mk({ issued_at: '2027-03-07T11:57:00Z' }), now)).toBe('none');
    expect(taskAttention(mk({ issued_at: '2027-03-07T11:54:00Z' }), now)).toBe('warning');
    expect(taskAttention(mk({ issued_at: '2027-03-07T11:49:00Z' }), now)).toBe('critical');
    expect(taskAttention(mk({ issued_at: '2027-03-07T11:57:00Z', priority: 'urgent' }), now)).toBe('warning');
    expect(taskAttention(mk({ status: 'en_route', en_route_at: '2027-03-07T11:00:00Z', issued_at: '2027-03-07T10:30:00Z' }), now)).toBe('warning');
    expect(taskAttention(mk({ status: 'complete' }), now)).toBe('none');
  });

  it('sorts open before closed, urgent first, then oldest', () => {
    const list = [
      mk({ id: 'done', status: 'complete', completed_at: '2027-03-07T11:00:00Z' }),
      mk({ id: 'old', issued_at: '2027-03-07T11:40:00Z' }),
      mk({ id: 'urgent', priority: 'urgent', issued_at: '2027-03-07T11:58:00Z' }),
      mk({ id: 'new', issued_at: '2027-03-07T11:58:00Z' }),
    ];
    expect(sortTasks(list, now).map(t => t.id)).toEqual(['urgent', 'old', 'new', 'done']);
  });

  it('picks the tasks that concern one operator', () => {
    const list = [mk({ id: 'mine', assignment_id: 'a1' }), mk({ id: 'unit', position_id: 'p1' }), mk({ id: 'other', position_id: 'p2' }), mk({ id: 'all' }), mk({ id: 'named-other', assignment_id: 'a9', position_id: 'p1' })];
    expect(tasksForOperator(list, { assignmentIds: ['a1'], positionIds: ['p1'] }).map(t => t.id)).toEqual(['mine', 'unit', 'all']);
  });

  it('summarises for the board and the AAR', () => {
    const s = taskSummary([
      mk({ id: 'a', issued_at: '2027-03-07T11:58:00Z' }), mk({ id: 'b', issued_at: '2027-03-07T11:40:00Z' }),
      mk({ id: 'c', status: 'complete', issued_at: '2027-03-07T10:00:00Z', on_scene_at: '2027-03-07T10:12:00Z', completed_at: '2027-03-07T10:30:00Z' }),
      mk({ id: 'd', status: 'cancelled' }),
    ], now);
    expect(s).toMatchObject({ open: 2, unacknowledged: 2, overdue: 1, complete: 1, cancelled: 1, medianToScene: 12 });
  });

  it('fits the dispatch in one APRS message', () => {
    const sites = new Map([['a', { name: 'Aid station mile 2' }]]);
    expect(taskAprsText(mk({ seq: 14, priority: 'priority', title: 'Pick up bib 1234', from_site_id: 'a' }), sites)).toBe('T14+ Pick up bib 1234 @Aid station mile 2');
    expect(taskAprsText(mk({ seq: 3, title: 'x'.repeat(80) })).length).toBe(67);
  });
});
