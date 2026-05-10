// IndexedDB wrapper for offline storage
const DB_NAME = 'EmCommPlannerDB';
const DB_VERSION = 3;

// Per-operation timeout. If an IDB transaction can't even progress within this
// window something is very wrong (stale connection, blocked upgrade, etc.).
// We'd rather reject and force a reinit than hang forever.
const IDB_OP_TIMEOUT_MS = 8000;

class OfflineStorage {
  constructor() {
    this.db = null;
    this._initInFlight = null;
  }

  // Run an IDB op with a timeout + retry-once-on-stale-connection.
  // Detects scenarios like: another tab triggered a versionchange, the page
  // cleared site data and the cached handle is now bogus, the connection
  // was force-closed, etc. Forces a re-init in those cases.
  async _runOp(label, fn) {
    if (!this.db) await this._ensureInit();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      };
      const timer = setTimeout(async () => {
        // Likely a stale handle. Drop it, reinit, and retry once.
        if (settled) return;
        console.warn(`IDB op "${label}" timed out; reinitialising connection`);
        try { this.db?.close(); } catch (_) { /* ignore */ }
        this.db = null;
        try {
          await this._ensureInit();
          // Retry the op once on the fresh connection
          const retryResult = await fn(this.db);
          finish(null, retryResult);
        } catch (retryErr) {
          finish(retryErr);
        }
      }, IDB_OP_TIMEOUT_MS);
      // First attempt
      Promise.resolve()
        .then(() => fn(this.db))
        .then(value => finish(null, value), err => finish(err));
    });
  }

  async _ensureInit() {
    if (this.db) return this.db;
    if (this._initInFlight) return this._initInFlight;
    this._initInFlight = this.init().finally(() => { this._initInFlight = null; });
    return this._initInFlight;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        // If another tab tries to upgrade, close our handle so the upgrade
        // can proceed; subsequent ops will re-init.
        this.db.onversionchange = () => {
          try { this.db?.close(); } catch (_) { /* ignore */ }
          this.db = null;
        };
        // If the browser force-closes the connection (e.g., user clears
        // site data while we're running), null our handle.
        this.db.onclose = () => { this.db = null; };
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores for each entity type
        if (!db.objectStoreNames.contains('deployments')) {
          db.createObjectStore('deployments', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('locations')) {
          db.createObjectStore('locations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('ics205forms')) {
          db.createObjectStore('ics205forms', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        // Phase 1: event-log stores
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entities.tasks')) {
          db.createObjectStore('entities.tasks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('inbox')) {
          db.createObjectStore('inbox', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_state')) {
          db.createObjectStore('sync_state', { keyPath: 'peer' });
        }
      };
    });
  }

  async saveEntities(storeName, entities) {
    if (!this.db) await this.init();
    
    const tx = this.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    for (const entity of entities) {
      await store.put(entity);
    }
    
    return tx.complete;
  }

  async getEntities(storeName) {
    return this._runOp(`getEntities(${storeName})`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }

  async saveEntity(storeName, entity) {
    return this._runOp(`saveEntity(${storeName})`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(entity);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }

  async deleteEntity(storeName, id) {
    return this._runOp(`deleteEntity(${storeName})`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }));
  }

  async queueAction(action) {
    if (!this.db) await this.init();
    
    const actionWithTimestamp = {
      ...action,
      timestamp: Date.now(),
      retries: 0
    };
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.add(actionWithTimestamp);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getQueuedActions() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeQueuedAction(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearStore(storeName) {
    return this._runOp(`clearStore(${storeName})`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }));
  }

  async getEntity(storeName, id) {
    return this._runOp(`getEntity(${storeName})`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    }));
  }

  async getAllEntities(storeName) {
    return this.getEntities(storeName);
  }
}

export const offlineStorage = new OfflineStorage();