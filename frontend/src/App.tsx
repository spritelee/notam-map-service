import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { NotamMap } from './components/NotamMap';
import type { FeatureCollection } from 'geojson';

function App() {
  const [allNotams, setAllNotams] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Layer State
  const [layers, setLayers] = useState({
    tda: true,
    dropZone: true,
    winch: true,
    drone: true,
    fastJet: true,
    obstacle: true,
    aerodrome: false,
    other: false,
    bgaTurnpoints: false
  });
  const [bgaTurnpoints, setBgaTurnpoints] = useState<any>(null);
  const [altitudeFloor, setAltitudeFloor] = useState<number>(0);
  const [altitudeCeiling, setAltitudeCeiling] = useState<number>(100);
  
  const [dateFilters, setDateFilters] = useState({
    today: true,
    plus1: false,
    plus2: false,
    plus7: false,
  });
  const [showUnplaceableOnly, setShowUnplaceableOnly] = useState<boolean>(false);

  const [selectedNotam, setSelectedNotam] = useState<any>(null);

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



  // Helper to map a backend hazard type strictly to a frontend layer key
  const getLayerKey = (hazardType: string): keyof typeof layers => {
    const t = (hazardType || '').toUpperCase();
    if (t === 'GLIDER_WINCH') return 'winch';
    if (t === 'PARACHUTE') return 'dropZone';
    if (t === 'UAS') return 'drone';
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

  // Compute visible dataset based on layers, altitude, and unplaceable filter
  const baseFeatures = allNotams?.features || [];
  
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
      if (dateFilters.plus7) activeDates.push(getDateOffsetString(7));

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

  const exportOpenAir = () => {
    fetch('/api/export/openair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filteredFeatures)
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

  return (
    <div className="app-container">
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
        onSelectNotam={setSelectedNotam}
        selectedNotamId={selectedNotam?.properties?.notam_id || null}
        totalNotamsCount={allNotams?.features?.length || 0}
        visibleNotamsCount={filteredFeatures.length}
        onExportOpenAir={exportOpenAir}
        showUnplaceableOnly={showUnplaceableOnly}
        setShowUnplaceableOnly={setShowUnplaceableOnly}
      />

      <NotamMap 
        filteredData={visibleData}
        selectedNotam={selectedNotam}
        onSelectNotam={setSelectedNotam}
        bgaTurnpoints={bgaTurnpoints}
        layers={layers}
      />

      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Ingesting live UK NATS Aeronautical Feed (1,500+ notices)...</p>
        </div>
      )}
    </div>
  );
}

export default App;
