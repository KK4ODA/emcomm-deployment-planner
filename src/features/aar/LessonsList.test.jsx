import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LessonsList } from './LessonsList';

const positions = [{ id: 'p1', name: 'AID 12', tactical_callsign: 'AID 12' }];
const lessons = [
  { id: 'l1', category: 'comms', finding: 'Simplex did not reach mile 20', recommendation: 'Add relay', status: 'open', position_id: 'p1' },
  { id: 'l2', category: 'staffing', finding: 'Need a floater', status: 'carried_forward', carried_from_lesson_id: 'x', position_id: null },
];

describe('LessonsList', () => {
  it('lists carried-forward lessons first with their origin', () => {
    render(<LessonsList lessons={lessons} positions={positions} canEdit={false} onAdd={() => {}} onUpdate={() => {}} onDelete={() => {}} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Need a floater');
    expect(items[0]).toHaveTextContent(/carried from the previous deployment/);
    expect(items[1]).toHaveTextContent('Position: AID 12');
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });

  it('adds a lesson for the whole deployment by default', () => {
    const onAdd = vi.fn();
    render(<LessonsList lessons={[]} positions={positions} canEdit onAdd={onAdd} onUpdate={() => {}} onDelete={() => {}} />);
    fireEvent.change(screen.getByLabelText('Finding'), { target: { value: '  Water ran out at 14:00 ' } });
    fireEvent.change(screen.getByLabelText('Recommendation'), { target: { value: 'Second pallet' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect(onAdd).toHaveBeenCalledWith({ category: 'process', finding: 'Water ran out at 14:00', recommendation: 'Second pallet', position_id: null });
    expect(screen.getByLabelText('Finding')).toHaveValue('');
  });

  it('does not add an empty finding', () => {
    const onAdd = vi.fn();
    render(<LessonsList lessons={[]} positions={[]} canEdit onAdd={onAdd} onUpdate={() => {}} onDelete={() => {}} />);
    fireEvent.submit(screen.getByRole('button', { name: /add/i }).closest('form'));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
