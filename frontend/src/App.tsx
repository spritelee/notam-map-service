import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NotamMap } from './components/NotamMap';
import { UserGuideModal } from './components/UserGuideModal';
import type { FeatureCollection } from 'geojson';

function App() {
  const [allNotams, setAllNotams] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Responsive Layout States
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= 768);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Layer State
  const [layers, setLayers] = useState({
    tda: true,
    dropZone: true,
    winch: true,
    drone: true,
    fastJet: true,
    obstacle: true,
    gpsJamming: true,
    airspaceStatus: true,
    lowLevelHazard: true,
    groundServices: true,
    aerodrome: true,
    other: true,
    bgaTurnpoints: false
  });
  const [bgaTurnpoints, setBgaTurnpoints] = useState<any>(null);
  const [altitudeFloor, setAltitudeFloor] = useState<number>(0);
  const [altitudeCeiling, setAltitudeCeiling] = useState<number>(100);
  
  const [dateFilters, setDateFilters] = useState({
    today: true,
    plus1: false,
    plus2: false,
    thisWeek: false,
  });
  const [showUnplaceableOnly, setShowUnplaceableOnly] = useState<boolean>(false);

  const [selectedNotam, setSelectedNotam] = useState<any>(null);
  const [panToNotam, setPanToNotam] = useState<any>(null);

  // Task Planner State
  const [waypoints, setWaypoints] = useState<[number, number][]>([]); // [lat, lng]
  const [observationZones, setObservationZones] = useState<{
    type: 'Cylinder' | 'Sector' | 'Line' | 'Keyhole';
    radius: number; // meters
    angle: number; // degrees
  }[]>([]);
  const [corridorNm, setCorridorNm] = useState<number>(20); // 20 NM default
  const [isCorridorFilterActive, setIsCorridorFilterActive] = useState<boolean>(false);
  const [corridorResult, setCorridorResult] = useState<any>(null);

  // 1. Ingest live UK NATS NOTAM feed on mount
  useEffect(() => {
    setIsLoading(true);
    fetch('/api/notams')
      .then(res => res.json())
      .then(data => {
        setAllNotams(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch live NATS feed", err);
        setIsLoading(false);
      });

    fetch('/api/bga-turnpoints')
      .then(res => res.json())
      .then(data => {
        setBgaTurnpoints(data);
      })
      .catch(err => {
        console.error("Failed to fetch BGA turnpoints", err);
      });
  }, []);

  // 2. Perform backend spatial corridor filtering when route is active
  useEffect(() => {
    if (waypoints.length > 1) {
      const lngLatWaypoints = waypoints.map(wp => [wp[1], wp[0]]);
      
      fetch('/api/route/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: lngLatWaypoints,
          corridor_nm: corridorNm,
          min_fl: altitudeFloor,
          max_fl: altitudeCeiling
        })
      })
      .then(res => res.json())
      .then(data => {
        setCorridorResult(data);
      })
      .catch(err => console.error("Corridor filter failed", err));
    } else {
      setCorridorResult(null);
    }
  }, [waypoints, corridorNm, altitudeFloor, altitudeCeiling]);

  // 3. Automatically turn on BGA turnpoints layer when waypoints are active
  useEffect(() => {
    if (waypoints.length > 0 && !layers.bgaTurnpoints) {
      setLayers(prev => ({ ...prev, bgaTurnpoints: true }));
    }
  }, [waypoints.length, layers.bgaTurnpoints]);

  const addWaypoint = (latlng: [number, number]) => {
    setWaypoints(prev => [...prev, latlng]);
    setObservationZones(prev => {
      const isStart = prev.length === 0;
      const defaultOz = {
        type: isStart ? ('Line' as const) : ('Line' as const),
        radius: isStart ? 5000 : 1000,
        angle: 90
      };
      
      const nextZones = [...prev];
      if (nextZones.length > 0) {
        const prevFinishIdx = nextZones.length - 1;
        if (prevFinishIdx > 0) { // i.e. it's not the start point
          nextZones[prevFinishIdx] = {
            type: 'Cylinder',
            radius: 500,
            angle: 90
          };
        }
      }
      return [...nextZones, defaultOz];
    });
  };

  const clearRoute = () => {
    setWaypoints([]);
    setObservationZones([]);
    setIsCorridorFilterActive(false);
    setCorridorResult(null);
  };




  // Helper to map a backend hazard type strictly to a frontend layer key
  const getLayerKey = (hazardType: string): keyof typeof layers => {
    const t = (hazardType || '').toUpperCase();
    if (t === 'GLIDER_WINCH') return 'winch';
    if (t === 'PARACHUTE') return 'dropZone';
    if (t === 'UAS') return 'drone';
    if (t === 'GPS_JAMMING') return 'gpsJamming';
    if (t === 'AIRSPACE_STATUS') return 'airspaceStatus';
    if (t === 'LOW_LEVEL_HAZARD') return 'lowLevelHazard';
    if (t === 'GROUND_SERVICES') return 'groundServices';
    if (['MILITARY_EXERCISE', 'DANGER_AREA', 'RESTRICTED_AREA', 'PROHIBITED_AREA', 'OVERFLYING'].includes(t)) {
      return 'tda';
    }
    if (['AERIAL_ACTIVITY', 'AEROBATICS', 'FORMATION_FLIGHT'].includes(t)) {
      return 'fastJet';
    }
    if (['OBSTACLE', 'OBSTACLE_LIGHT', 'LASER', 'BURNING'].includes(t)) {
      return 'obstacle';
    }
    if (['AERODROME', 'TAXIWAY', 'RUNWAY', 'RUNWAY_SURFACE', 'APRON', 'ILS', 'NAVAID', 'PROCEDURE', 'COMMS'].includes(t)) {
      return 'aerodrome';
    }
    return 'other';
  };

  // Compute visible dataset based on layers, altitude, corridor filter, and unplaceable filter
  const baseFeatures = (isCorridorFilterActive && corridorResult) ? corridorResult.features : (allNotams?.features || []);
  
  const filteredFeatures = baseFeatures.filter((f: any) => {
    const props = f.properties || {};
    const type = props.hazard_type || '';
    const upper = props.upper_fl !== null && props.upper_fl !== undefined ? props.upper_fl : 999;
    const lower = props.lower_fl !== null && props.lower_fl !== undefined ? props.lower_fl : 0;

    // Filter by unplaceable toggle
    if (showUnplaceableOnly && props.geometry_source !== 'unplaceable') {
      return false;
    }

    // Filter by Date Horizon Checkboxes
    if (props.start_utc) {
      const getDateOffsetString = (offsetDays: number) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };

      const activeDates: string[] = [];
      if (dateFilters.today) activeDates.push(getDateOffsetString(0));
      if (dateFilters.plus1) activeDates.push(getDateOffsetString(1));
      if (dateFilters.plus2) activeDates.push(getDateOffsetString(2));
      if (dateFilters.thisWeek) {
        for (let i = 0; i <= 7; i++) {
          activeDates.push(getDateOffsetString(i));
        }
      }

      if (activeDates.length > 0) {
        const notamStart = new Date(props.start_utc).getTime();
        const notamEnd = props.end_utc ? new Date(props.end_utc).getTime() : Infinity;

        const overlapsAny = activeDates.some(dateStr => {
          const dayStart = new Date(dateStr + 'T00:00:00Z').getTime();
          const dayEnd = new Date(dateStr + 'T23:59:59Z').getTime();
          return !(notamStart > dayEnd || notamEnd < dayStart);
        });

        if (!overlapsAny) {
          return false;
        }
      } else {
        return false;
      }
    }

    // Filter by Altitude Range (hide if hazard does not overlap our flight band)
    if (lower > altitudeCeiling || upper < altitudeFloor) {
      return false;
    }

    // Filter by Hazard Layer toggles (Strict Mapping)
    const layerKey = getLayerKey(type);
    if (!layers[layerKey]) {
      return false;
    }

    return true;
  });

  const unplaceableNotams = filteredFeatures.filter((f: any) => f.properties?.geometry_source === 'unplaceable');
  const placedFeatures = filteredFeatures.filter((f: any) => f.properties?.geometry_source !== 'unplaceable' && f.geometry !== null);

  const visibleData: FeatureCollection = {
    type: 'FeatureCollection',
    features: placedFeatures,
    meta: { count: placedFeatures.length }
  } as any;

  const getFeaturesToExport = () => {
    // If a task is active (2+ waypoints), export corridor-filtered NOTAMs. Otherwise, export all.
    const baseList = (waypoints.length >= 2 && corridorResult) ? corridorResult.features : (allNotams?.features || []);
    
    return baseList.filter((f: any) => {
      const props = f.properties || {};
      const type = props.hazard_type || '';
      const upper = props.upper_fl !== null && props.upper_fl !== undefined ? props.upper_fl : 999;
      const lower = props.lower_fl !== null && props.lower_fl !== undefined ? props.lower_fl : 0;

      if (showUnplaceableOnly && props.geometry_source !== 'unplaceable') {
        return false;
      }

      if (props.start_utc) {
        const getDateOffsetString = (offsetDays: number) => {
          const d = new Date();
          d.setDate(d.getDate() + offsetDays);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        };

        const activeDates: string[] = [];
        if (dateFilters.today) activeDates.push(getDateOffsetString(0));
        if (dateFilters.plus1) activeDates.push(getDateOffsetString(1));
        if (dateFilters.plus2) activeDates.push(getDateOffsetString(2));
        if (dateFilters.thisWeek) {
          for (let i = 0; i <= 7; i++) {
            activeDates.push(getDateOffsetString(i));
          }
        }

        if (activeDates.length > 0) {
          const notamStart = new Date(props.start_utc).getTime();
          const notamEnd = props.end_utc ? new Date(props.end_utc).getTime() : Infinity;

          const overlapsAny = activeDates.some(dateStr => {
            const dayStart = new Date(dateStr + 'T00:00:00Z').getTime();
            const dayEnd = new Date(dateStr + 'T23:59:59Z').getTime();
            return !(notamStart > dayEnd || notamEnd < dayStart);
          });

          if (!overlapsAny) {
            return false;
          }
        } else {
          return false;
        }
      }

      if (lower > altitudeCeiling || upper < altitudeFloor) {
        return false;
      }

      const layerKey = getLayerKey(type);
      if (!layers[layerKey]) {
        return false;
      }

      return true;
    });
  };

  const exportOpenAir = () => {
    const exportFeatures = getFeaturesToExport();
    fetch('/api/export/openair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: exportFeatures })
    })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UK_NOTAMs_FL${altitudeCeiling}.openair`;
      a.click();
    })
    .catch(err => console.error("Export failed", err));
  };

  const exportSua = () => {
    const exportFeatures = getFeaturesToExport();
    fetch('/api/export/sua', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: exportFeatures })
    })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UK_NOTAMs_FL${altitudeCeiling}.sua`;
      a.click();
    })
    .catch(err => console.error("Export failed", err));
  };

  const exportIgcTask = () => {
    if (waypoints.length < 2) return;
    const lngLatWaypoints = waypoints.map(wp => [wp[1], wp[0]]);
    fetch('/api/export/task/igc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waypoints: lngLatWaypoints })
    })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `task.igc`;
      a.click();
    })
    .catch(err => console.error("Export IGC failed", err));
  };

  const formatAltitudeValue = (val: any, isUpper: boolean): string => {
    if (val === null || val === undefined) {
      return isUpper ? 'UNL' : 'SFC';
    }
    const fl = typeof val === 'string' ? parseInt(val) : val;
    if (isNaN(fl)) return String(val);
    if (fl === 0) return 'SFC';
    if (fl >= 999) return 'UNL';
    
    if (fl < 75) {
      const feet = fl * 100;
      const meters = Math.round(feet / 3.28084);
      return `${feet.toLocaleString()} ft (${meters.toLocaleString()} m)`;
    } else {
      return `FL${fl.toString().padStart(3, '0')}`;
    }
  };

  const handleSelectNotamFromSidebar = (notam: any) => {
    setSelectedNotam(notam);
    setPanToNotam(notam);
    if (isMobile) {
      setIsMobileSidebarOpen(false);
    }
  };

  const handleSelectNotamFromMap = (notam: any) => {
    setSelectedNotam(notam);
    setPanToNotam(null);
  };

  return (
    <div className={`app-container ${isMobile ? 'is-mobile' : ''} ${isMobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
      <Sidebar 
        layers={layers}
        setLayers={setLayers}
        altitudeFloor={altitudeFloor}
        setAltitudeFloor={setAltitudeFloor}
        altitudeCeiling={altitudeCeiling}
        setAltitudeCeiling={setAltitudeCeiling}
        dateFilters={dateFilters}
        setDateFilters={setDateFilters}
        unplaceableNotams={unplaceableNotams}
        onSelectNotam={handleSelectNotamFromSidebar}
        selectedNotamId={selectedNotam?.properties?.notam_id || null}
        totalNotamsCount={allNotams?.features?.length || 0}
        visibleNotamsCount={filteredFeatures.length}
        onExportOpenAir={exportOpenAir}
        onExportSua={exportSua}
        onExportIgcTask={exportIgcTask}
        showUnplaceableOnly={showUnplaceableOnly}
        setShowUnplaceableOnly={setShowUnplaceableOnly}
        
        waypoints={waypoints}
        clearRoute={clearRoute}
        corridorNm={corridorNm}
        setCorridorNm={setCorridorNm}
        isCorridorFilterActive={isCorridorFilterActive}
        setIsCorridorFilterActive={setIsCorridorFilterActive}
        bgaTurnpoints={bgaTurnpoints}
        setWaypoints={setWaypoints}
        routeHazardsCount={corridorResult?.meta?.total_route_hazards || 0}
        observationZones={observationZones}
        setObservationZones={setObservationZones}
        
        // Mobile Layout Support
        isMobile={isMobile}
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}

        // Help Guide Support
        onOpenGuide={() => setIsGuideOpen(true)}
      />

      <NotamMap 
        filteredData={visibleData}
        selectedNotam={selectedNotam}
        onSelectNotam={handleSelectNotamFromMap}
        bgaTurnpoints={bgaTurnpoints}
        layers={layers}
        
        waypoints={waypoints}
        onAddWaypoint={addWaypoint}
        corridorGeoJSON={corridorResult?.corridor_geometry || null}
        observationZones={observationZones}
        
        // Mobile and Double-Click Fix
        isMobile={isMobile}
        panToNotam={panToNotam}
        setPanToNotam={setPanToNotam}
      />

      {isMobile && (
        <button 
          className={`mobile-fab ${isMobileSidebarOpen ? 'active' : ''}`}
          onClick={() => setIsMobileSidebarOpen(prev => !prev)}
          aria-expanded={isMobileSidebarOpen}
          aria-label="Toggle filter and route workbench controls"
        >
          {isMobileSidebarOpen ? '✕ Map View' : '⚙️ Workbench'}
        </button>
      )}

      {isMobile && isMobileSidebarOpen && (
        <div 
          className="mobile-sidebar-backdrop"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {isMobile && selectedNotam && (
        <div className="mobile-bottom-sheet">
          <div className="bottom-sheet-handle"></div>
          <div className="bottom-sheet-header">
            <div>
              <h3>{selectedNotam.properties?.hazard_label || selectedNotam.properties?.hazard_type}</h3>
              <span className="bottom-sheet-subtitle">ID: {selectedNotam.properties?.notam_id} ({selectedNotam.properties?.q_code || ''})</span>
            </div>
            <button className="bottom-sheet-close" onClick={() => setSelectedNotam(null)}>✕</button>
          </div>
          <div className="bottom-sheet-content">
            <div className="bottom-sheet-meta-grid">
              <div>
                <span className="meta-label">Altitude:</span>
                <span className="meta-val">
                  {formatAltitudeValue(selectedNotam.properties?.lower_fl, false)} - {formatAltitudeValue(selectedNotam.properties?.upper_fl, true)}
                </span>
              </div>
              {selectedNotam.properties?.start_utc && (
                <div>
                  <span className="meta-label">Active:</span>
                  <span className="meta-val">
                    {new Date(selectedNotam.properties.start_utc).toLocaleDateString()} to {selectedNotam.properties.end_utc ? new Date(selectedNotam.properties.end_utc).toLocaleDateString() : 'Permanent'}
                  </span>
                </div>
              )}
            </div>
            
            {selectedNotam.properties?.hazard_type === 'PARACHUTE' && (
              (() => {
                const txt = (selectedNotam.properties?.raw_text || '').toUpperCase();
                const isUnknown = txt.includes('SUBJ') || txt.includes('ATC') || txt.includes('CALL') || txt.includes('NOTAM') || txt.includes('UNKNOWN') || txt.includes('VAR') || txt.includes('OPR') || txt.includes('AMDT') || txt.includes('EST');
                return (
                  <div className={`parachute-warning-box ${isUnknown ? 'warning' : 'info'}`}>
                    <strong>{isUnknown ? '⚠️ Variable/Unknown Times:' : 'ℹ️ Verify Activity:'}</strong>
                    {isUnknown ? ' Call/radio nearest ATC or Drop Zone Operator to confirm if active.' : ' Call/radio ATC or Operator to confirm activity.'}
                  </div>
                );
              })()
            )}

            <pre className="bottom-sheet-raw-text">{selectedNotam.properties?.raw_text}</pre>
            
            {selectedNotam.geometry && (
              <button className="bottom-sheet-action-btn" onClick={() => setPanToNotam(selectedNotam)}>
                🔍 Center on Map
              </button>
            )}
          </div>
        </div>
      )}

      <UserGuideModal 
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading current NOTAMs...</p>
        </div>
      )}
    </div>
  );
}

export default App;
