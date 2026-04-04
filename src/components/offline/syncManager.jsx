import { base44 } from '@/api/base44Client';
import { offlineStorage } from './storage';

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncListeners = [];
  }

  onSyncStateChange(listener) {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener);
    };
  }

  notifySyncState(state) {
    this.syncListeners.forEach(listener => listener(state));
  }

  async syncData() {
    if (this.isSyncing) return;
    
    this.isSyncing = true;
    this.notifySyncState({ syncing: true, error: null });

    try {
      // Sync queued actions first
      await this.syncQueuedActions();

      // Then fetch fresh data from server
      await this.fetchAndStoreData();

      this.notifySyncState({ syncing: false, error: null, lastSync: Date.now() });
    } catch (error) {
      console.error('Sync failed:', error);
      this.notifySyncState({ syncing: false, error: error.message });
    } finally {
      this.isSyncing = false;
    }
  }

  async syncQueuedActions() {
    const actions = await offlineStorage.getQueuedActions();
    
    for (const action of actions) {
      try {
        await this.executeAction(action);
        await offlineStorage.removeQueuedAction(action.id);
      } catch (error) {
        console.error('Failed to sync action:', action, error);
        // Keep failed actions in queue for retry
        if (action.retries < 3) {
          action.retries++;
          await offlineStorage.saveEntity('sync_queue', action);
        } else {
          // After 3 retries, remove from queue
          await offlineStorage.removeQueuedAction(action.id);
        }
      }
    }
  }

  async executeAction(action) {
    const { type, entity, data, id } = action;

    switch (type) {
      case 'create':
        await base44.entities[entity].create(data);
        break;
      case 'update':
        await base44.entities[entity].update(id, data);
        break;
      case 'delete':
        await base44.entities[entity].delete(id);
        break;
      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  }

  async fetchAndStoreData() {
    try {
      // Fetch all entities
      const [deployments, categories, items, locations, users, ics205forms] = await Promise.all([
        base44.entities.Deployment.list().catch(() => []),
        base44.entities.Category.list().catch(() => []),
        base44.entities.DeploymentItem.list().catch(() => []),
        base44.entities.DeploymentLocation.list().catch(() => []),
        base44.entities.User.list().catch(() => []),
        base44.entities.ICS205Form.list().catch(() => [])
      ]);

      // Store in IndexedDB
      await Promise.all([
        offlineStorage.saveEntities('deployments', deployments),
        offlineStorage.saveEntities('categories', categories),
        offlineStorage.saveEntities('items', items),
        offlineStorage.saveEntities('locations', locations),
        offlineStorage.saveEntities('users', users),
        offlineStorage.saveEntities('ics205forms', ics205forms)
      ]);
    } catch (error) {
      console.error('Error fetching and storing data:', error);
      throw error;
    }
  }

  async queueAction(type, entity, data, id = null) {
    const action = { type, entity, data, id };
    await offlineStorage.queueAction(action);
    
    // Also update local cache optimistically
    if (type === 'create') {
      const tempId = `temp_${Date.now()}`;
      await offlineStorage.saveEntity(this.getStoreName(entity), { ...data, id: tempId, _temp: true });
    } else if (type === 'update') {
      await offlineStorage.saveEntity(this.getStoreName(entity), { ...data, id });
    } else if (type === 'delete') {
      await offlineStorage.deleteEntity(this.getStoreName(entity), id);
    }
  }

  getStoreName(entity) {
    const map = {
      'Deployment': 'deployments',
      'Category': 'categories',
      'DeploymentItem': 'items',
      'DeploymentLocation': 'locations',
      'User': 'users',
      'ICS205Form': 'ics205forms'
    };
    return map[entity] || entity.toLowerCase() + 's';
  }
}

export const syncManager = new SyncManager();