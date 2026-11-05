/**
 * ResQNet - Shelters & Hospitals Management Module
 */

class SheltersModule {
  constructor(db, syncEngine) {
    this.db = db;
    this.syncEngine = syncEngine;
    this.shelters = [];
    this.filterType = 'all';
  }

  async init() {
    this.setupListeners();
    await this.loadAndRender();

    window.addEventListener('resqnet:data_changed', () => this.loadAndRender());
  }

  setupListeners() {
    const filterSelect = document.getElementById('sheltersTypeFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.filterType = e.target.value;
        this.renderCards();
      });
    }
  }

  async loadAndRender() {
    this.shelters = await this.db.getAll('shelters');
    this.renderCards();
  }

  renderCards() {
    const container = document.getElementById('sheltersGridContainer');
    if (!container) return;

    let filtered = this.shelters;
    if (this.filterType !== 'all') {
      filtered = this.shelters.filter(s => s.type === this.filterType);
    }

    container.innerHTML = filtered.map(shelter => {
      const isHospital = shelter.type === 'Hospital';
      const isCommand = shelter.type === 'Rescue Centre';
      const percentOccupied = Math.round((shelter.occupancy / shelter.capacity) * 100);

      let typeBadge = '';
      if (isHospital) {
        typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-300 border border-cyan-500/30">🏥 Hospital</span>`;
      } else if (isCommand) {
        typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-500/30">📡 Command Hub</span>`;
      } else {
        typeBadge = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-500/30">⛺ Evac Shelter</span>`;
      }

      return `
        <div class="resq-card resq-card-hover p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2 mb-2">
              <span class="text-xs font-mono text-slate-400 font-bold">${shelter.id}</span>
              ${typeBadge}
            </div>

            <h3 class="text-base font-bold text-white mb-0.5">${shelter.name}</h3>
            <p class="text-xs text-slate-400 mb-3">${shelter.location}</p>

            <!-- Occupancy bar -->
            <div class="bg-slate-950/60 p-3 rounded-lg border border-slate-800 mb-3 space-y-2">
              <div class="flex justify-between items-baseline text-xs">
                <span class="text-slate-400">${isHospital ? 'Patient Bed Occupancy:' : 'Evacuee Occupancy:'}</span>
                <span class="font-bold text-white">${shelter.occupancy} / ${shelter.capacity} <span class="text-slate-400">(${percentOccupied}%)</span></span>
              </div>
              <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div class="${percentOccupied >= 90 ? 'bg-red-500' : percentOccupied >= 70 ? 'bg-amber-500' : 'bg-emerald-500'} h-2 rounded-full" 
                     style="width: ${Math.min(percentOccupied, 100)}%"></div>
              </div>

              ${isHospital ? `
                <div class="flex justify-between text-xs pt-1 border-t border-slate-800">
                  <span class="text-slate-400">ICU Ventilator Beds:</span>
                  <span class="font-bold ${shelter.icuBedsAvailable <= 4 ? 'text-red-400' : 'text-emerald-400'}">
                    ${shelter.icuBedsAvailable} available (of ${shelter.icuBedsTotal})
                  </span>
                </div>
              ` : ''}
            </div>

            <!-- Operational vitals -->
            <div class="space-y-1.5 text-xs text-slate-300 mb-4 bg-slate-900/40 p-2.5 rounded border border-slate-800/80">
              <div class="flex justify-between">
                <span class="text-slate-400">Power Source:</span>
                <span class="text-slate-200">${shelter.powerSource}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Water Supply:</span>
                <span class="text-slate-200">${shelter.waterSupply}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Contact / Emergency:</span>
                <span class="text-blue-400 font-mono">${shelter.contact}</span>
              </div>
              <div class="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                <span class="text-slate-500">Officer:</span> ${shelter.chiefDoctor}
              </div>
            </div>
          </div>

          <div class="flex gap-2 pt-2 border-t border-slate-800">
            <button onclick="window.resqApp.openShelterModal('${shelter.id}')" 
              class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">
              Update Occupancy
            </button>
            <button onclick="window.resqApp.locateOnMap(${shelter.coords[0]}, ${shelter.coords[1]})" 
              title="Locate on Map"
              class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs border border-slate-700 transition-colors">
              🗺️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  async updateOccupancy(id, newOccupancy, notes) {
    const shelter = await this.db.get('shelters', id);
    if (!shelter) return;

    shelter.occupancy = parseInt(newOccupancy, 10);
    if (notes) shelter.notes = notes;

    await this.db.put('shelters', shelter);
    await this.syncEngine.trackMutation('UPDATE_SHELTER', 'shelter', shelter);

    window.dispatchEvent(new CustomEvent('resqnet:toast', {
      detail: {
        title: 'Shelter Updated',
        message: `${shelter.name} occupancy updated to ${shelter.occupancy} / ${shelter.capacity}.`,
        type: 'success'
      }
    }));

    window.dispatchEvent(new CustomEvent('resqnet:data_changed'));
  }
}

window.SheltersModule = SheltersModule;

