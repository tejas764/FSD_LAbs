/**
 * ResQNet - Main Tactical Dashboard Module
 * Analytics, Emergency Priority Distributions, KPI Cards, and Live Ticker
 */

class DashboardModule {
  constructor(db, syncEngine) {
    this.db = db;
    this.syncEngine = syncEngine;
  }

  async init() {
    await this.updateMetrics();
    window.addEventListener('resqnet:data_changed', () => this.updateMetrics());
  }

  async updateMetrics() {
    const [reports, teams, resources, shelters] = await Promise.all([
      this.db.getAll('reports'),
      this.db.getAll('teams'),
      this.db.getAll('resources'),
      this.db.getAll('shelters')
    ]);

    // 1. Calculate Active Emergencies
    const activeReports = reports.filter(r => r.status !== 'Resolved');
    const criticalCount = activeReports.filter(r => r.severity === 'Critical').length;
    const highCount = activeReports.filter(r => r.severity === 'High').length;
    const mediumCount = activeReports.filter(r => r.severity === 'Medium').length;
    const lowCount = activeReports.filter(r => r.severity === 'Low').length;

    // 2. Rescue Teams Statistics
    const availableTeams = teams.filter(t => t.availability === 'Available').length;
    const deployedTeams = teams.filter(t => t.availability === 'Deployed').length;
    const totalTeams = teams.length;

    // 3. Registered Volunteers / Responders
    const teamMembersTotal = teams.reduce((acc, t) => acc + (t.members || 0), 0);
    // Base field volunteers count + team members
    const totalFieldResponders = 120 + teamMembersTotal;

    // 4. Available Relief Supplies
    const totalSupplyQuantity = resources.reduce((acc, r) => acc + (r.quantity || 0), 0);
    const criticalResourceCount = resources.filter(r => r.quantity <= r.threshold).length;

    // Total People Affected
    const totalPeopleAffected = activeReports.reduce((acc, r) => acc + (r.peopleAffected || 0), 0);

    // Update KPI Card 1: Active Emergencies
    const elActiveEmergencies = document.getElementById('statActiveEmergencies');
    const elEmergenciesSubtext = document.getElementById('statEmergenciesSubtext');
    if (elActiveEmergencies) elActiveEmergencies.innerText = activeReports.length;
    if (elEmergenciesSubtext) {
      elEmergenciesSubtext.innerHTML = `
        <span class="text-red-400 font-bold">${criticalCount} Critical</span> • 
        <span class="text-orange-400 font-medium">${highCount} High</span> • 
        <span class="text-slate-400">${reports.length - activeReports.length} Resolved</span>
      `;
    }

    // Update KPI Card 2: Rescue Teams Available
    const elTeamsAvailable = document.getElementById('statTeamsAvailable');
    const elTeamsSubtext = document.getElementById('statTeamsSubtext');
    if (elTeamsAvailable) elTeamsAvailable.innerText = availableTeams;
    if (elTeamsSubtext) {
      elTeamsSubtext.innerHTML = `
        <span class="text-blue-400 font-semibold">${deployedTeams} Deployed</span> of ${totalTeams} Total Teams
      `;
    }

    // Update KPI Card 3: Registered Volunteers & Personnel
    const elVolunteers = document.getElementById('statVolunteers');
    const elVolunteersSubtext = document.getElementById('statVolunteersSubtext');
    if (elVolunteers) elVolunteers.innerText = totalFieldResponders.toLocaleString();
    if (elVolunteersSubtext) {
      elVolunteersSubtext.innerHTML = `
        <span class="text-emerald-400 font-medium">${teamMembersTotal} Special Forces</span> • 120 Field Vol.
      `;
    }

    // Update KPI Card 4: Available Relief Supplies
    const elSupplies = document.getElementById('statSupplies');
    const elSuppliesSubtext = document.getElementById('statSuppliesSubtext');
    if (elSupplies) elSupplies.innerText = totalSupplyQuantity.toLocaleString();
    if (elSuppliesSubtext) {
      elSuppliesSubtext.innerHTML = criticalResourceCount > 0 
        ? `<span class="text-amber-400 font-bold">⚠️ ${criticalResourceCount} Shortage Alerts</span>`
        : `<span class="text-emerald-400 font-medium">All Stocks Above Threshold</span>`;
    }

    // Update Priority Distribution Bars
    this.renderPriorityBars(activeReports.length, criticalCount, highCount, mediumCount, lowCount);

    // Update Recent Incident Activity Feed
    this.renderRecentActivity(reports.slice(0, 5));

    // Update People Affected Badge
    const elPeopleAffected = document.getElementById('dashboardTotalPeopleAffected');
    if (elPeopleAffected) {
      elPeopleAffected.innerText = `${totalPeopleAffected.toLocaleString()} citizens currently in active distress zone`;
    }
  }

  renderPriorityBars(total, critical, high, medium, low) {
    const elCriticalBar = document.getElementById('barCritical');
    const elHighBar = document.getElementById('barHigh');
    const elMediumBar = document.getElementById('barMedium');
    const elLowBar = document.getElementById('barLow');

    const elCritCount = document.getElementById('countCritical');
    const elHighCount = document.getElementById('countHigh');
    const elMedCount = document.getElementById('countMedium');
    const elLowCount = document.getElementById('countLow');

    if (elCritCount) elCritCount.innerText = critical;
    if (elHighCount) elHighCount.innerText = high;
    if (elMedCount) elMedCount.innerText = medium;
    if (elLowCount) elLowCount.innerText = low;

    if (total === 0) total = 1; // avoid division by zero
    if (elCriticalBar) elCriticalBar.style.width = `${(critical / total) * 100}%`;
    if (elHighBar) elHighBar.style.width = `${(high / total) * 100}%`;
    if (elMediumBar) elMediumBar.style.width = `${(medium / total) * 100}%`;
    if (elLowBar) elLowBar.style.width = `${(low / total) * 100}%`;
  }

  renderRecentActivity(reports) {
    const feed = document.getElementById('dashboardActivityFeed');
    if (!feed) return;

    if (reports.length === 0) {
      feed.innerHTML = `<div class="p-4 text-center text-slate-500 text-sm">No activity recorded yet.</div>`;
      return;
    }

    feed.innerHTML = reports.map(r => {
      let dotColor = 'bg-red-500';
      if (r.severity === 'High') dotColor = 'bg-orange-500';
      else if (r.severity === 'Medium') dotColor = 'bg-amber-500';
      else if (r.severity === 'Low') dotColor = 'bg-emerald-500';

      return `
        <div class="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/40 transition-colors cursor-pointer border border-transparent hover:border-slate-800" 
             onclick="window.resqApp.viewReportDetails('${r.id}')">
          <div class="mt-1 w-2.5 h-2.5 rounded-full ${dotColor} shrink-0"></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-mono font-bold text-blue-400">${r.id}</span>
              <span class="text-[10px] text-slate-400">${this.formatTimestamp(r.timestamp)}</span>
            </div>
            <div class="text-sm font-semibold text-slate-100 truncate">${r.category} – ${r.location}</div>
            <p class="text-xs text-slate-400 truncate mt-0.5">${r.description}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  formatTimestamp(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

window.DashboardModule = DashboardModule;

