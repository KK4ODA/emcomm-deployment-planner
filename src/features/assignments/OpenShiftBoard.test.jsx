import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OpenShiftBoard } from './OpenShiftBoard';

const base = {
  shift: { id: 's1', starts_at: '2026-03-07T10:00:00Z', ends_at: '2026-03-07T14:00:00Z' },
  position: { id: 'p1', name: 'AID MILE 12', tactical_callsign: 'AID 12', site_id: 'l1' },
  open: 1, headcount: 2,
  match: { ok: true, unmet: [], optionalUnmet: [], unknown: [] },
  overlaps: [], canTake: true,
};

describe('OpenShiftBoard', () => {
  it('renders nothing without open shifts', () => {
    const { container } = render(<OpenShiftBoard items={[]} onTake={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes a shift after one confirmation', () => {
    const onTake = vi.fn();
    render(<OpenShiftBoard items={[base]} siteName={new Map([['l1', 'Northside Dr']])} onTake={onTake} />);
    expect(screen.getByText('AID MILE 12')).toBeInTheDocument();
    expect(screen.getByText('Northside Dr')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 open')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /take this shift/i }));
    expect(onTake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /yes, i will be there/i }));
    expect(onTake).toHaveBeenCalledWith('s1');
  });

  it('explains why a shift cannot be taken and disables the button', () => {
    const item = { ...base, canTake: false, match: { ok: false, unmet: [{ kind: 'capability', value: 'aprs' }], optionalUnmet: [], unknown: [] }, overlaps: [{ shift_id: 's9' }] };
    render(<OpenShiftBoard items={[item]} positionName={new Map([['s9', 'SAG 1']])} onTake={() => {}} />);
    expect(screen.getByText(/Needs APRS/)).toBeInTheDocument();
    expect(screen.getByText('Overlaps your shift at SAG 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take this shift/i })).toBeDisabled();
  });
});
