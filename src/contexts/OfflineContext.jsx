import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { offlineStorage } from '@/lib/offline/storage';
import { initSyncEngine, syncNow, getTier, onTierChange, getPendingCount, getFailedCount, onPendingChange } from '@/api/syncEngine';

/**
 * @typedef {Object} OfflineState
 * @property {'ONLINE'|'OFFLINE'} tier
 * @property {boolean} isOnline
 * @property {number} pendingCount events waiting in the outbox
 * @property {number} failedCount queued changes the server rejected for good
 * @property {(opts?: { force?: boolean }) => Promise<void>} syncNow
 */

const OfflineContext = createContext(/** @type {OfflineState|null} */ (null));

export function OfflineProvider({ children }) {
  const [tier, setTier] = useState(getTier());
  const [pendingCount, setPendingCount] = useState(getPendingCount());
  const [failedCount, setFailedCount] = useState(getFailedCount());

  useEffect(() => {
    offlineStorage.init()
      .then(() => initSyncEngine())
      .catch(err => console.error('Offline storage init failed:', err));
    const unsubTier = onTierChange(setTier);
    const unsubPending = onPendingChange((pending, failed) => { setPendingCount(pending); setFailedCount(failed); });
    return () => { unsubTier(); unsubPending(); };
  }, []);

  const value = useMemo(() => ({ tier, isOnline: tier === 'ONLINE', pendingCount, failedCount, syncNow }), [tier, pendingCount, failedCount]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/** @returns {OfflineState} */
export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within OfflineProvider');
  return context;
}
