/**
 * ResQNet - Rescue Team Management Module
 */

class TeamsModule {
  constructor(db, syncEngine) {
    this.db = db;
    this.syncEngine = syncEngine;
    this.currentFilter = 'all';
    this.teams = [];
  }

  async init() {
    this.setupListeners();
    await this.loadAndRenderTeams();

    window.addEventListener('resqnet:data_changed', () => this.loadAndRenderTeams());
  }

  setupListeners() {
    const filterContainer = document.getElementById('teamsFilterTabs');
    if (filterContainer) {
      filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.filter) return;
        
        filterContainer.querySelectorAll('button').forEach(b => {
          b.classList.remove('bg-blue-600', 'text-white');
          b.classList.add('bg-slate-800', 'text-slate-300');
        });
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-300');

        this.currentFilter = btn.dataset.filter;
        this.renderTeamCards();
      });
    }
  }

  async loadAndRenderTeams() {
    this.teams = await this.db.getAll('teams');
    this.renderTeamCards();
  }

  renderTeamCards() {
    const container = document.getElementById('teamsCardsContainer');
    const countBadge = document.getElementById('teamsCountBadge');
    if (!container) return;

    let filtered = this.teams;
    if (this.currentFilter !== 'all') {
      filtered = this.teams.filter(t => t.availability.toLowerCase() === this.currentFilter.toLowerCase());
    }

    if (countBadge) {
      countBadge.innerText = `${filtered.length} of ${this.teams.length} Teams`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 text-slate-400">
          <p class="text-base font-medium">No rescue teams found matching filter: "${this.currentFilter}".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(team => {
      const isAvailable = team.availability === 'Available';
      const isDeployed = team.availability === 'Deployed';
      
      let badgeHtml = '';
      if (isAvailable) {
        badgeHtml = `<span class="badge-team-available"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Available</span>`;
      } else if (isDeployed) {
        badgeHtml = `<span class="badge-team-deployed"><span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span> Deployed</span>`;
      } else {
        badgeHtml = `<span class="badge-team-rest"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> On Rest</span>`;
      }

      return `
        <div class="resq-card resq-card-hover p-5 flex flex-col justify-between">
          <div>
            <!-- Header -->
            <div class="flex items-start justify-between gap-3 mb-3">
              <div>
                <span class="font-mono text-xs text-blue-400 font-bold">${team.id}</span>
                <h3 class="text-base font-bold text-white mt-0.5">${team.name}</h3>
                <p class="text-xs text-slate-400">${team.specialty || 'Emergency Response'}</p>
              </div>
              <div>${badgeHtml}</div>
            </div>

            <!-- Details Grid -->
            <div class="bg-slate-950/60 rounded-lg p-3 border border-slate-800 space-y-2 text-xs mb-4">
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Team Leader:</span>
                <span class="text-slate-200 font-semibold">${team.leader}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Active Members:</span>
                <span class="text-slate-200 font-bold">${team.members} Personnel</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Assigned Zone:</span>
                <span class="text-cyan-400 font-medium">${team.assignedZone}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">Operation Status:</span>
                <span class="text-amber-300 font-medium">${team.operationStatus}</span>
              </div>
              <div class="flex justify-between items-center pt-1 border-t border-slate-800/80">
                <span class="text-slate-400">Radio Frequency:</span>
                <span class="text-blue-300 font-mono">${team.radioFreq}</span>
              </div>
            </div>

            <!-- Current Assignment Note -->
            ${team.currentAssignment ? `
              <div class="text-xs text-slate-300 bg-blue-950/30 border border-blue-900/40 p-2.5 rounded-lg mb-4">
                <span class="font-semibold text-blue-300">Assignment:</span> ${team.currentAssignment}
              </div>
            ` : `
              <div class="text-xs text-slate-500 italic mb-4">No active incident assignment. Team standing by.</div>
            `}
          </div>

          <!-- Actions -->
          <div class="pt-3 border-t border-slate-800/80 flex items-center gap-2">
            <button onclick="window.resqApp.openTeamModal('${team.id}')" 
              class="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5">
              <span>⚙️</span> Update Status & Zone
            </button>
            <button onclick="window.resqApp.locateOnMap(${team.coords[0]}, ${team.coords[1]})" 
              title="Locate Team on Map"
              class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs border border-slate-700 transition-colors">
              🗺️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Update team availability and operation status
   */
  async updateTeam(teamId, availability, operationStatus, assignedZone, assignmentNote) {
    const team = await this.db.get('teams', teamId);
    if (!team) return;

    team.availability = availability;
    team.operationStatus = operationStatus;
    if (assignedZone) team.assignedZone = assignedZone;
    if (assignmentNote !== undefined) team.currentAssignment = assignmentNote;

    await this.db.put('teams', team);
    await this.syncEngine.trackMutation('UPDATE_TEAM', 'team', team);

    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'Team Updated',
        message: `${team.name} status updated to [${availability} - ${operationStatus}].`,
        type: 'success'
      }
    }));

    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }
}

window.TeamsModule = TeamsModule;

