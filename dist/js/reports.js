/**
 * ResQNet - Emergency Reporting Module & Reports Management
 */

class ReportsModule {
  constructor(db, syncEngine) {
    this.db = db;
    this.syncEngine = syncEngine;
    this.currentFilterSeverity = 'all';
    this.currentFilterStatus = 'all';
    this.currentFilterSync = 'all';
    this.searchQuery = '';
    this.allReports = [];
  }

  async init() {
    this.setupReportForm();
    this.setupTableFilters();
    await this.loadAndRenderReports();

    // Listen for data change events
    window.addEventListener('resqnet:data_changed', () => this.loadAndRenderReports());
  }

  /**
   * Setup Emergency Report Form submission & validation
   */
  setupReportForm() {
    const form = document.getElementById('emergencyReportForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleFormSubmit(form);
    });

    // Pick location buttons
    const btnMapPick = document.getElementById('btnPickLocationFromMap');
    if (btnMapPick) {
      btnMapPick.addEventListener('click', () => {
        window.resqApp.navigateTo('map');
        window.dispatchEvent(new CustomEvent('resqnet:toast', {
          detail: {
            title: 'Pick Location on Map',
            message: 'Click anywhere on the tactical map to capture GPS coordinates for your emergency report.',
            type: 'info'
          }
        }));
      });
    }

