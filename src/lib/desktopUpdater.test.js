import { describe, it, expect } from 'vitest';
import { snoozeUpdate, isSnoozed } from './desktopUpdater';

describe('desktop updater snooze', () => {
  it('is not snoozed by default', () => {
    expect(isSnoozed('1.2.0')).toBe(false);
  });

  it('snoozes only the postponed version for 24 hours', () => {
    snoozeUpdate('1.2.0', 1_000);
    expect(isSnoozed('1.2.0', 2_000)).toBe(true);
    expect(isSnoozed('1.3.0', 2_000)).toBe(false);
    expect(isSnoozed('1.2.0', 1_000 + 24 * 60 * 60 * 1000 + 1)).toBe(false);
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('emcomm_update_snooze', '{nope');
    expect(isSnoozed('1.2.0')).toBe(false);
  });
});
