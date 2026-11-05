/**
 * ResQNet - Resource & Inventory Management Module
 */

class ResourcesModule {
  constructor(db, syncEngine) {
    this.db = db;
    this.syncEngine = syncEngine;
    this.resources = [];
    this.currentCategory = 'all';
  }

  async init() {
    this.setupListeners();
    await this.loadAndRenderResources();

    window.addEventListener('resqnet:data_changed', () => this.loadAndRenderResources());
  }

  setupListeners() {
    const categoryFilter = document.getElementById('resourcesCategoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        this.currentCategory = e.target.value;
        this.renderResources();
      });
    }

    // Modal quick adjustment submit
    const adjustForm = document.getElementById('resourceAdjustForm');
    if (adjustForm) {
      adjustForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleAdjustSubmit(adjustForm);
      });
    }
  }

  async loadAndRenderResources() {
    this.resources = await this.db.getAll('resources');
    this.renderResources();
  }

  renderResources() {
    const grid = document.getElementById('resourcesGrid');
    const criticalAlertBox = document.getElementById('resourcesCriticalAlertBox');
    if (!grid) return;

    let filtered = this.resources;
    if (this.currentCategory !== 'all') {
      filtered = this.resources.filter(r => r.category === this.currentCategory);
    }

    // Check for critical shortage items
    const criticalItems = this.resources.filter(r => r.quantity <= r.threshold);
    if (criticalAlertBox) {
      if (criticalItems.length > 0) {
        criticalAlertBox.classList.remove('hidden');
        criticalAlertBox.innerHTML = `
          <div class="flex items-center gap-3 p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200">
            <span class="text-2xl">⚠️</span>
            <div class="flex-1">
              <h4 class="font-bold text-sm text-amber-300">Critical Stock Warning (${criticalItems.length} items below minimum safety threshold)</h4>
              <p class="text-xs text-amber-200/80 mt-0.5">
                ${criticalItems.map(c => `<strong>${c.name}</strong> (${c.quantity} ${c.unit} left, min ${c.threshold})`).join('; ')}. Immediate restock required.
              </p>
            </div>
            <button onclick="window.resqApp.openQuickRestockModal()" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap shadow-sm">
              Log Restock
            </button>
          </div>
        `;
      } else {
        criticalAlertBox.classList.add('hidden');
      }
    }

    grid.innerHTML = filtered.map(item => {
      const isCritical = item.quantity <= item.threshold;
      const percentOfTarget = Math.min(Math.round((item.quantity / (item.threshold * 2.5)) * 100), 100);

      let statusBadge = '';
      if (isCritical) {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-950 text-red-400 border border-red-500/40 animate-pulse">Critical Shortage</span>`;
      } else if (item.quantity <= item.threshold * 1.3) {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-500/40">Low Stock</span>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-500/40">Adequate</span>`;
      }

      return `
        <div class="resq-card resq-card-hover p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2 mb-2">
              <span class="text-xs font-mono text-slate-400 uppercase tracking-wider">${item.category}</span>
              ${statusBadge}
            </div>

            <h3 class="text-base font-bold text-white mb-1">${item.name}</h3>
            <p class="text-xs text-slate-400 mb-4 line-clamp-2">${item.description}</p>

            <!-- Quantity Display -->
            <div class="bg-slate-950/70 rounded-xl p-3.5 border border-slate-800 mb-4">
              <div class="flex items-baseline justify-between mb-1">
                <span class="text-2xl font-black ${isCritical ? 'text-red-400' : 'text-blue-400'}">
                  ${item.quantity.toLocaleString()}
                </span>
                <span class="text-xs text-slate-400 font-medium">${item.unit} available</span>
              </div>

              <!-- Visual stock bar -->
              <div class="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                <div class="h-2 rounded-full transition-all duration-300 ${isCritical ? 'bg-red-500' : percentOfTarget < 50 ? 'bg-amber-500' : 'bg-emerald-500'}" 
                     style="width: ${percentOfTarget}%"></div>
              </div>

              <div class="flex justify-between text-[11px] text-slate-400">
                <span>Min Reserve: <strong class="text-slate-300">${item.threshold}</strong></span>
                <span>Depot: <strong class="text-slate-300">${item.location}</strong></span>
              </div>
            </div>
          </div>

          <!-- Functional Adjustment Buttons -->
          <div class="space-y-2 pt-2 border-t border-slate-800">
            <div class="flex items-center gap-2">
              <button onclick="window.resqApp.quickAdjustResource('${item.id}', -50, 'Field Dispatch to Evacuees')" 
                class="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-red-300 rounded text-xs font-semibold border border-slate-700 transition-colors"
                title="Dispatch / Deduct 50 units">
                - 50
              </button>
              <button onclick="window.resqApp.quickAdjustResource('${item.id}', -10, 'Field Dispatch to Relief Center')" 
                class="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-red-300 rounded text-xs font-semibold border border-slate-700 transition-colors"
                title="Dispatch / Deduct 10 units">
                - 10
              </button>
              <button onclick="window.resqApp.quickAdjustResource('${item.id}', 10, 'Supply replenishment')" 
                class="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded text-xs font-semibold border border-slate-700 transition-colors"
                title="Add 10 units">
                + 10
              </button>
              <button onclick="window.resqApp.quickAdjustResource('${item.id}', 50, 'Supply replenishment')" 
                class="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded text-xs font-semibold border border-slate-700 transition-colors"
                title="Add 50 units">
                + 50
              </button>
            </div>

            <button onclick="window.resqApp.openResourceModal('${item.id}')" 
              class="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
              <span>📝</span> Custom Inventory Adjustment
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Adjust inventory quantity
   */
  async adjustQuantity(resourceId, delta, reason = 'Inventory adjustment') {
    const item = await this.db.get('resources', resourceId);
    if (!item) return;

    const oldQty = item.quantity;
    const newQty = Math.max(0, oldQty + delta);
    item.quantity = newQty;
    item.lastUpdated = new Date().toISOString();

    // Re-evaluate status
    if (newQty <= item.threshold) {
      item.status = 'Critical Shortage';
    } else if (newQty <= item.threshold * 1.3) {
      item.status = 'Low Stock';
    } else {
      item.status = 'Adequate';
    }

    await this.db.put('resources', item);
    await this.syncEngine.trackMutation('UPDATE_INVENTORY', 'resource', {
      id: item.id,
      quantity: newQty,
      delta,
      reason
    });

    await this.db.logAudit(
      'INVENTORY_ADJUST',
      `${item.name}: changed from ${oldQty} to ${newQty} ${item.unit} (${delta > 0 ? '+' : ''}${delta}). Reason: ${reason}`,
      'Logistics Officer'
    );

    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'Inventory Updated',
        message: `${item.name} updated: now ${newQty} ${item.unit}.`,
        type: newQty <= item.threshold ? 'warning' : 'success'
      }
    }));

    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }
}

window.ResourcesModule = ResourcesModule;

