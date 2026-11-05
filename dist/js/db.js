/**
 * ResQNet - IndexedDB Storage Engine
 * Offline-first local database management with ACID transactions
 */

class ResQNetDB {
  static DB_NAME = 'ResQNetDB';
  static DB_VERSION = 1;
  static instance = null;

  constructor() {
    this.db = null;
    this.isReady = false;
  }

  static async getInstance() {
    if (!ResQNetDB.instance) {
      ResQNetDB.instance = new ResQNetDB();
      await ResQNetDB.instance.init();
    }
    return ResQNetDB.instance;
  }

  /**
   * Initialize IndexedDB database and schema
   */
  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(ResQNetDB.DB_NAME, ResQNetDB.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[ResQNet DB] Initializing or upgrading schema version:', event.oldVersion, '->', event.newVersion);

        // 1. Reports store
        if (!db.objectStoreNames.contains('reports')) {
          const reportsStore = db.createObjectStore('reports', { keyPath: 'id' });
          reportsStore.createIndex('timestamp', 'timestamp', { unique: false });
          reportsStore.createIndex('severity', 'severity', { unique: false });
          reportsStore.createIndex('status', 'status', { unique: false });
          reportsStore.createIndex('syncStatus', 'syncStatus', { unique: false });
          reportsStore.createIndex('category', 'category', { unique: false });
        }

        // 2. Teams store
        if (!db.objectStoreNames.contains('teams')) {
          const teamsStore = db.createObjectStore('teams', { keyPath: 'id' });
          teamsStore.createIndex('availability', 'availability', { unique: false });
          teamsStore.createIndex('assignedZone', 'assignedZone', { unique: false });
        }

        // 3. Resources store
        if (!db.objectStoreNames.contains('resources')) {
          const resourcesStore = db.createObjectStore('resources', { keyPath: 'id' });
          resourcesStore.createIndex('category', 'category', { unique: false });
          resourcesStore.createIndex('status', 'status', { unique: false });
        }

        // 4. Shelters store
        if (!db.objectStoreNames.contains('shelters')) {
          const sheltersStore = db.createObjectStore('shelters', { keyPath: 'id' });
          sheltersStore.createIndex('type', 'type', { unique: false });
          sheltersStore.createIndex('status', 'status', { unique: false });
        }

        // 5. Offline Sync Queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncQueueStore = db.createObjectStore('syncQueue', { keyPath: 'queueId', autoIncrement: true });
          syncQueueStore.createIndex('status', 'status', { unique: false });
          syncQueueStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 6. Audit & Activity Logs store
        if (!db.objectStoreNames.contains('auditLogs')) {
          const logsStore = db.createObjectStore('auditLogs', { keyPath: 'id', autoIncrement: true });
          logsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 7. Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        this.isReady = true;
        console.log('[ResQNet DB] Connected to IndexedDB successfully.');

        // Seed data if empty
        await this.checkAndSeedData();
        resolve(this);
      };

      request.onerror = (event) => {
        console.error('[ResQNet DB] Error opening IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Seed initial data if reports store is empty
   */
  async checkAndSeedData() {
    try {
      const reportsCount = await this.count('reports');
      if (reportsCount === 0 && window.SEED_DATA) {
        console.log('[ResQNet DB] Database empty. Seeding initial disaster dataset...');
        const tx = this.db.transaction(['reports', 'teams', 'resources', 'shelters', 'auditLogs'], 'readwrite');
        
        // Seed reports
        const reportsStore = tx.objectStore('reports');
        window.SEED_DATA.reports.forEach(report => reportsStore.put(report));

        // Seed teams
        const teamsStore = tx.objectStore('teams');
        window.SEED_DATA.teams.forEach(team => teamsStore.put(team));

        // Seed resources
        const resourcesStore = tx.objectStore('resources');
        window.SEED_DATA.resources.forEach(res => resourcesStore.put(res));

        // Seed shelters
        const sheltersStore = tx.objectStore('shelters');
        window.SEED_DATA.shelters.forEach(sh => sheltersStore.put(sh));

        // Initial audit log
        const logsStore = tx.objectStore('auditLogs');
        logsStore.add({
          timestamp: new Date().toISOString(),
          action: 'SYSTEM_INIT',
          details: 'Initialized ResQNet Offline Database with Delta Coastal Basin simulation dataset.',
          user: 'System Boot'
        });

        await new Promise((res, rej) => {
          tx.oncomplete = () => {
            console.log('[ResQNet DB] Seed dataset successfully committed to IndexedDB.');
            res();
          };
          tx.onerror = () => rej(tx.error);
        });
      }
    } catch (err) {
      console.error('[ResQNet DB] Seeding failed:', err);
    }
  }

  /**
   * Reset database back to default seed data
   */
  async resetToDefaultSeed() {
    if (!window.SEED_DATA) return;
    const stores = ['reports', 'teams', 'resources', 'shelters', 'syncQueue', 'auditLogs'];
    const tx = this.db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());

    const reportsStore = tx.objectStore('reports');
    window.SEED_DATA.reports.forEach(r => reportsStore.put(r));

    const teamsStore = tx.objectStore('teams');
    window.SEED_DATA.teams.forEach(t => teamsStore.put(t));

    const resourcesStore = tx.objectStore('resources');
    window.SEED_DATA.resources.forEach(res => resourcesStore.put(res));

    const sheltersStore = tx.objectStore('shelters');
    window.SEED_DATA.shelters.forEach(sh => sheltersStore.put(sh));

    tx.objectStore('auditLogs').add({
      timestamp: new Date().toISOString(),
      action: 'DATA_RESET',
      details: 'Manual reset of local database to factory seed data.',
      user: 'Administrator'
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('[ResQNet DB] Database reset complete.');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Generic get all items from a store
   */
  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic get by key
   */
  get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic put (insert or update)
   */
  put(storeName, item) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic add (new item)
   */
  add(storeName, item) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic delete
   */
  delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic count
   */
  count(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query items using index
   */
  getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add operational audit log
   */
  async logAudit(action, details, user = 'Operator') {
    try {
      const item = {
        timestamp: new Date().toISOString(),
        action,
        details,
        user
      };
      await this.add('auditLogs', item);
    } catch (e) {
      console.warn('Could not log audit item:', e);
    }
  }

  /**
   * Get latest audit logs
   */
  async getAuditLogs(limit = 20) {
    const logs = await this.getAll('auditLogs');
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
  }

  /**
   * Add operation to offline sync queue
   */
  async queueSync(action, entity, data) {
    const item = {
      action, // 'CREATE_REPORT', 'UPDATE_TEAM', 'UPDATE_INVENTORY', etc.
      entity, // 'report', 'team', 'resource'
      data,
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0
    };
    return await this.add('syncQueue', item);
  }

  /**
   * Get all pending sync items
   */
  async getPendingSync() {
    return await this.getAll('syncQueue');
  }

  /**
   * Remove item from sync queue
   */
  async removeSyncQueueItem(queueId) {
    return await this.delete('syncQueue', queueId);
  }

  /**
   * Clear entire sync queue
   */
  clearSyncQueue() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('syncQueue', 'readwrite');
      const store = tx.objectStore('syncQueue');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// Export singleton instance getter
window.ResQNetDB = ResQNetDB;

