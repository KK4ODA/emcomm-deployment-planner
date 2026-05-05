import React, { createContext, useContext, useState, useEffect } from 'react';
import { offlineStorage } from './offline/storage';
import { initSyncEngine, syncNow, getTier, onTierChange } from '@/api/syncEngine';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [tier, setTier] = useState(getTier());

  useEffect(() => {
    offlineStorage.init()
      .then(() => initSyncEngine())
      .catch(err => console.error('OfflineProvider init failed:', err));

    const unsub = onTierChange(setTier);
    return unsub;
  }, []);

  return (
    <OfflineContext.Provider value={{ tier, isOnline: tier === 'ONLINE', syncNow }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline must be used within OfflineProvider');
  return context;
}
