/**
 * ResQNet - Main Application Orchestrator
 */

class ResQNetApp {
  constructor() {
    this.db = null;
    this.syncEngine = null;
    this.map = null;
    this.reportsModule = null;
    this.teamsModule = null;
    this.resourcesModule = null;
    this.sheltersModule = null;
    this.dashboardModule = null;
    this.currentView = 'home';
    this.currentUserRole = 'Incident Commander';
  }

  async init() {
    console.log('[ResQNet] Starting Application Engine...');

    // 1. Register Service Worker
    this.registerServiceWorker();

    // 2. Initialize Database
    this.db = await ResQNetDB.getInstance();

    // 3. Initialize Synchronization Engine
    this.syncEngine = new SyncEngine(this.db);

    // 4. Initialize Modules
    this.dashboardModule = new DashboardModule(this.db, this.syncEngine);
    this.reportsModule = new ReportsModule(this.db, this.syncEngine);
    this.teamsModule = new TeamsModule(this.db, this.syncEngine);
    this.resourcesModule = new ResourcesModule(this.db, this.syncEngine);
    this.sheltersModule = new SheltersModule(this.db, this.syncEngine);
    this.map = new DisasterMap('disasterMapContainer', this.db, this.syncEngine);

    // 5. Setup Navigation, Roles, Modals, and Global Listeners
    this.setupNavigation();
    this.setupHeaderControls();
    this.setupToasts();
    this.setupModals();

    // 6. Init modules
    await Promise.all([
      this.dashboardModule.init(),
      this.reportsModule.init(),
      this.teamsModule.init(),
      this.resourcesModule.init(),
      this.sheltersModule.init(),
      this.map.init()
    ]);

    // Handle initial route
    this.handleRouting();

    console.log('[ResQNet] All systems operational. Offline-first readiness: 100%');
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(registration => {
            console.log('[ResQNet SW] ServiceWorker successfully registered with scope:', registration.scope);
          })
          .catch(error => {
            console.warn('[ResQNet SW] ServiceWorker registration failed:', error);
          });
      });
    }
  }

  setupNavigation() {
    // Navigation link clicks
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = el.getAttribute('data-nav');
        this.navigateTo(targetView);
      });
    });

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileNavMenu');
    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
      });
    }

    // Hash change routing
    window.addEventListener('hashchange', () => this.handleRouting());
  }

  handleRouting() {
    let hash = window.location.hash.replace('#', '').trim();
    if (!hash) hash = 'home';
    this.navigateTo(hash, false);
  }

  navigateTo(viewId, updateHash = true) {
    const validViews = ['home', 'dashboard', 'map', 'reports', 'teams', 'resources', 'shelters', 'about'];
    if (!validViews.includes(viewId)) viewId = 'home';

    this.currentView = viewId;

    // Update nav active classes
    document.querySelectorAll('[data-nav]').forEach(el => {
      if (el.getAttribute('data-nav') === viewId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Switch view sections
    validViews.forEach(v => {
      const section = document.getElementById(`view-${v}`);
      if (section) {
        if (v === viewId) {
          section.classList.remove('hidden');
        } else {
          section.classList.add('hidden');
        }
      }
    });

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobileNavMenu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('hidden');
    }

    // If map view is activated, invalidate Leaflet size
    if (viewId === 'map' && this.map && this.map.map) {
      setTimeout(() => {
        this.map.map.invalidateSize();
      }, 100);
    }

    // Update URL hash without jumping
    if (updateHash && window.location.hash !== `#${viewId}`) {
      history.pushState(null, null, `#${viewId}`);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setupHeaderControls() {
    // Simulated Offline Mode Toggle
    const offlineToggle = document.getElementById('simulateOfflineToggle');
    if (offlineToggle) {
      offlineToggle.addEventListener('change', (e) => {
        const isOffline = e.target.checked;
        this.syncEngine.setSimulatedOffline(isOffline);
        this.updateConnectionBadge(this.syncEngine.isOnline, isOffline);
      });
    }

    // Role switcher dropdown
    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) {
      roleSelect.addEventListener('change', (e) => {
        this.currentUserRole = e.target.value;
        const roleBadge = document.getElementById('headerUserRoleBadge');
        if (roleBadge) roleBadge.innerText = this.currentUserRole;
        this.showToast('Role Switched', `Active operational profile set to: ${this.currentUserRole}`, 'info');
      });
    }

    // Header Sync Queue Badge click -> open Sync Queue modal
    const syncBadgeBtn = document.getElementById('headerSyncQueueBtn');
    if (syncBadgeBtn) {
      syncBadgeBtn.addEventListener('click', () => {
        this.openSyncModal();
      });
    }

    // Manual Sync Button
    const btnSyncNow = document.getElementById('btnSyncNow');
    if (btnSyncNow) {
      btnSyncNow.addEventListener('click', () => {
        this.syncEngine.syncPendingData();
      });
    }

    // Reset Data Button
    const btnResetData = document.getElementById('btnResetData');
    if (btnResetData) {
      btnResetData.addEventListener('click', async () => {
        if (confirm('Reset ResQNet local database back to default disaster scenario seed dataset?')) {
          await this.db.resetToDefaultSeed();
          window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
          this.showToast('Database Reset', 'Reset to initial Coastal Flood & Cyclone scenario dataset.', 'info');
        }
      });
    }

    // Subscribe to Sync Engine connectivity updates
    this.syncEngine.subscribe(({ isOnline, isSimulated, pendingCount }) => {
      this.updateConnectionBadge(isOnline, isSimulated);
      this.updateSyncQueueBadge(pendingCount);
    });
  }

  updateConnectionBadge(isOnline, isSimulated) {
    const badge = document.getElementById('connectionStatusBadge');
    const offlineAlertBanner = document.getElementById('offlineAlertBanner');

    if (badge) {
      if (isOnline) {
        badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20';
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> <span>ONLINE</span>`;
      } else {
        const text = isSimulated ? 'OFFLINE (Simulated)' : 'OFFLINE (Disconnected)';
        badge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-950/90 text-red-300 border border-red-500/50 shadow-sm shadow-red-500/20 animate-pulse';
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> <span>${text}</span>`;
      }
    }

    if (offlineAlertBanner) {
      if (isOnline) {
        offlineAlertBanner.classList.add('hidden');
      } else {
        offlineAlertBanner.classList.remove('hidden');
      }
    }
  }

  updateSyncQueueBadge(pendingCount) {
    const badge = document.getElementById('headerSyncQueueCount');
    const container = document.getElementById('headerSyncQueueBtn');

    if (badge) badge.innerText = pendingCount;
    if (container) {
      if (pendingCount > 0) {
        container.classList.remove('opacity-60');
        container.classList.add('bg-amber-950/80', 'border-amber-500/50', 'text-amber-300');
      } else {
        container.classList.add('opacity-60');
        container.classList.remove('bg-amber-950/80', 'border-amber-500/50', 'text-amber-300');
      }
    }
  }

  setupToasts() {
    window.addEventListener('resqnet:toast', (e) => {
      if (e.detail) {
        this.showToast(e.detail.title, e.detail.message, e.detail.type);
      }
    });
  }

  showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl shadow-2xl border flex items-start gap-3 transform transition-all duration-300 translate-y-2 opacity-0 text-xs backdrop-blur-md max-w-sm w-full pointer-events-auto`;

    let icon = 'ℹ️';
    let borderColor = 'border-blue-500/50 bg-slate-900/95 text-slate-100 shadow-blue-900/20';

    if (type === 'success') {
      icon = '✅';
      borderColor = 'border-emerald-500/50 bg-slate-900/95 text-emerald-100 shadow-emerald-950/30';
    } else if (type === 'warning') {
      icon = '⚠️';
      borderColor = 'border-amber-500/50 bg-slate-900/95 text-amber-100 shadow-amber-950/30';
    } else if (type === 'danger') {
      icon = '🚨';
      borderColor = 'border-red-500/50 bg-slate-900/95 text-red-100 shadow-red-950/30';
    }

    toast.className += ` ${borderColor}`;
    toast.innerHTML = `
      <span class="text-base shrink-0">${icon}</span>
      <div class="flex-1 min-w-0">
        <h5 class="font-bold text-sm text-white mb-0.5">${title}</h5>
        <p class="text-slate-300 leading-relaxed">${message}</p>
      </div>
      <button class="text-slate-400 hover:text-white text-base ml-1" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    // Auto dismiss after 4.5s
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  setupModals() {
    // Backdrop click to close any active modal
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('hidden');
  }

  /**
   * View Full Report Details Modal
   */
  async viewReportDetails(reportId) {
    const report = await this.db.get('reports', reportId);
    if (!report) return;

    const modal = document.getElementById('reportDetailsModal');
    const content = document.getElementById('reportDetailsContent');
    if (!modal || !content) return;

    let sevBadge = 'badge-medium';
    if (report.severity === 'Critical') sevBadge = 'badge-critical';
    else if (report.severity === 'High') sevBadge = 'badge-high';
    else if (report.severity === 'Low') sevBadge = 'badge-low';

    content.innerHTML = `
      <div class="space-y-4">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span class="font-mono text-sm font-bold text-blue-400">${report.id}</span>
            <h3 class="text-lg font-bold text-white mt-0.5">${report.category}</h3>
          </div>
          <span class="${sevBadge}">${report.severity} Priority</span>
        </div>

        <!-- Description -->
        <div>
          <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Incident Description</h4>
          <p class="text-sm text-slate-200 bg-slate-950/60 p-3 rounded-lg border border-slate-800 leading-relaxed">
            ${report.description}
          </p>
        </div>

        <!-- Key Metrics -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div class="bg-slate-950/40 p-2.5 rounded border border-slate-800">
            <span class="text-slate-400 block mb-0.5">Affected People</span>
            <span class="text-base font-bold text-white">${report.peopleAffected}</span>
          </div>
          <div class="bg-slate-950/40 p-2.5 rounded border border-slate-800">
            <span class="text-slate-400 block mb-0.5">Status</span>
            <span class="text-sm font-semibold text-blue-300">${report.status}</span>
          </div>
          <div class="bg-slate-950/40 p-2.5 rounded border border-slate-800">
            <span class="text-slate-400 block mb-0.5">Sync State</span>
            <span class="text-sm font-semibold ${report.syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-400'}">
              ${report.syncStatus === 'synced' ? '✓ Synced with HQ' : '⏳ Pending Sync'}
            </span>
          </div>
        </div>

        <!-- Location & Contact -->
        <div class="space-y-2 text-xs">
          <div class="flex justify-between py-1 border-b border-slate-800/80">
            <span class="text-slate-400">Location Landmark:</span>
            <span class="text-slate-200 font-medium">${report.location}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/80">
            <span class="text-slate-400">GPS Coordinates:</span>
            <span class="text-cyan-400 font-mono">${report.coords?.join(', ') || 'N/A'}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/80">
            <span class="text-slate-400">Reporter Call-sign:</span>
            <span class="text-slate-200">${report.reporterName}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/80">
            <span class="text-slate-400">Radio / Contact:</span>
            <span class="text-blue-300 font-mono">${report.contact}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-slate-800/80">
            <span class="text-slate-400">Assigned Rescue Team:</span>
            <span class="text-white font-semibold">${report.assignedTeamName || 'Unassigned (Standing By)'}</span>
          </div>
        </div>

        ${report.specialNeeds && report.specialNeeds.length > 0 ? `
          <div>
            <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Specialized Emergency Needs</h4>
            <div class="flex flex-wrap gap-1.5">
              ${report.specialNeeds.map(n => `<span class="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-500/30 rounded text-xs">${n}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Actions -->
        <div class="flex gap-2 pt-3 border-t border-slate-800">
          <button onclick="window.resqApp.openDispatchModal('${report.id}'); window.resqApp.closeModal('reportDetailsModal');" 
            class="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors">
            🛡️ Assign / Dispatch Rescue Unit
          </button>
          <button onclick="window.resqApp.locateOnMap(${report.coords[0]}, ${report.coords[1]}); window.resqApp.closeModal('reportDetailsModal');" 
            class="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors">
            🗺️ Locate on Map
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  /**
   * Dispatch Team to Report Modal
   */
  async openDispatchModal(reportId) {
    const [report, teams] = await Promise.all([
      this.db.get('reports', reportId),
      this.db.getAll('teams')
    ]);
    if (!report) return;

    const modal = document.getElementById('dispatchModal');
    const content = document.getElementById('dispatchModalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <form id="dispatchForm" onsubmit="window.resqApp.handleDispatchSubmit(event, '${report.id}')" class="space-y-4">
        <div>
          <span class="text-xs font-mono text-blue-400 font-bold">${report.id}</span>
          <h3 class="text-base font-bold text-white">${report.category} at ${report.location}</h3>
          <p class="text-xs text-slate-400 mt-1">${report.peopleAffected} people in distress • Priority: <span class="text-red-400 font-bold">${report.severity}</span></p>
        </div>

        <div>
          <label class="form-label">Select Response Team to Task</label>
          <select name="selectedTeamId" class="form-input text-xs" required>
            ${teams.map(t => `
              <option value="${t.id}" ${t.id === report.assignedTeamId ? 'selected' : ''}>
                ${t.name} (${t.availability} - ${t.members} members) [${t.specialty}]
              </option>
            `).join('')}
          </select>
        </div>

        <div>
          <label class="form-label">Incident Operational Orders / Instructions</label>
          <textarea name="orders" rows="3" class="form-input text-xs" placeholder="e.g. Deploy 2 inflatable boats for rooftop extraction of elderly and children. Establish triage post at North Haven landing.">${report.description}</textarea>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="window.resqApp.closeModal('dispatchModal')" class="btn-secondary text-xs">Cancel</button>
          <button type="submit" class="btn-primary text-xs">Confirm Dispatch & Deploy Unit</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
  }

  async handleDispatchSubmit(event, reportId) {
    event.preventDefault();
    const form = event.target;
    const teamId = form.selectedTeamId.value;
    const orders = form.orders.value;

    const [report, team] = await Promise.all([
      this.db.get('reports', reportId),
      this.db.get('teams', teamId)
    ]);

    if (!report || !team) return;

    // Update report
    report.assignedTeamId = team.id;
    report.assignedTeamName = team.name;
    report.status = 'Responding';
    report.updatedAt = new Date().toISOString();
    await this.db.put('reports', report);

    // Update team
    team.availability = 'Deployed';
    team.assignedZone = report.location;
    team.currentAssignment = `Deployed to ${report.id} (${report.category}) - ${orders.slice(0, 70)}...`;
    team.coords = report.coords;
    await this.db.put('teams', team);

    await this.syncEngine.trackMutation('DISPATCH_TEAM', 'dispatch', {
      reportId: report.id,
      teamId: team.id,
      orders
    });

    this.closeModal('dispatchModal');

    this.showToast('Rescue Unit Dispatched', `${team.name} assigned and en-route to ${report.id}.`, 'success');
    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }

  /**
   * Edit Team Status Modal
   */
  async openTeamModal(teamId) {
    const team = await this.db.get('teams', teamId);
    if (!team) return;

    const modal = document.getElementById('teamModal');
    const content = document.getElementById('teamModalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <form id="editTeamForm" onsubmit="window.resqApp.handleTeamUpdateSubmit(event, '${team.id}')" class="space-y-4">
        <div>
          <span class="text-xs font-mono text-blue-400 font-bold">${team.id}</span>
          <h3 class="text-base font-bold text-white">${team.name}</h3>
          <p class="text-xs text-slate-400">Leader: ${team.leader} • Radio: ${team.radioFreq}</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="form-label">Availability Status</label>
            <select name="availability" class="form-input text-xs" required>
              <option value="Available" ${team.availability === 'Available' ? 'selected' : ''}>🟢 Available (Standby)</option>
              <option value="Deployed" ${team.availability === 'Deployed' ? 'selected' : ''}>🔵 Deployed (Active)</option>
              <option value="On Rest" ${team.availability === 'On Rest' ? 'selected' : ''}>⚪ On Rest (Regrouping)</option>
            </select>
          </div>
          <div>
            <label class="form-label">Operation Status</label>
            <input type="text" name="operationStatus" class="form-input text-xs" value="${team.operationStatus}" required>
          </div>
        </div>

        <div>
          <label class="form-label">Assigned Sector / Zone</label>
          <input type="text" name="assignedZone" class="form-input text-xs" value="${team.assignedZone}" required>
        </div>

        <div>
          <label class="form-label">Current Task / Assignment Notes</label>
          <textarea name="assignmentNote" rows="2" class="form-input text-xs">${team.currentAssignment || ''}</textarea>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="window.resqApp.closeModal('teamModal')" class="btn-secondary text-xs">Cancel</button>
          <button type="submit" class="btn-primary text-xs">Save Team Status</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
  }

  async handleTeamUpdateSubmit(event, teamId) {
    event.preventDefault();
    const form = event.target;
    const availability = form.availability.value;
    const operationStatus = form.operationStatus.value.trim();
    const assignedZone = form.assignedZone.value.trim();
    const assignmentNote = form.assignmentNote.value.trim();

    await this.teamsModule.updateTeam(teamId, availability, operationStatus, assignedZone, assignmentNote);
    this.closeModal('teamModal');
  }

  /**
   * Edit Resource Modal
   */
  async openResourceModal(resourceId) {
    const item = await this.db.get('resources', resourceId);
    if (!item) return;

    const modal = document.getElementById('resourceModal');
    const content = document.getElementById('resourceModalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <form id="editResourceForm" onsubmit="window.resqApp.handleResourceUpdateSubmit(event, '${item.id}')" class="space-y-4">
        <div>
          <span class="text-xs font-mono text-blue-400 font-bold">${item.id}</span>
          <h3 class="text-base font-bold text-white">${item.name}</h3>
          <p class="text-xs text-slate-400">${item.category} • Depot: ${item.location}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Current Quantity (${item.unit})</label>
            <input type="number" name="quantity" min="0" class="form-input text-sm font-bold text-blue-400" value="${item.quantity}" required>
          </div>
          <div>
            <label class="form-label">Min Safety Threshold</label>
            <input type="number" name="threshold" min="0" class="form-input text-sm" value="${item.threshold}" required>
          </div>
        </div>

        <div>
          <label class="form-label">Reason for Stock Adjustment</label>
          <input type="text" name="reason" class="form-input text-xs" placeholder="e.g. Incoming emergency relief convoy or field distribution" required>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="window.resqApp.closeModal('resourceModal')" class="btn-secondary text-xs">Cancel</button>
          <button type="submit" class="btn-primary text-xs">Save Inventory</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
  }

  async handleResourceUpdateSubmit(event, resourceId) {
    event.preventDefault();
    const form = event.target;
    const newQty = parseInt(form.quantity.value, 10);
    const newThreshold = parseInt(form.threshold.value, 10);
    const reason = form.reason.value.trim();

    const item = await this.db.get('resources', resourceId);
    if (!item) return;

    const diff = newQty - item.quantity;
    item.quantity = newQty;
    item.threshold = newThreshold;
    item.lastUpdated = new Date().toISOString();

    if (newQty <= newThreshold) item.status = 'Critical Shortage';
    else if (newQty <= newThreshold * 1.3) item.status = 'Low Stock';
    else item.status = 'Adequate';

    await this.db.put('resources', item);
    await this.syncEngine.trackMutation('UPDATE_INVENTORY', 'resource', { id: item.id, quantity: newQty, diff, reason });
    await this.db.logAudit('INVENTORY_ADJUST', `${item.name}: set to ${newQty} ${item.unit}. Reason: ${reason}`, 'Logistics Officer');

    this.closeModal('resourceModal');
    this.showToast('Inventory Updated', `${item.name} set to ${newQty} ${item.unit}.`, 'success');
    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }

  async quickAdjustResource(resourceId, delta, reason) {
    await this.resourcesModule.adjustQuantity(resourceId, delta, reason);
  }

  openQuickRestockModal() {
    this.navigateTo('resources');
  }

  /**
   * Shelter Capacity Modal
   */
  async openShelterModal(shelterId) {
    const shelter = await this.db.get('shelters', shelterId);
    if (!shelter) return;

    const modal = document.getElementById('shelterModal');
    const content = document.getElementById('shelterModalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <form id="editShelterForm" onsubmit="window.resqApp.handleShelterUpdateSubmit(event, '${shelter.id}')" class="space-y-4">
        <div>
          <span class="text-xs font-mono text-emerald-400 font-bold">${shelter.id}</span>
          <h3 class="text-base font-bold text-white">${shelter.name}</h3>
          <p class="text-xs text-slate-400">${shelter.type} • Max Capacity: ${shelter.capacity}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Current Occupancy</label>
            <input type="number" name="occupancy" min="0" max="${shelter.capacity * 2}" class="form-input text-sm font-bold" value="${shelter.occupancy}" required>
          </div>
          <div>
            <label class="form-label">Total Rated Capacity</label>
            <input type="number" name="capacity" min="1" class="form-input text-sm" value="${shelter.capacity}" required>
          </div>
        </div>

        <div>
          <label class="form-label">Field Notes / Resource Needs</label>
          <textarea name="notes" rows="2" class="form-input text-xs">${shelter.notes || ''}</textarea>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="window.resqApp.closeModal('shelterModal')" class="btn-secondary text-xs">Cancel</button>
          <button type="submit" class="btn-primary text-xs">Update Facility</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');
  }

  async handleShelterUpdateSubmit(event, shelterId) {
    event.preventDefault();
    const form = event.target;
    const occupancy = parseInt(form.occupancy.value, 10);
    const capacity = parseInt(form.capacity.value, 10);
    const notes = form.notes.value.trim();

    const shelter = await this.db.get('shelters', shelterId);
    if (!shelter) return;

    shelter.occupancy = occupancy;
    shelter.capacity = capacity;
    shelter.notes = notes;

    if (occupancy >= capacity) shelter.status = 'Full - Divert Evacuees';
    else if (occupancy >= capacity * 0.8) shelter.status = 'Near Capacity';
    else shelter.status = 'Operating';

    await this.db.put('shelters', shelter);
    await this.syncEngine.trackMutation('UPDATE_SHELTER', 'shelter', shelter);

    this.closeModal('shelterModal');
    this.showToast('Facility Updated', `${shelter.name} occupancy updated to ${occupancy}/${capacity}.`, 'success');
    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }

  /**
   * Sync Queue Inspector Modal
   */
  async openSyncModal() {
    const queue = await this.db.getPendingSync();
    const modal = document.getElementById('syncQueueModal');
    const content = document.getElementById('syncQueueModalContent');
    if (!modal || !content) return;

    const isOnline = this.syncEngine.isOnline;

    content.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 class="text-base font-bold text-white">Offline Synchronization Queue</h3>
            <p class="text-xs text-slate-400 mt-0.5">Local mutations buffered in IndexedDB waiting to upload to Central HQ</p>
          </div>
          <div>
            ${isOnline ? '<span class="badge-sync-synced">🟢 Network Ready</span>' : '<span class="badge-sync-pending">🔴 Offline</span>'}
          </div>
        </div>

        <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
          ${queue.length === 0 ? `
            <div class="p-6 text-center text-slate-400">
              <span class="text-3xl block mb-2">🎉</span>
              <p class="font-medium text-sm">No pending changes in offline queue.</p>
              <p class="text-xs text-slate-500 mt-1">All local emergency reports, team deployments, and inventory edits are fully synchronized with Central Command.</p>
            </div>
          ` : queue.map(item => `
            <div class="bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs flex items-center justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono font-bold text-blue-400">#${item.queueId}</span>
                  <span class="font-bold text-white uppercase text-[11px]">${item.action}</span>
                  <span class="text-slate-400">(${item.entity})</span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5">
                  Logged: ${new Date(item.createdAt).toLocaleTimeString()} • ${item.data?.id || item.data?.name || 'Local mutation'}
                </div>
              </div>
              <span class="badge-sync-pending">Queued</span>
            </div>
          `).join('')}
        </div>

        <div class="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button onclick="window.resqApp.clearSyncQueue()" class="text-xs text-red-400 hover:underline">
            Clear Queue
          </button>
          <div class="flex gap-2">
            <button onclick="window.resqApp.closeModal('syncQueueModal')" class="btn-secondary text-xs">Close</button>
            <button onclick="window.resqApp.syncEngine.syncPendingData(); window.resqApp.closeModal('syncQueueModal');" 
              class="btn-primary text-xs ${!isOnline || queue.length === 0 ? 'opacity-50 pointer-events-none' : ''}">
              🚀 Synchronize Now (${queue.length})
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  async clearSyncQueue() {
    if (confirm('Clear the local sync queue? Any unsynced changes will remain only on this local device.')) {
      await this.db.clearSyncQueue();
      await this.syncEngine.updatePendingCount();
      this.closeModal('syncQueueModal');
      this.showToast('Queue Cleared', 'Offline sync queue has been cleared.', 'info');
    }
  }

  /**
   * Map helper: pan and navigate to map
   */
  locateOnMap(lat, lng) {
    this.navigateTo('map');
    if (this.map) {
      this.map.panTo(lat, lng, 16);
    }
  }

  /**
   * Pre-fill report location from map click
   */
  fillReportLocation(lat, lng) {
    this.navigateTo('reports');
    const input = document.getElementById('reportCoords');
    const locInput = document.getElementById('reportLocation');
    if (input) input.value = `${lat}, ${lng}`;
    if (locInput && !locInput.value) locInput.value = `Grid Coordinates [${lat}, ${lng}]`;
    this.showToast('Coordinates Added', `Attached [${lat}, ${lng}] to emergency report form.`, 'info');
  }

  /**
   * Update report status directly
   */
  async updateReportStatus(reportId, newStatus) {
    const report = await this.db.get('reports', reportId);
    if (!report) return;

    report.status = newStatus;
    report.updatedAt = new Date().toISOString();
    await this.db.put('reports', report);

    await this.syncEngine.trackMutation('UPDATE_REPORT_STATUS', 'report', { id: report.id, status: newStatus });
    this.showToast('Status Updated', `Report ${report.id} set to ${newStatus}.`, 'info');
    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }

  resetReportFilters() {
    const search = document.getElementById('reportsSearchInput');
    const sev = document.getElementById('reportsFilterSeverity');
    const stat = document.getElementById('reportsFilterStatus');
    const sync = document.getElementById('reportsFilterSync');
    if (search) search.value = '';
    if (sev) sev.value = 'all';
    if (stat) stat.value = 'all';
    if (sync) sync.value = 'all';

    if (this.reportsModule) {
      this.reportsModule.searchQuery = '';
      this.reportsModule.currentFilterSeverity = 'all';
      this.reportsModule.currentFilterStatus = 'all';
      this.reportsModule.currentFilterSync = 'all';
      this.reportsModule.renderTableRows();
    }
  }
}

// Instantiate and expose globally
window.resqApp = new ResQNetApp();

// Boot application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.resqApp.init();
});

