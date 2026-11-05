/**
 * ResQNet - Disaster Monitoring Map Module
 * Leaflet.js Interactive Tactical GIS with Offline Fallback Mode
 */

class DisasterMap {
  constructor(containerId, db, syncEngine) {
    this.containerId = containerId;
    this.db = db;
    this.syncEngine = syncEngine;
    this.map = null;
    this.tileLayer = null;
    this.layerGroups = {
      emergencies: null,
      shelters: null,
      hospitals: null,
      teams: null,
      grid: null
    };
    this.filters = {
      emergencies: true,
      shelters: true,
      hospitals: true,
      teams: true
    };
    this.isTileOffline = false;
    this.tileErrorCount = 0;
  }

  async init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Configure Leaflet default image path for offline assets
    if (window.L && window.L.Icon && window.L.Icon.Default) {
      delete window.L.Icon.Default.prototype._getIconUrl;
      window.L.Icon.Default.mergeOptions({
        iconRetinaUrl: './dist/images/leaflet/marker-icon-2x.png',
        iconUrl: './dist/images/leaflet/marker-icon.png',
        shadowUrl: './dist/images/leaflet/marker-shadow.png',
      });
    }

    const defaultCenter = window.SEED_DATA?.metadata?.defaultCenter || [16.5062, 80.6480];
    const defaultZoom = window.SEED_DATA?.metadata?.defaultZoom || 13;