    const btnGPS = document.getElementById('btnUseCurrentGPS');
    if (btnGPS) {
      btnGPS.addEventListener('click', () => {
        if ('geolocation' in navigator) {
          btnGPS.disabled = true;
          btnGPS.innerText = 'Acquiring GPS...';

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const lat = pos.coords.latitude.toFixed(5);
              const lng = pos.coords.longitude.toFixed(5);
              const coordsInput = document.getElementById('reportCoords');
              if (coordsInput) coordsInput.value = `${lat}, ${lng}`;
              btnGPS.disabled = false;
              btnGPS.innerHTML = '📍 GPS Acquired';
              setTimeout(() => { btnGPS.innerHTML = '📍 Use My GPS'; }, 3000);
            },
            (err) => {
              btnGPS.disabled = false;
              btnGPS.innerHTML = '📍 Use My GPS';
              // Provide fallback to disaster district center coordinates
              const defaultCenter = window.SEED_DATA?.metadata?.defaultCenter || [16.5062, 80.6480];
              const jitterLat = (defaultCenter[0] + (Math.random() - 0.5) * 0.02).toFixed(5);
              const jitterLng = (defaultCenter[1] + (Math.random() - 0.5) * 0.02).toFixed(5);
              const coordsInput = document.getElementById('reportCoords');
              if (coordsInput) coordsInput.value = `${jitterLat}, ${jitterLng}`;

              window.dispatchEvent(new CustomEvent('resqnet:toast', {
                detail: {
                  title: 'GPS Fallback Applied',
                  message: 'Local hardware GPS offline or permission denied. Assigned tactical district coordinate grid.',
                  type: 'warning'
                }
              }));
            },
            { timeout: 5000 }
          );
        }
      });
    }
  }

  /**
   * Handle Report Form Submission
   */
  async handleFormSubmit(form) {
    const reporterName = form.reporterName.value.trim();
    const contact = form.contact?.value?.trim() || 'Field Radio';
    const category = form.category.value;
    const location = form.location.value.trim();
    const coordsStr = form.coords.value.trim();
    const severity = form.severity.value;
    const peopleAffected = parseInt(form.peopleAffected.value, 10);
    const description = form.description.value.trim();

    // Field Validation
    if (!reporterName) {
      this.showFormError('Please enter the reporter name or call-sign.');
      form.reporterName.focus();
      return;
    }
    if (!category) {
      this.showFormError('Please select an emergency category.');
      form.category.focus();
      return;
    }
    if (!location) {
      this.showFormError('Please specify the incident location or landmark.');
      form.location.focus();
      return;
    }
    if (isNaN(peopleAffected) || peopleAffected < 0) {
      this.showFormError('Please enter a valid number of affected people (0 or more).');
      form.peopleAffected.focus();
      return;
    }
    if (!description || description.length < 10) {
      this.showFormError('Please provide a detailed description (at least 10 characters).');
      form.description.focus();
      return;
    }

    // Parse coordinates or fallback
    let coords = [16.5062, 80.6480];
    if (coordsStr) {
      const parts = coordsStr.split(',').map(s => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        coords = [parts[0], parts[1]];
      }
    } else {
      // Jitter around center if omitted
      const defaultCenter = window.SEED_DATA?.metadata?.defaultCenter || [16.5062, 80.6480];
      coords = [
        parseFloat((defaultCenter[0] + (Math.random() - 0.5) * 0.03).toFixed(5)),
        parseFloat((defaultCenter[1] + (Math.random() - 0.5) * 0.03).toFixed(5))
      ];
    }

    // Special needs checkboxes
    const specialNeeds = [];
    form.querySelectorAll('input[name="specialNeeds"]:checked').forEach(cb => {
      specialNeeds.push(cb.value);
    });

    // Generate Unique Report ID (e.g. RQ-2026-XXXX)
    const reportId = this.generateReportId();
    const timestamp = new Date().toISOString();
    const isOnline = this.syncEngine.isOnline;
    const syncStatus = isOnline ? 'synced' : 'pending';

    const newReport = {
      id: reportId,
      timestamp,
      reporterName,
      contact,
      category,
      location,
      coords,
      severity,
      peopleAffected,
      description,
      specialNeeds,
      status: 'Pending',
      syncStatus,
      assignedTeamId: null,
      assignedTeamName: null,
      updatedAt: timestamp
    };

    // Store in IndexedDB
    await this.db.put('reports', newReport);

    // Track in Sync Engine (Offline Queue if offline)
    const syncResult = await this.syncEngine.trackMutation('CREATE_REPORT', 'report', newReport);

    // Reset Form
    form.reset();
    const coordsInput = document.getElementById('reportCoords');
    if (coordsInput) coordsInput.value = '';

    // Show Notification Toast
    if (syncResult.synced) {
      window.dispatchEvent(new CustomEvent('resqnet:toast', {
        detail: {
          title: `Report Submitted (${reportId})`,
          message: `Saved to local IndexedDB and synchronized with Central Command HQ.`,
          type: 'success'
        }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('resqnet:toast', {
        detail: {
          title: `Report Stored Offline (${reportId})`,
          message: `Saved to local IndexedDB. Marked as [Pending Synchronization] until network is available.`,
          type: 'warning'
        }
      }));
    }

    // Trigger data change
    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));

    // Highlight newly created report in the table
    this.highlightReport(reportId);
  }

  showFormError(message) {
    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'Validation Error',
        message: message,
        type: 'danger'
      }
    }));
  }

  generateReportId() {
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `RQ-${year}-${randomSuffix}`;
  }

  /**
   * Setup Table Filters and Search
   */
  setupTableFilters() {
    const searchInput = document.getElementById('reportsSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTableRows();
      });
    }

    const filterSeverity = document.getElementById('reportsFilterSeverity');
    if (filterSeverity) {
      filterSeverity.addEventListener('change', (e) => {
        this.currentFilterSeverity = e.target.value;
        this.renderTableRows();
      });
    }

    const filterStatus = document.getElementById('reportsFilterStatus');
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        this.currentFilterStatus = e.target.value;
        this.renderTableRows();
      });
    }

    const filterSync = document.getElementById('reportsFilterSync');
    if (filterSync) {
      filterSync.addEventListener('change', (e) => {
        this.currentFilterSync = e.target.value;
        this.renderTableRows();
      });
    }

    // Export buttons
    const exportJsonBtn = document.getElementById('btnExportReportsJson');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => this.exportReportsJSON());
    }

    const exportCsvBtn = document.getElementById('btnExportReportsCsv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.exportReportsCSV());
    }
  }

  async loadAndRenderReports() {
    this.allReports = await this.db.getAll('reports');
    // Sort descending by timestamp
    this.allReports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    this.renderTableRows();
  }

  renderTableRows() {
    const tbody = document.getElementById('reportsTableBody');
    const countBadge = document.getElementById('reportsTotalCount');
    if (!tbody) return;

    let filtered = this.allReports.filter(report => {
      // Search query
      if (this.searchQuery) {
        const q = this.searchQuery;
        const matchesId = report.id.toLowerCase().includes(q);
        const matchesCat = (report.category || '').toLowerCase().includes(q);
        const matchesLoc = (report.location || '').toLowerCase().includes(q);
        const matchesRep = (report.reporterName || '').toLowerCase().includes(q);
        const matchesDesc = (report.description || '').toLowerCase().includes(q);
        if (!matchesId && !matchesCat && !matchesLoc && !matchesRep && !matchesDesc) {
          return false;
        }
      }

      // Severity filter
      if (this.currentFilterSeverity !== 'all' && report.severity !== this.currentFilterSeverity) {
        return false;
      }

      // Status filter
      if (this.currentFilterStatus !== 'all' && report.status !== this.currentFilterStatus) {
        return false;
      }

      // Sync filter
      if (this.currentFilterSync !== 'all' && report.syncStatus !== this.currentFilterSync) {
        return false;
      }

      return true;
    });

    if (countBadge) {
      countBadge.innerText = `${filtered.length} of ${this.allReports.length} reports`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-slate-400">
            <div class="flex flex-col items-center justify-center">
              <span class="text-3xl mb-2">🔍</span>
              <p class="font-medium">No emergency reports match the active filters.</p>
              <button onclick="window.resqApp.resetReportFilters()" class="mt-2 text-xs text-blue-400 hover:underline">Reset Filters</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(report => {
      const timeAgo = this.formatTimeAgo(report.timestamp);
      
      // Severity badge class
      let sevBadge = 'badge-medium';
      if (report.severity === 'Critical') sevBadge = 'badge-critical';
      else if (report.severity === 'High') sevBadge = 'badge-high';
      else if (report.severity === 'Low') sevBadge = 'badge-low';

      // Status color
      let statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      if (report.status === 'Responding') statusColor = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      else if (report.status === 'Investigating') statusColor = 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      else if (report.status === 'Resolved') statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

      // Sync badge
      const isSynced = report.syncStatus === 'synced';
      const syncBadge = isSynced 
        ? `<span class="badge-sync-synced" title="Synchronized with Central HQ">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Synced
           </span>`
        : `<span class="badge-sync-pending animate-pulse" title="Saved locally in IndexedDB - Pending upload">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Pending Sync
           </span>`;

      return `
        <tr id="row-${report.id}" class="border-b border-slate-800/80 hover:bg-slate-800/40 transition-colors group">
          <td class="py-3 px-3 font-mono text-xs font-bold text-blue-400">
            <button onclick="window.resqApp.viewReportDetails('${report.id}')" class="hover:underline flex items-center gap-1">
              ${report.id}
            </button>
          </td>
          <td class="py-3 px-3">
            <span class="${sevBadge}">${report.severity}</span>
          </td>
          <td class="py-3 px-3">
            <div class="font-semibold text-slate-100 text-sm">${report.category}</div>
            <div class="text-xs text-slate-400 truncate max-w-[200px]" title="${report.description}">${report.description}</div>
          </td>
          <td class="py-3 px-3">
            <div class="text-xs text-slate-200 font-medium">${report.location}</div>
            <div class="text-[11px] text-slate-400">${report.reporterName}</div>
          </td>
          <td class="py-3 px-3 text-center">
            <span class="font-bold text-slate-100 text-sm ${report.peopleAffected > 50 ? 'text-red-400' : ''}">
              ${report.peopleAffected}
            </span>
          </td>
          <td class="py-3 px-3">
            <select onchange="window.resqApp.updateReportStatus('${report.id}', this.value)" 
              class="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 text-slate-200 cursor-pointer">
              <option value="Pending" ${report.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
              <option value="Investigating" ${report.status === 'Investigating' ? 'selected' : ''}>🔍 Investigating</option>
              <option value="Responding" ${report.status === 'Responding' ? 'selected' : ''}>🚒 Responding</option>
              <option value="Resolved" ${report.status === 'Resolved' ? 'selected' : ''}>✅ Resolved</option>
            </select>
          </td>
          <td class="py-3 px-3">
            ${syncBadge}
            <div class="text-[10px] text-slate-500 mt-0.5">${timeAgo}</div>
          </td>
          <td class="py-3 px-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button onclick="window.resqApp.locateOnMap(${report.coords[0]}, ${report.coords[1]})" 
                title="Locate on Tactical Map" 
                class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors">
                🗺️
              </button>
              <button onclick="window.resqApp.openDispatchModal('${report.id}')" 
                title="Assign Rescue Team" 
                class="p-1.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 transition-colors">
                🛡️
              </button>
              <button onclick="window.resqApp.viewReportDetails('${report.id}')" 
                title="View Full Report" 
                class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors">
                📄
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  highlightReport(reportId) {
    setTimeout(() => {
      const row = document.getElementById(`row-${reportId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('bg-blue-900/40', 'ring-2', 'ring-blue-500');
        setTimeout(() => {
          row.classList.remove('bg-blue-900/40', 'ring-2', 'ring-blue-500');
        }, 3000);
      }
    }, 200);
  }

  formatTimeAgo(isoString) {
    if (!isoString) return 'Just now';
    const diffMs = new Date() - new Date(isoString);
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${Math.floor(diffHour / 24)}d ago`;
  }

  /**
   * Export reports to JSON (Local Offline Backup)
   */
  async exportReportsJSON() {
    const reports = await this.db.getAll('reports');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reports, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ResQNet_Emergency_Reports_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'Export Complete',
        message: `Exported ${reports.length} reports to JSON for offline incident handover.`,
        type: 'info'
      }
    }));
  }

  /**
   * Export reports to CSV
   */
  async exportReportsCSV() {
    const reports = await this.db.getAll('reports');
    if (reports.length === 0) return;

    const headers = ["ID", "Timestamp", "Category", "Severity", "Status", "SyncStatus", "PeopleAffected", "Location", "Reporter", "Contact", "Latitude", "Longitude", "Description"];
    const rows = reports.map(r => [
      `"${r.id}"`,
      `"${r.timestamp}"`,
      `"${r.category}"`,
      `"${r.severity}"`,
      `"${r.status}"`,
      `"${r.syncStatus}"`,
      r.peopleAffected,
      `"${(r.location || '').replace(/"/g, '""')}"`,
      `"${(r.reporterName || '').replace(/"/g, '""')}"`,
      `"${(r.contact || '').replace(/"/g, '""')}"`,
      r.coords?.[0] || '',
      r.coords?.[1] || '',
      `"${(r.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ResQNet_Emergency_Reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'CSV Exported',
        message: `Exported ${reports.length} reports to CSV for spreadsheet analysis.`,
        type: 'info'
      }
    }));
  }
}

window.ReportsModule = ReportsModule;

