// Wrapper for React Query to work with offline storage
import { base44 } from '@/api/base44Client';
import { offlineStorage } from './storage';
import { syncManager } from './syncManager';

export function createOfflineWrapper() {
  const isOnline = () => navigator.onLine;

  return {
    // Wrapped query function that falls back to IndexedDB when offline
    async queryWrapper(entityName, queryFn) {
      if (isOnline()) {
        try {
          const result = await queryFn();
          // Cache the result
          const storeName = syncManager.getStoreName(entityName);
          if (Array.isArray(result)) {
            await offlineStorage.saveEntities(storeName, result);
          } else if (result) {
            await offlineStorage.saveEntity(storeName, result);
          }
          return result;
        } catch (error) {
          console.error('Online query failed, falling back to cache:', error);
          // Fall back to cache on error
          return this.getFromCache(entityName);
        }
      } else {
        // Offline - return from cache
        return this.getFromCache(entityName);
      }
    },

    async getFromCache(entityName) {
      const storeName = syncManager.getStoreName(entityName);
      return offlineStorage.getEntities(storeName);
    },

    // Wrapped mutation that queues actions when offline
    async mutationWrapper(type, entity, data, id = null) {
      if (isOnline()) {
        try {
          // Try to execute online
          return await syncManager.executeAction({ type, entity, data, id });
        } catch (error) {
          console.error('Online mutation failed, queueing:', error);
          // Queue for later if online mutation fails
          await syncManager.queueAction(type, entity, data, id);
          throw error;
        }
      } else {
        // Offline - queue the action
        await syncManager.queueAction(type, entity, data, id);
        return { _queued: true, _temp_id: `temp_${Date.now()}` };
      }
    }
  };
}

export const offlineWrapper = createOfflineWrapper();