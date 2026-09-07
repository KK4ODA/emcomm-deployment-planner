// IndexedDB wrapper for the local event log and materialised views.
const DB_NAME = 'EmCommPlannerDB';
const DB_VERSION = 4;

// Per-operation timeout. If an IDB transaction can't even progress within this
// window something is very wrong (stale connection, blocked upgrade, etc.).
// We'd rather reject and force a retry than hang forever.
const IDB_OP_TIMEOUT_MS = 8000;

// Stores used by the event-log architecture.
export const STORES = {
  events: 'events',            // full local event log
  tasks: 'entities.tasks',     // materialised view of tasks
  outbox: 'outbox',            // events waiting to be sent upstream
  inbox: 'inbox',              // reserved: events received but not yet applied
  syncState: 'sync_state',     // high-water marks per peer
};

// Stores created by the pre-event-log offline layer. They are no longer read
// or written; the v4 upgrade removes them.
const LEGACY_STORES = ['deployments', 'categories', 'items', 'locations', 'users', 'ics205forms', 'sync_queue'];

class OfflineStorage {
  // Run an IDB op with a fresh connection per call. Caching the connection
  // led to silent hangs when the cached handle went stale (clear-site-data,
  // versionchange in another tab, etc.). Opening fresh per op is ~1ms in
  // Chrome and avoids the entire stale-handle class of bugs.
  async _runOp(label, fn) {
    const db = await this._openFresh();
    try {
      return await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out`)), IDB_OP_TIMEOUT_MS);
        Promise.resolve()
          .then(() => fn(db))
          .then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
      });
    } finally {
      try { db.close(); } catch { /* ignore */ }
    }
  }

  async _openFresh() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      const t = setTimeout(() => reject(new Error('indexedDB.open timed out')), IDB_OP_TIMEOUT_MS);
      request.onerror = () => { clearTimeout(t); reject(request.error); };
      request.onblocked = () => { clearTimeout(t); reject(new Error('indexedDB.open blocked by another connection')); };
      request.onsuccess = () => {
        clearTimeout(t);
        const db = request.result;
        // If something else needs to upgrade this DB, close our connection
        // so it can proceed (we're per-op anyway).
        db.onversionchange = () => { try { db.close(); } catch { /* ignore */ } };
        resolve(db);
      };
      request.onupgradeneeded = (event) => this._applySchema(/** @type {IDBOpenDBRequest} */ (event.target).result);
    });
  }

  _applySchema(db) {
    for (const name of LEGACY_STORES) {
      if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
    }
    if (!db.objectStoreNames.contains(STORES.events)) db.createObjectStore(STORES.events, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(STORES.tasks)) db.createObjectStore(STORES.tasks, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(STORES.inbox)) db.createObjectStore(STORES.inbox, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(STORES.syncState)) db.createObjectStore(STORES.syncState, { keyPath: 'peer' });
  }

  /** Open the database once so the schema upgrade runs eagerly at startup. */
  async init() {
    const db = await this._openFresh();
    db.close();
  }

  _request(storeName, mode, label, run) {
    return this._runOp(`${label}(${storeName})`, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    }));
  }

  getEntity(storeName, id) {
    return this._request(storeName, 'readonly', 'getEntity', (s) => s.get(id));
  }

  getAllEntities(storeName) {
    return this._request(storeName, 'readonly', 'getAllEntities', (s) => s.getAll()).then(r => r ?? []);
  }

  saveEntity(storeName, entity) {
    return this._request(storeName, 'readwrite', 'saveEntity', (s) => s.put(entity));
  }

  deleteEntity(storeName, id) {
    return this._request(storeName, 'readwrite', 'deleteEntity', (s) => s.delete(id)).then(() => undefined);
  }

  clearStore(storeName) {
    return this._request(storeName, 'readwrite', 'clearStore', (s) => s.clear()).then(() => undefined);
  }
}

export const offlineStorage = new OfflineStorage();
