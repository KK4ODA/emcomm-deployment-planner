import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PacketView } from './PacketView';
import { buildPacket } from '@/lib/packet';

vi.mock('@/lib/platform', () => ({ openExternal: vi.fn(), isDesktopApp: () => false, platformLabel: () => 'web' }));

const packet = buildPacket({
  assignment: { id: 'a1', status: 'accepted', packet_version_seen: 1 },
  shift: { id: 's1', starts_at: '2026-03-01T10:15:00Z', ends_at: '2026-03-01T19:00:00Z', muster_at: '2026-03-01T10:00:00Z' },
  position: { id: 'p1', name: 'AID MILE 12', tactical_callsign: 'AID 12', net: 'RACE', requirements: [{ kind: 'capability', value: 'vhf_voice' }], briefing_notes: 'Wet bulb readings every 30 min.' },
  deployment: { id: 'd1', name: 'PAM 2027', plan_version: 2, plan_published_at: '2026-02-20T00:00:00Z', plan_change_note: 'SAG net moved to 145.450' },
  site: { id: 'l1', name: 'Mercedes-Benz Stadium ramp', address: '33.75, -84.39', lat: 33.75, lon: -84.39, parking_notes: 'Red deck, validate at check-in' },
  supervisorPosition: { name: 'Net Control', tactical_callsign: 'RACE NET' },
  supervisorUsers: [{ call_sign: 'N4RAR', full_name: 'Jim P', phone: '404-555-0100' }],
  planRows: [
    { id: 'r1', condition_level: 1, path_role: 'primary', net: 'RACE', channel_name: 'W4DOC', rx_freq: 146.82, tx_freq: 146.22, tx_tone: '146.2' },
    { id: 'r3', condition_level: 3, path_role: 'primary', channel_name: 'Simplex', rx_freq: 146.55, tx_freq: 146.55, config: 'simplex' },
  ],
  items: [{ id: 'i1', deployment_location_id: 'l1', name: 'HT with headset', quantity: 1 }],
});

describe('PacketView', () => {
  it('puts the essentials above the fold and lists every condition', () => {
    render(<PacketView packet={packet} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AID MILE 12');
    expect(screen.getByText('AID 12')).toBeInTheDocument();
    expect(screen.getAllByText('146.8200− PL 146.2').length).toBeGreaterThan(0);
    expect(screen.getByText(/Condition 3: Repeaters down/)).toBeInTheDocument();
    expect(screen.getByText('146.5500 simplex')).toBeInTheDocument();
    expect(screen.getByText(/Red deck/)).toBeInTheDocument();
    expect(screen.getByText('HT with headset')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /404-555-0100/ })).toHaveAttribute('href', 'tel:404-555-0100');
    expect(screen.getByRole('button', { name: /directions/i })).toBeInTheDocument();
  });

  it('shows the change banner and acknowledges it', () => {
    const onAcknowledge = vi.fn();
    render(<PacketView packet={packet} onAcknowledge={onAcknowledge} />);
    expect(screen.getByRole('alert')).toHaveTextContent('SAG net moved to 145.450');
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onAcknowledge).toHaveBeenCalled();
  });

  it('hides the banner once the version has been seen', () => {
    render(<PacketView packet={{ ...packet, hasUnseenChange: false }} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
