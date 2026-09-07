import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { offlineStorage } from '@/lib/offline/storage';
import { initSyncEngine, syncNow, getTier, onTierChange, getPendingCount, onPendingChange } from '@/api/syncEngine';

/**
 * @typedef {Object} OfflineState
 * @property {'ONLINE'|'OFFLINE'} tier
 * @property {boolean} isOnline
 * @property {number} pendingCount events waiting in the outbox
 * @property {() => Promise<void>} syncNow
 */

const OfflineContext = createContext(/** @type {OfflineState|null} */ (null));

export function OfflineProvider({ children }) {
  const [tier, setTier] = useState(getTier());
  const [pendingCount, setPendingCount] = useState(getPendingCount());

  useEffect(() => {
    offlineStorage.init()
      .then(() => initSyncEngine())
      .catch(err => console.error('Offline storage init failed:', err));
    const unsubTier = onTierChange(setTier);
    const unsubPending = onPendingChange(setPendingCount);
    return () => { unsubTier(); unsubPending(); };
  }, []);

  const value = useMemo(() => ({ tier, isOnline: tier === 'ONLINE', pendingCount, syncNow }), [tier, pendingCount]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/** @returns {OfflineState} */
export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within OfflineProvider');
  return context;
}
