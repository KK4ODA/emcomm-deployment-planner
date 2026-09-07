import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferList } from './OfferList';

const item = (status, id = 'a1') => ({
  assignment: { id, status, offered_at: '2026-03-01T00:00:00Z' },
  shift: { id: 's1', starts_at: '2026-03-01T10:15:00Z', ends_at: '2026-03-01T19:00:00Z', muster_at: '2026-03-01T10:00:00Z' },
  position: { id: 'p1', name: 'AID MILE 12', tactical_callsign: 'AID 12' },
  site: { name: 'Northside Dr' },
});

describe('OfferList', () => {
  it('renders nothing without items', () => {
    const { container } = render(<OfferList items={[]} onRespond={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an offer with accept and decline actions', () => {
    const onRespond = vi.fn();
    render(<OfferList items={[item('offered')]} onRespond={onRespond} />);
    expect(screen.getByText('AID MILE 12')).toBeInTheDocument();
    expect(screen.getByText('AID 12')).toBeInTheDocument();
    expect(screen.getByText(/1 to answer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /i will be there/i }));
    expect(onRespond).toHaveBeenCalledWith('a1', 'accepted');
  });

  it('asks for a reason before declining', () => {
    const onRespond = vi.fn();
    render(<OfferList items={[item('offered')]} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole('button', { name: /i cannot/i }));
    expect(onRespond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));
    expect(onRespond).toHaveBeenCalledWith('a1', 'declined', 'Schedule conflict');
  });

  it('lists confirmed assignments without offer buttons', () => {
    render(<OfferList items={[item('accepted')]} onRespond={() => {}} />);
    expect(screen.queryByRole('button', { name: /i will be there/i })).toBeNull();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });
});
