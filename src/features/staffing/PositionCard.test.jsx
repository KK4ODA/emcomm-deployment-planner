import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PositionCard } from './PositionCard';

const position = { id: 'p1', name: 'SAG 3', tactical_callsign: 'SAG 3', position_type: 'sag', headcount: 1, requirements: [{ kind: 'station_type', value: 'mobile', mandatory: true }] };
const shift = { id: 's1', position_id: 'p1', starts_at: '2026-03-01T10:30:00Z', ends_at: '2026-03-01T19:00:00Z' };
const users = new Map([['u1', { id: 'u1', call_sign: 'W4CEF', station_types: ['mobile'], capabilities: ['vhf_voice'] }]]);

const renderCard = (props) => render(
  <TooltipProvider><PositionCard position={position} shifts={[shift]} assignments={[]} usersById={users} canEdit onEdit={() => {}} onDelete={() => {}} onOpenShift={() => {}} {...props} /></TooltipProvider>,
);

describe('PositionCard', () => {
  it('shows an open shift chip and opens it', () => {
    const onOpenShift = vi.fn();
    renderCard({ onOpenShift });
    const chip = screen.getByRole('button', { name: /SAG 3 shift .*: Open/ });
    fireEvent.click(chip);
    expect(onOpenShift).toHaveBeenCalledWith(shift);
    expect(screen.getByText('Mobile')).toBeInTheDocument();
  });

  it('shows the assigned call sign once covered', () => {
    renderCard({ assignments: [{ shift_id: 's1', user_id: 'u1', status: 'accepted' }] });
    expect(screen.getByRole('button', { name: /: Covered/ })).toBeInTheDocument();
    expect(screen.getByText('W4CEF')).toBeInTheDocument();
  });

  it('warns when a position has no shift', () => {
    renderCard({ shifts: [] });
    expect(screen.getByText(/no shift yet/i)).toBeInTheDocument();
  });
});
