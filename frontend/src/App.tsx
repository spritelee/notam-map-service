import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NotamMap } from './components/NotamMap';
import { UserGuideModal } from './components/UserGuideModal';
import type { FeatureCollection } from 'geojson';

function App() {
  const [allNotams, setAllNotams] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Disclaimer State (Accepted state persists in localStorage)
  const [disclaimerState, setDisclaimerState] = useState<'pending' | 'accepted' | 'rejected'>(() => {
    return localStorage.getItem('notam_disclaimer_accepted') === 'true' ? 'accepted' : 'pending';
  });

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

  const [notamMeta, setNotamMeta] = useState<{ fetched_at?: string; feed_degraded?: boolean } | null>(null);

  const [selectedNotam, setSelectedNotam] = useState<any>(null);
  const [panToNotam, setPanToNotam] = useState<any>(null);

  // Task Planner State
  const [waypoints, setWaypoints] = useState<[number, number][]>([]); // [lat, lng]
  const [observationZones, setObservationZones] = useState<{
    type: 'Cylinder' | 'Sector' | 'Line' | 'Keyhole' | 'Ring';
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
        if (data?.meta) {
          setNotamMeta(data.meta);
        }
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
        if (data?.meta) {
          setNotamMeta(prev => ({ ...prev, ...data.meta }));
        }
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
        radius: 500, // 500m radius (1km width) BGA standard
        angle: 90
      };
      
      const nextZones = [...prev];
      if (nextZones.length > 0) {
        const prevFinishIdx = nextZones.length - 1;
        if (prevFinishIdx > 0) { // i.e. it's not the start point
          nextZones[prevFinishIdx] = {
            type: 'Sector',
            radius: 10000,
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
      body: JSON.stringify({ features: exportFeatures, meta: notamMeta })
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
      body: JSON.stringify({ features: exportFeatures, meta: notamMeta })
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

  const formatDataAsOf = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return null;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = d.getUTCDate();
      const month = months[d.getUTCMonth()];
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${day} ${month} ${hh}:${mm} UTC`;
    } catch (e) {
      return null;
    }
  };

  const handleSelectNotamFromMap = (notam: any) => {
    setSelectedNotam(notam);
    setPanToNotam(null);
  };

  return (
    <div className={`app-container ${isMobile ? 'is-mobile' : ''} ${isMobileSidebarOpen ? 'mobile-sidebar-open' : ''}`}>
      {notamMeta?.feed_degraded && (
        <div className="degraded-feed-banner" role="alert">
          <div className="degraded-banner-content">
            <span className="degraded-icon">⚠️</span>
            <span>
              <strong>DEGRADED FEED WARNING:</strong> Live NATS NOTAM update failed. Displaying cached data as of <strong>{formatDataAsOf(notamMeta.fetched_at) || 'previous fetch'}</strong>. Short-notice NOTAMs may be missing. Verify against official NATS AIS before flight.
            </span>
          </div>
        </div>
      )}

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

        // Staleness metadata
        notamMeta={notamMeta}
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

      {isMobile && !isMobileSidebarOpen && disclaimerState === 'accepted' && (
        <div className="mobile-header-bar">
          <div className="brand-container">
            <img src="/favicon.png" alt="NOTAM Radar Logo" className="header-logo" />
            <span className="mobile-header-title">NOTAM Radar</span>
          </div>
          <button 
            className="mobile-header-menu-btn"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open sidebar controls menu"
          >
            ☰ Menu
          </button>
        </div>
      )}

      {isMobile && !selectedNotam && (
        <button 
          className={`mobile-fab ${isMobileSidebarOpen ? 'active' : ''}`}
          onClick={() => setIsMobileSidebarOpen(prev => !prev)}
          aria-expanded={isMobileSidebarOpen}
          aria-label="Toggle filter and route workbench controls"
        >
          {isMobileSidebarOpen ? '✕ Map View' : '☰ Workbench'}
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
          <img src="/notam-icon.png" alt="NOTAM Radar Logo" className="loading-logo" />
          <div className="spinner"></div>
          <p>Loading current NOTAMs...</p>
        </div>
      )}

      {disclaimerState !== 'accepted' && (
        <div className="disclaimer-overlay">
          {disclaimerState === 'pending' ? (
            <div className="disclaimer-card">
              <div className="disclaimer-header">
                <h2>⚠️ UK Flight Safety Notice & Terms</h2>
              </div>
              <div className="disclaimer-body">
                <div className="disclaimer-notice-box">
                  <strong>Non-Delegable Responsibility:</strong> Under the UK Air Navigation Order, the Pilot-in-Command (PIC) has sole, non-delegable responsibility for flight safety. This application is an unofficial visualization tool for supplemental situational awareness only and is <strong>NOT</strong> a replacement for an official pre-flight briefing. Always check the official <strong>UK AIS Portal (PIB)</strong> before takeoff.
                </div>
                <div>
                  <strong>🔒 Safety Enhancement - Unplaceable Notices:</strong> Many aviation apps silently discard NOTAMs that cannot be mapped due to coordinate errors. This tool isolates them under the <strong>Unplaceable Notices</strong> panel. You must review the Unplaceable list manually before flight to ensure no critical hazards are missed.
                </div>
                <div className="disclaimer-gdpr-box">
                  <strong>🇪🇺 GDPR & Privacy Notice:</strong> This application does not use cookies for tracking, analytics, or marketing. We use your browser's local storage solely to retain your local task synchronizer credentials (API keys/tokens) for your convenience. When syncing, credentials and task details are transmitted securely via HTTPS through our backend server solely to proxy requests to third-party services (WeGlide, Google Drive, Dropbox). Credentials are processed statelessly and are never stored, saved, or logged on our servers.
                </div>
                <div>
                  By clicking <strong>Accept and Continue</strong> below, you acknowledge and agree that you use this software at your own risk, that it is for supplemental use only, and that you will verify all information with official AIS sources.
                </div>
              </div>
              <div className="disclaimer-status-bar">
                <span style={{ color: '#94a3b8' }}>NOTAM Database Sync:</span>
                {isLoading ? (
                  <div className="status-indicator">
                    <div className="status-spinner"></div>
                    <span style={{ marginLeft: '6px' }}>Syncing aeronautical feed...</span>
                  </div>
                ) : (
                  <div className="status-indicator ready">
                    <span>✅ Feed Mapped in Background</span>
                  </div>
                )}
              </div>
              <div className="disclaimer-actions">
                <button 
                  className="disclaimer-btn reject" 
                  onClick={() => setDisclaimerState('rejected')}
                >
                  Decline & Exit
                </button>
                <button 
                  className="disclaimer-btn accept" 
                  onClick={() => {
                    localStorage.setItem('notam_disclaimer_accepted', 'true');
                    setDisclaimerState('accepted');
                  }}
                >
                  Accept & Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="disclaimer-card" style={{ border: '1px solid #ef4444' }}>
              <div className="disclaimer-header">
                <h2 style={{ color: '#ef4444' }}>❌ Access Terminated</h2>
              </div>
              <div className="disclaimer-body">
                <p>
                  You have declined the safety agreement. As a safety-critical aviation tool, use of this application is strictly prohibited without accepting these terms.
                </p>
                <p>
                  Please perform your pre-flight preparation using the official UK Aeronautical Information Service.
                </p>
              </div>
              <div className="disclaimer-actions" style={{ flexDirection: 'column' }}>
                <a 
                  href="https://www.eais.nats.co.uk/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="disclaimer-btn primary-action"
                  style={{ textDecoration: 'none' }}
                >
                  Go to Official UK AIS Portal ↗
                </a>
                <button 
                  className="disclaimer-btn reject" 
                  onClick={() => setDisclaimerState('pending')}
                >
                  Review Safety Terms Again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
