/**
 * ResQNet - Offline-First Synchronization Engine
 * Handles connectivity state, offline queuing, simulation, and sync replay
 */

class SyncEngine {
  constructor(db) {
    this.db = db;
    this.isSimulatedOffline = false;
    this.isSyncing = false;
    this.subscribers = new Set();
    
    // Check initial online status
    this.realOnline = navigator.onLine;

    this.initListeners();
  }

  get isOnline() {
    if (this.isSimulatedOffline) return false;
    return this.realOnline;
  }

  initListeners() {
    window.addEventListener('online', () => {
      this.realOnline = true;
      this.handleConnectivityChange();
    });

    window.addEventListener('offline', () => {
      this.realOnline = false;
      this.handleConnectivityChange();
    });

    // Check service worker postMessages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'TRIGGER_SYNC') {
          console.log('[ResQNet Sync] Received sync trigger from Service Worker');
          if (this.isOnline) {
            this.syncPendingData();
          }
        }
      });
    }
  }

  /**
   * Toggle simulated offline mode (ideal for offline-first testing and academic evaluations)
   */
  setSimulatedOffline(value) {
    this.isSimulatedOffline = value;
    this.handleConnectivityChange();
    
    if (!this.isSimulatedOffline && this.isOnline) {
      // Auto trigger sync if turned back to online
      this.syncPendingData();
    }
  }

  /**
   * Subscribe to network and sync state changes
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    callback({
      isOnline: this.isOnline,
      isSimulated: this.isSimulatedOffline,
      pendingCount: 0
    });
    this.updatePendingCount();
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(data) {
    this.subscribers.forEach(cb => {
      try { cb(data); } catch (e) { console.error(e); }
    });
  }

  async handleConnectivityChange() {
    const pendingItems = await this.db.getPendingSync();
    const data = {
      isOnline: this.isOnline,
      isSimulated: this.isSimulatedOffline,
      pendingCount: pendingItems.length
    };

    console.log(`[ResQNet Sync] Connectivity changed: ${this.isOnline ? 'ONLINE' : 'OFFLINE'} (Simulated: ${this.isSimulatedOffline})`);
    this.notifySubscribers(data);

    // Broadcast DOM event
    window.dispatchEvent(new CustomEvent('resqnet:connectivity', { detail: data }));

    if (this.isOnline && pendingItems.length > 0) {
      // Prompt or auto sync
      this.syncPendingData();
    }
  }

  async updatePendingCount() {
    try {
      const items = await this.db.getPendingSync();
      this.notifySubscribers({
        isOnline: this.isOnline,
        isSimulated: this.isSimulatedOffline,
        pendingCount: items.length
      });
    } catch (e) {
      console.warn('Could not update pending count:', e);
    }
  }

  /**
   * Queue mutation when offline or mark synced when online
   */
  async trackMutation(action, entity, data) {
    if (!this.isOnline) {
      // Offline: Add to sync queue
      const queueId = await this.db.queueSync(action, entity, data);
      await this.db.logAudit(
        `OFFLINE_${action}`,
        `Saved ${entity} locally (Queue ID #${queueId}). Queued for background synchronization.`,
        'Field Responder'
      );
      await this.updatePendingCount();
      return { synced: false, queueId };
    } else {
      // Online: Simulate immediate direct sync with HQ
      await this.db.logAudit(
        `ONLINE_${action}`,
        `Transmitted ${entity} update directly to Central Command HQ.`,
        'Field Responder'
      );
      return { synced: true };
    }
  }

  /**
   * Synchronize pending data from IndexedDB with visual progress
   */
  async syncPendingData() {
    if (this.isSyncing) return;
    if (!this.isOnline) {
      window.dispatchEvent(new CustomEvent('resqnet:toast', {
        detail: {
          title: 'Cannot Synchronize',
          message: 'System is currently offline. Reconnect or disable Offline Simulation first.',
          type: 'warning'
        }
      }));
      return;
    }

    const pendingQueue = await this.db.getPendingSync();
    if (pendingQueue.length === 0) {
      window.dispatchEvent(new CustomEvent('resqnet:toast', {
        detail: {
          title: 'System Up-to-Date',
          message: 'All local records in IndexedDB are already synchronized with HQ.',
          type: 'info'
        }
      }));
      return;
    }

    this.isSyncing = true;
    console.log(`[ResQNet Sync] Starting synchronization of ${pendingQueue.length} queued items...`);

    window.dispatchEvent(new CustomEvent('resqnet:sync_start', {
      detail: { total: pendingQueue.length }
    }));

    // Process each queued mutation
    let processed = 0;
    for (const item of pendingQueue) {
      // Simulate network latency / transmission handshake (300ms per batch item)
      await new Promise(r => setTimeout(r, 350));

      if (item.entity === 'report' && item.data && item.data.id) {
        // Mark report as synced in reports store
        const report = await this.db.get('reports', item.data.id);
        if (report) {
          report.syncStatus = 'synced';
          report.syncedAt = new Date().toISOString();
          await this.db.put('reports', report);
        }
      }

      // Remove from sync queue
      await this.db.removeSyncQueueItem(item.queueId);
      processed++;

      window.dispatchEvent(new CustomEvent('resqnet:sync_progress', {
        detail: { current: processed, total: pendingQueue.length, currentItem: item }
      }));
    }

    await this.db.logAudit(
      'SYNC_SUCCESS',
      `Synchronized ${processed} offline records to Central Command HQ.`,
      'Sync Engine'
    );

    this.isSyncing = false;
    await this.updatePendingCount();

    window.dispatchEvent(new CustomEvent('resqnet:sync_complete', {
      detail: { syncedCount: processed }
    }));

    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'Synchronization Complete',
        message: `Successfully synchronized ${processed} offline action(s) to Central Command HQ.`,
        type: 'success'
      }
    }));

    // Notify other components to refresh their views
    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }
}

window.SyncEngine = SyncEngine;

