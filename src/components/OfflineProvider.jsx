import React, { createContext, useContext, useState, useEffect } from 'react';
import { offlineStorage } from './offline/storage';
import { syncManager } from './offline/syncManager';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState({ syncing: false, error: null, lastSync: null });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Initialize IndexedDB
    offlineStorage.init().then(() => {
      setInitialized(true);
      // Initial sync if online
      if (navigator.onLine) {
        syncManager.syncData().catch(console.error);
      }
    }).catch(console.error);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      // Sync when coming back online
      syncManager.syncData().catch(console.error);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for sync state changes
    const unsubscribe = syncManager.onSyncStateChange(setSyncState);

    // Periodic sync when online (every 5 minutes)
    const syncInterval = setInterval(() => {
      if (navigator.onLine) {
        syncManager.syncData().catch(console.error);
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
      clearInterval(syncInterval);
    };
  }, []);

  const value = {
    isOnline,
    syncState,
    initialized,
    syncNow: () => syncManager.syncData(),
    queueAction: (type, entity, data, id) => syncManager.queueAction(type, entity, data, id)
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
}