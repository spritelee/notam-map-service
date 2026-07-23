import React, { useState } from 'react';

interface TaskPlannerProps {
  waypoints: [number, number][]; // [lat, lng]
  clearRoute: () => void;
  corridorNm: number;
  setCorridorNm: (val: number) => void;
  isCorridorFilterActive: boolean;
  setIsCorridorFilterActive: (val: boolean) => void;
  routeHazardsCount: number;
  bgaTurnpoints: any; // GeoJSON FeatureCollection
  setWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
}

const getDistanceNM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3440.065; // Earth radius in NM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

const getHeadingDegrees = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
};

export const TaskPlanner: React.FC<TaskPlannerProps> = ({
  waypoints,
  clearRoute,
  corridorNm,
  setCorridorNm,
  isCorridorFilterActive,
  setIsCorridorFilterActive,
  routeHazardsCount,
  bgaTurnpoints,
  setWaypoints
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const getWaypointLabel = (lat: number, lng: number) => {
    const match = bgaTurnpoints?.features?.find((f: any) => {
      const [wlng, wlat] = f.geometry.coordinates;
      const dist = getDistanceNM(lat, lng, wlat, wlng);
      return dist < 0.2; // Within 0.2 NM is snapped
    });
    if (match) {
      return `${match.properties.code} (${match.properties.name})`;
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };

  const deleteWaypoint = (index: number) => {
    setWaypoints(prev => prev.filter((_, idx) => idx !== index));
  };

  const moveWaypoint = (index: number, direction: 'up' | 'down') => {
    setWaypoints(prev => {
      const nextList = [...prev];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx >= 0 && targetIdx < nextList.length) {
        const temp = nextList[index];
        nextList[index] = nextList[targetIdx];
        nextList[targetIdx] = temp;
      }
      return nextList;
    });
  };

  // Search filter
  const query = searchQuery.trim().toUpperCase();
  const searchResults = bgaTurnpoints?.features ? bgaTurnpoints.features.filter((f: any) => {
    const code = (f.properties.code || '').toUpperCase();
    const name = (f.properties.name || '').toUpperCase();
    return query && (code.startsWith(query) || name.includes(query));
  }).slice(0, 5) : [];

  const handleAddSearchResult = (feat: any) => {
    const [lon, lat] = feat.geometry.coordinates;
    setWaypoints(prev => [...prev, [lat, lon]]);
    setSearchQuery('');
  };

  const getWaypointRoleBadge = (index: number, total: number) => {
    if (index === 0) {
      return <span className="wp-role-badge start-badge">🚀 START</span>;
    }
    if (index === total - 1) {
      return <span className="wp-role-badge finish-badge">🏁 FINISH</span>;
    }
    return <span className="wp-role-badge tp-badge">📍 TP</span>;
  };

  // Calculate total task distance
  const totalDistance = waypoints.reduce((sum, wp, index) => {
    if (index === 0) return 0;
    const prevWp = waypoints[index - 1];
    return sum + getDistanceNM(prevWp[0], prevWp[1], wp[0], wp[1]);
  }, 0);

  return (
    <div className="panel-section route-planner-panel">
      <div className="section-title">
        <span>🛰️ BGA Turnpoint Task Planner</span>
      </div>

      <div className="route-actions">
        <span className="route-mode-text">
          {waypoints.length === 0 
            ? '✏️ Add turnpoints to begin task planning' 
            : `📋 Task: ${waypoints.length} waypoints (${totalDistance.toFixed(1)} NM)`}
        </span>
        {waypoints.length > 0 && (
          <button className="clear-btn" onClick={clearRoute} style={{ marginLeft: 'auto' }}>
            Reset
          </button>
        )}
      </div>

      {/* Autocomplete Search */}
      <div className="bga-search-container" style={{ marginTop: '10px' }}>
        <input 
          type="text" 
          placeholder="Search BGA turnpoint or GA airfield..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bga-search-input"
        />
        {searchResults.length > 0 && (
          <ul className="bga-search-results">
            {searchResults.map((feat: any) => (
              <li 
                key={feat.properties.code}
                onClick={() => handleAddSearchResult(feat)}
                className="search-item"
              >
                <strong>{feat.properties.code}</strong> - {feat.properties.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {waypoints.length > 0 && (
        <div className="waypoints-summary" style={{ marginTop: '12px' }}>
          {/* Waypoints List with Leg Calculations */}
          <div className="waypoints-list">
            {waypoints.map((wp, index) => {
              const label = getWaypointLabel(wp[0], wp[1]);
              let legCalc = null;
              if (index > 0) {
                const prevWp = waypoints[index - 1];
                const dist = getDistanceNM(prevWp[0], prevWp[1], wp[0], wp[1]);
                const heading = getHeadingDegrees(prevWp[0], prevWp[1], wp[0], wp[1]);
                legCalc = `${dist} NM @ ${heading}°`;
              }
              return (
                <div key={index} className="waypoint-item-container">
                  {legCalc && (
                    <div className="leg-calculation-line">
                      <span>⬇️ {legCalc}</span>
                    </div>
                  )}
                  <div className="waypoint-item">
                    <span className="wp-index">{index + 1}</span>
                    <div className="wp-body">
                      <span className="wp-name" title={label}>{label}</span>
                      {getWaypointRoleBadge(index, waypoints.length)}
                    </div>
                    <div className="wp-item-actions">
                      <button 
                        disabled={index === 0} 
                        onClick={() => moveWaypoint(index, 'up')}
                        title="Move Up"
                        className="arrow-btn"
                      >
                        ▲
                      </button>
                      <button 
                        disabled={index === waypoints.length - 1} 
                        onClick={() => moveWaypoint(index, 'down')}
                        title="Move Down"
                        className="arrow-btn"
                      >
                        ▼
                      </button>
                      <button 
                        onClick={() => deleteWaypoint(index)} 
                        title="Delete Waypoint"
                        className="delete-wp-btn"
                      >
                        ❌
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="corridor-slider-group" style={{ marginTop: '14px' }}>
            <label>Safety Diversion Boundary: <strong>{corridorNm} NM</strong></label>
            <input 
              type="range" 
              min="5" 
              max="50" 
              step="5"
              value={corridorNm}
              onChange={(e) => setCorridorNm(parseInt(e.target.value))}
            />
          </div>

          <label className="corridor-filter-toggle" style={{ marginTop: '10px', display: 'flex' }}>
            <input 
              type="checkbox" 
              checked={isCorridorFilterActive}
              onChange={(e) => setIsCorridorFilterActive(e.target.checked)}
            />
            <span>🎯 Filter Map by Task Corridor</span>
          </label>

          {waypoints.length >= 2 && (
            <div className={`route-hazard-alert ${routeHazardsCount > 0 ? 'warning' : 'safe'}`} style={{ marginTop: '12px' }}>
              {routeHazardsCount > 0 ? (
                <span>⚠️ <strong>{routeHazardsCount} Hazards</strong> inside the {corridorNm} NM diversion boundary!</span>
              ) : (
                <span>✅ Corridor is clear of active hazards.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