    // Initialize Map
    this.map = L.map(this.containerId, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
      attributionControl: true
    });

    // Add Tile Layer (OpenStreetMap CartoDB Dark Matter / Standard with fallback)
    this.setupTileLayer();

    // Initialize Layer Groups
    this.layerGroups.emergencies = L.layerGroup().addTo(this.map);
    this.layerGroups.shelters = L.layerGroup().addTo(this.map);
    this.layerGroups.hospitals = L.layerGroup().addTo(this.map);
    this.layerGroups.teams = L.layerGroup().addTo(this.map);
    this.layerGroups.grid = L.layerGroup().addTo(this.map);

    // Setup Tactical Vector Grid (District boundaries and tactical zones for offline clarity)
    this.renderTacticalZones();

    // Map Click Listener to pick coordinates for emergency reporting
    this.map.on('click', (e) => {
      this.handleMapClick(e.latlng);
    });

    // Load and render markers
    await this.refreshMarkers();

    // Setup UI Controls & Listeners
    this.setupControls();

    // Listen for data updates
    window.addEventListener('resqnet:data_changed', () => this.refreshMarkers());
    window.addEventListener('resqnet:connectivity', () => this.checkTileStatus());

    // Fix map sizing after render
    setTimeout(() => {
      this.map.invalidateSize();
    }, 250);
  }

  setupTileLayer() {
    // OpenStreetMap standard tile server
    this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> | ResQNet Offline Tactical GIS'
    });

    this.tileLayer.on('tileerror', (error) => {
      this.tileErrorCount++;
      if (this.tileErrorCount >= 3 && !this.isTileOffline) {
        this.setOfflineTileState(true);
      }
    });

    this.tileLayer.on('load', () => {
      if (this.syncEngine && this.syncEngine.isOnline) {
        this.setOfflineTileState(false);
      }
    });

    this.tileLayer.addTo(this.map);

    // If initially offline
    if (this.syncEngine && !this.syncEngine.isOnline) {
      this.setOfflineTileState(true);
    }
  }

  setOfflineTileState(isOffline) {
    this.isTileOffline = isOffline;
    const banner = document.getElementById('mapOfflineBanner');
    const badge = document.getElementById('mapTileStatusBadge');
    
    if (banner) {
      if (isOffline) {
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }

    if (badge) {
      if (isOffline) {
        badge.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/40">
          <span class="w-2 h-2 rounded-full bg-amber-400"></span> Offline Vector Grid Mode
        </span>`;
      } else {
        badge.innerHTML = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Live OSM Tile Server Active
        </span>`;
      }
    }
  }

  checkTileStatus() {
    if (!this.syncEngine.isOnline) {
      this.setOfflineTileState(true);
    } else {
      this.tileErrorCount = 0;
      this.setOfflineTileState(false);
    }
  }

  /**
   * Tactical Emergency Overlay Zones (Visible both online and offline)
   */
  renderTacticalZones() {
    this.layerGroups.grid.clearLayers();

    // High Flood Risk Zone (Red / Amber Polygon)
    const floodZoneCoords = [
      [16.5200, 80.6300],
      [16.5300, 80.6450],
      [16.5180, 80.6550],
      [16.5080, 80.6460],
      [16.5100, 80.6350]
    ];

    const floodPolygon = L.polygon(floodZoneCoords, {
      color: '#EF4444',
      weight: 2,
      dashArray: '6, 6',
      fillColor: '#DC2626',
      fillOpacity: 0.12
    }).bindTooltip('⚠️ High-Risk Flood Inundation Zone (Sector 4)', {
      sticky: true,
      className: 'bg-slate-900 text-red-300 text-xs border border-red-500/30'
    });

    this.layerGroups.grid.addLayer(floodPolygon);

    // Evacuation Corridor Line (Green)
    const evacCorridor = [
      [16.5062, 80.6480],
      [16.5150, 80.6520],
      [16.5320, 80.6620]
    ];
    const evacLine = L.polyline(evacCorridor, {
      color: '#10B981',
      weight: 3,
      dashArray: '8, 8'
    }).bindTooltip('🟢 Primary Evacuation Corridor to North Haven High School', {
      sticky: true,
      className: 'bg-slate-900 text-emerald-300 text-xs border border-emerald-500/30'
    });

    this.layerGroups.grid.addLayer(evacLine);

    // River channel representation
    const riverCoords = [
      [16.4850, 80.6280],
      [16.5050, 80.6380],
      [16.5160, 80.6450],
      [16.5350, 80.6700]
    ];
    const riverLine = L.polyline(riverCoords, {
      color: '#38BDF8',
      weight: 4,
      opacity: 0.4
    }).bindTooltip('🌊 Krishna Basin Tributary Canal', { sticky: true });

    this.layerGroups.grid.addLayer(riverLine);
  }

  /**
   * Refresh all layer groups from IndexedDB
   */
  async refreshMarkers() {
    if (!this.map) return;

    // Clear current markers
    this.layerGroups.emergencies.clearLayers();
    this.layerGroups.shelters.clearLayers();
    this.layerGroups.hospitals.clearLayers();
    this.layerGroups.teams.clearLayers();

    // 1. Load Emergency Reports
    const reports = await this.db.getAll('reports');
    reports.forEach(report => {
      if (report.coords && Array.isArray(report.coords) && report.coords.length === 2) {
        const marker = this.createEmergencyMarker(report);
        this.layerGroups.emergencies.addLayer(marker);
      }
    });

    // 2. Load Shelters & Hospitals
    const shelters = await this.db.getAll('shelters');
    shelters.forEach(item => {
      if (item.coords && Array.isArray(item.coords) && item.coords.length === 2) {
        if (item.type === 'Hospital') {
          const marker = this.createHospitalMarker(item);
          this.layerGroups.hospitals.addLayer(marker);
        } else {
          const marker = this.createShelterMarker(item);
          this.layerGroups.shelters.addLayer(marker);
        }
      }
    });

    // 3. Load Rescue Teams
    const teams = await this.db.getAll('teams');
    teams.forEach(team => {
      if (team.coords && Array.isArray(team.coords) && team.coords.length === 2) {
        const marker = this.createTeamMarker(team);
        this.layerGroups.teams.addLayer(marker);
      }
    });
  }

  /**
   * Create custom SVG icon for emergency report
   */
  createEmergencyMarker(report) {
    let color = '#EF4444'; // Critical
    let animClass = 'marker-pin-critical';
    let iconText = '🚨';

    if (report.severity === 'High') {
      color = '#F97316';
      animClass = '';
      iconText = '⚠️';
    } else if (report.severity === 'Medium') {
      color = '#F59E0B';
      animClass = '';
      iconText = '⚡';
    } else if (report.severity === 'Low') {
      color = '#10B981';
      animClass = '';
      iconText = 'ℹ️';
    }

    const html = `
      <div class="relative flex items-center justify-center ${animClass}" style="width: 36px; height: 36px;">
        <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm shadow-lg border-2 border-white" style="background-color: ${color};">
          ${iconText}
        </div>
        <div class="absolute -bottom-1 w-2 h-2 rotate-45" style="background-color: ${color};"></div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: html,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -32]
    });

    const marker = L.marker(report.coords, { icon });

    const popupContent = `
      <div class="min-w-[240px] text-slate-100">
        <div class="flex items-center justify-between gap-2 border-b border-slate-700 pb-2 mb-2">
          <span class="font-mono text-xs font-bold text-blue-400">${report.id}</span>
          <span class="text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
            report.severity === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
            report.severity === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
            report.severity === 'Medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
            'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }">${report.severity}</span>
        </div>
        <h4 class="font-bold text-sm text-white mb-1">${report.category}</h4>
        <p class="text-xs text-slate-300 mb-2 leading-relaxed">${report.location}</p>
        <p class="text-xs text-slate-400 line-clamp-2 mb-2">${report.description}</p>
        
        <div class="bg-slate-950/60 p-2 rounded border border-slate-800 text-xs mb-3 space-y-1">
          <div class="flex justify-between">
            <span class="text-slate-400">People Affected:</span>
            <span class="font-bold text-amber-400">${report.peopleAffected}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Status:</span>
            <span class="font-medium text-blue-300">${report.status}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Sync Status:</span>
            <span class="font-medium ${report.syncStatus === 'synced' ? 'text-emerald-400' : 'text-amber-400'}">
              ${report.syncStatus === 'synced' ? '✓ Synced' : '⏳ Pending Sync'}
            </span>
          </div>
        </div>

        <div class="flex gap-2">
          <button onclick="window.resqApp.openDispatchModal('${report.id}')" class="flex-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors">
            Dispatch Team
          </button>
          <button onclick="window.resqApp.viewReportDetails('${report.id}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-semibold transition-colors">
            View
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    return marker;
  }

  /**
   * Create custom icon for shelter
   */
  createShelterMarker(shelter) {
    const isFull = shelter.occupancy >= shelter.capacity;
    const color = isFull ? '#DC2626' : '#10B981';

    const html = `
      <div class="relative flex items-center justify-center" style="width: 32px; height: 32px;">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-md border border-white/60" style="background-color: ${color};">
          ⛺
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: html,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -28]
    });

    const marker = L.marker(shelter.coords, { icon });
    const occupancyPercent = Math.round((shelter.occupancy / shelter.capacity) * 100);

    const popupContent = `
      <div class="min-w-[220px] text-slate-100">
        <div class="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
          <span class="text-xs font-bold text-emerald-400">Emergency Shelter</span>
          <span class="text-xs px-2 py-0.5 rounded-full ${isFull ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}">${shelter.status}</span>
        </div>
        <h4 class="font-bold text-sm text-white mb-1">${shelter.name}</h4>
        <p class="text-xs text-slate-400 mb-2">${shelter.location}</p>

        <div class="space-y-1.5 text-xs bg-slate-950/60 p-2 rounded border border-slate-800 mb-2">
          <div class="flex justify-between">
            <span class="text-slate-400">Occupancy:</span>
            <span class="font-bold text-white">${shelter.occupancy} / ${shelter.capacity} (${occupancyPercent}%)</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="${occupancyPercent >= 90 ? 'bg-red-500' : 'bg-emerald-500'} h-1.5 rounded-full" style="width: ${Math.min(occupancyPercent, 100)}%"></div>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Water Supply:</span>
            <span class="text-slate-200">${shelter.waterSupply}</span>
          </div>
        </div>

        <button onclick="window.resqApp.openShelterModal('${shelter.id}')" class="w-full px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium border border-slate-700 transition-colors">
          Manage Shelter Capacity
        </button>
      </div>
    `;

    marker.bindPopup(popupContent);
    return marker;
  }

  /**
   * Create custom icon for hospital
   */
  createHospitalMarker(hospital) {
    const html = `
      <div class="relative flex items-center justify-center" style="width: 34px; height: 34px;">
        <div class="w-8 h-8 rounded-full bg-cyan-600 border-2 border-white shadow-lg flex items-center justify-center text-sm font-bold text-white">
          🏥
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: html,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30]
    });

    const marker = L.marker(hospital.coords, { icon });

    const popupContent = `
      <div class="min-w-[220px] text-slate-100">
        <div class="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
          <span class="text-xs font-bold text-cyan-400">Medical Facility</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">${hospital.status}</span>
        </div>
        <h4 class="font-bold text-sm text-white mb-1">${hospital.name}</h4>
        <p class="text-xs text-slate-400 mb-2">${hospital.location}</p>

        <div class="space-y-1.5 text-xs bg-slate-950/60 p-2 rounded border border-slate-800 mb-2">
          <div class="flex justify-between">
            <span class="text-slate-400">Bed Occupancy:</span>
            <span class="font-bold text-white">${hospital.occupancy} / ${hospital.capacity}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">ICU Beds Available:</span>
            <span class="font-bold ${hospital.icuBedsAvailable <= 4 ? 'text-red-400' : 'text-emerald-400'}">${hospital.icuBedsAvailable} beds</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">Oxygen Status:</span>
            <span class="text-slate-200">${hospital.oxygenSupply}</span>
          </div>
        </div>

        <button onclick="window.resqApp.navigateTo('shelters')" class="w-full px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium border border-slate-700 transition-colors">
          View Hospital Status
        </button>
      </div>
    `;

    marker.bindPopup(popupContent);
    return marker;
  }

  /**
   * Create custom icon for rescue team
   */
  createTeamMarker(team) {
    const isDeployed = team.availability === 'Deployed';
    const color = isDeployed ? '#3B82F6' : '#10B981';

    const html = `
      <div class="relative flex items-center justify-center" style="width: 32px; height: 32px;">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-md border-2 border-white/80" style="background-color: ${color};">
          🛡️
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: html,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -28]
    });

    const marker = L.marker(team.coords, { icon });

    const popupContent = `
      <div class="min-w-[230px] text-slate-100">
        <div class="flex items-center justify-between border-b border-slate-700 pb-1.5 mb-2">
          <span class="text-xs font-bold text-blue-400">Rescue Team</span>
          <span class="text-xs px-2 py-0.5 rounded-full ${isDeployed ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}">${team.availability}</span>
        </div>
        <h4 class="font-bold text-sm text-white mb-0.5">${team.name}</h4>
        <p class="text-xs text-slate-400 mb-2">Leader: ${team.leader} (${team.members} members)</p>

        <div class="space-y-1 text-xs bg-slate-950/60 p-2 rounded border border-slate-800 mb-2">
          <div><span class="text-slate-400">Operation:</span> <span class="text-white font-medium">${team.operationStatus}</span></div>
          <div><span class="text-slate-400">Radio:</span> <span class="text-cyan-400 font-mono">${team.radioFreq}</span></div>
          ${team.currentAssignment ? `<div class="text-slate-300 text-[11px] pt-1 border-t border-slate-800">${team.currentAssignment}</div>` : ''}
        </div>

        <button onclick="window.resqApp.openTeamModal('${team.id}')" class="w-full px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors">
          Manage Team Status
        </button>
      </div>
    `;

    marker.bindPopup(popupContent);
    return marker;
  }

  /**
   * Handle user clicking on the map: pick coordinates for reporting
   */
  handleMapClick(latlng) {
    const lat = latlng.lat.toFixed(5);
    const lng = latlng.lng.toFixed(5);

    L.popup()
      .setLatLng(latlng)
      .setContent(`
        <div class="text-slate-100 text-xs p-1">
          <p class="font-bold text-sm text-white mb-1">📍 Selected Coordinates</p>
          <p class="font-mono text-cyan-400 mb-2">${lat}, ${lng}</p>
          <p class="text-slate-400 mb-2">Use this location to log an emergency incident or mark relief resources.</p>
          <button onclick="window.resqApp.fillReportLocation(${lat}, ${lng})" class="w-full px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-semibold transition-colors">
            🚨 Report Incident Here
          </button>
        </div>
      `)
      .openOn(this.map);
  }

  setupControls() {
    // Checkbox filters
    const filterIds = [
      { id: 'filterEmergencies', key: 'emergencies' },
      { id: 'filterShelters', key: 'shelters' },
      { id: 'filterHospitals', key: 'hospitals' },
      { id: 'filterTeams', key: 'teams' }
    ];

    filterIds.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          this.filters[key] = e.target.checked;
          if (e.target.checked) {
            this.map.addLayer(this.layerGroups[key]);
          } else {
            this.map.removeLayer(this.layerGroups[key]);
          }
        });
      }
    });

    // Reset view button
    const resetBtn = document.getElementById('mapResetViewBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const defaultCenter = window.SEED_DATA?.metadata?.defaultCenter || [16.5062, 80.6480];
        const defaultZoom = window.SEED_DATA?.metadata?.defaultZoom || 13;
        this.map.setView(defaultCenter, defaultZoom);
      });
    }

    // Toggle Offline simulation for map
    const mapOfflineToggle = document.getElementById('mapSimulateOfflineToggle');
    if (mapOfflineToggle) {
      mapOfflineToggle.addEventListener('change', (e) => {
        this.setOfflineTileState(e.target.checked);
      });
    }
  }

  /**
   * Pan to specific coordinate
   */
  panTo(lat, lng, zoom = 15) {
    if (this.map) {
      this.map.setView([lat, lng], zoom, { animate: true });
    }
  }
}

window.DisasterMap = DisasterMap;

