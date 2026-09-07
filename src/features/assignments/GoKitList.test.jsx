import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GoKitList, goKitStorageKey } from './GoKitList';

const items = [
  { id: 'a', name: 'HT radio', priority: 'essential', category_id: 'c1', deployment_location_id: 'l1', quantity: 2 },
  { id: 'b', name: 'Coax', priority: 'optional', category_id: 'c1', deployment_location_id: 'l1', quantity: 1 },
];
const categoryById = new Map([['c1', { name: 'Radios', color: 'sky' }]]);
const siteName = new Map([['l1', 'EOC']]);

describe('GoKitList', () => {
  beforeEach(() => localStorage.clear());

  it('builds a per-deployment, per-operator key', () => {
    expect(goKitStorageKey('dep1', 'KK4ODA')).toBe('emcomm_gokit:dep1:KK4ODA');
  });

  it('ticks items, shows progress and persists to localStorage', () => {
    const key = goKitStorageKey('dep1', 'KK4ODA');
    render(<GoKitList storageKey={key} items={items} categoryById={categoryById} siteName={siteName} />);
    expect(screen.getByText('0/2 packed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /packed: ht radio/i }));
    expect(screen.getByText('1/2 packed')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key))).toEqual({ a: true });
  });

  it('restores ticks and can reset them', () => {
    const key = goKitStorageKey('dep1', 'KK4ODA');
    localStorage.setItem(key, JSON.stringify({ b: true }));
    render(<GoKitList storageKey={key} items={items} categoryById={categoryById} siteName={siteName} />);
    expect(screen.getByRole('checkbox', { name: /packed: coax/i })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByText('0/2 packed')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key))).toEqual({});
  });

  it('shows an empty message without items', () => {
    render(<GoKitList storageKey="k" items={[]} categoryById={categoryById} siteName={siteName} />);
    expect(screen.getByText(/no equipment assigned/i)).toBeInTheDocument();
  });
});
