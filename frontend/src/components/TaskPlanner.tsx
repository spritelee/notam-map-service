import React, { useState } from 'react';
import { TaskSynchronizer } from './TaskSynchronizer';

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
  onActivateTurnpoints?: () => void;
  observationZones: any[];
  setObservationZones: React.Dispatch<React.SetStateAction<any[]>>;
  bgaTurnpointsActive?: boolean;
  onToggleBgaTurnpoints?: () => void;
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
  setWaypoints,
  onActivateTurnpoints,
  observationZones,
  setObservationZones,
  bgaTurnpointsActive,
  onToggleBgaTurnpoints
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

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
    setObservationZones(prev => {
      const nextZones = prev.filter((_, idx) => idx !== index);
      // Re-evaluate start/finish types
      if (nextZones.length > 0) {
        nextZones[0] = { ...nextZones[0], type: 'Line', radius: 500 };
      }
      if (nextZones.length > 1) {
        nextZones[nextZones.length - 1] = { ...nextZones[nextZones.length - 1], type: 'Line', radius: 500 };
      }
      for (let i = 1; i < nextZones.length - 1; i++) {
        if (nextZones[i].type === 'Line' || nextZones[i].type === 'Ring') {
          nextZones[i] = { ...nextZones[i], type: 'Sector', radius: 10000, angle: 90 };
        }
      }
      return nextZones;
    });
  };

  const moveWaypoint = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    setWaypoints(prev => {
      const nextList = [...prev];
      if (targetIdx >= 0 && targetIdx < nextList.length) {
        const temp = nextList[index];
        nextList[index] = nextList[targetIdx];
        nextList[targetIdx] = temp;
      }
      return nextList;
    });
    setObservationZones(prev => {
      const nextZones = [...prev];
      if (targetIdx >= 0 && targetIdx < nextZones.length) {
        const temp = nextZones[index];
        nextZones[index] = nextZones[targetIdx];
        nextZones[targetIdx] = temp;
      }
      // Re-evaluate start/finish types for the new positions
      if (nextZones.length > 0) {
        nextZones[0] = { ...nextZones[0], type: 'Line', radius: 500 };
      }
      if (nextZones.length > 1) {
        nextZones[nextZones.length - 1] = { ...nextZones[nextZones.length - 1], type: 'Line', radius: 500 };
      }
      // Re-evaluate any middle point that might have been a start/finish
      for (let i = 1; i < nextZones.length - 1; i++) {
        if (nextZones[i].type === 'Line' || nextZones[i].type === 'Ring') {
          nextZones[i] = { ...nextZones[i], type: 'Sector', radius: 10000, angle: 90 };
        }
      }
      return nextZones;
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

      <div className="bga-toggle-card">
        <label className={`bga-turnpoint-toggle-label ${bgaTurnpointsActive ? 'active' : ''}`}>
          <input 
            type="checkbox" 
            checked={bgaTurnpointsActive || false} 
            onChange={onToggleBgaTurnpoints} 
          />
          <span>🟢 Show BGA Turnpoints (April 2026 rev A)</span>
        </label>
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
          onFocus={onActivateTurnpoints}
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
          {/* Task Summary Card */}
          <div className="task-summary-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '500' }}>📏 Total Task Distance:</span>
            <strong style={{ fontSize: '13px', color: 'var(--accent-cyan)' }}>
              {totalDistance.toFixed(1)} NM / {(totalDistance * 1.852).toFixed(1)} km
            </strong>
          </div>
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
                <div key={index} className="waypoint-item-container" style={{ display: 'flex', flexDirection: 'column' }}>
                  {legCalc && (
                    <div className="leg-calculation-line">
                      <span>⬇️ {legCalc}</span>
                    </div>
                  )}
                  <div className="waypoint-item" style={{ borderBottomLeftRadius: expandedIndex === index ? '0' : '4px', borderBottomRightRadius: expandedIndex === index ? '0' : '4px' }}>
                    <span className="wp-index">{index + 1}</span>
                    <div className="wp-body">
                      <span className="wp-name" title={label}>{label}</span>
                      {getWaypointRoleBadge(index, waypoints.length)}
                    </div>
                    <div className="wp-item-actions" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button 
                        onClick={(e) => {
                          const isExpanding = expandedIndex !== index;
                          setExpandedIndex(isExpanding ? index : null);
                          if (isExpanding) {
                            setTimeout(() => {
                              const el = e.currentTarget.closest('.waypoint-item-container');
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }
                            }, 50);
                          }
                        }} 
                        title="Configure Observation Zone"
                        className="arrow-btn"
                        style={{ color: expandedIndex === index ? 'var(--accent-cyan)' : 'inherit', border: expandedIndex === index ? '1px solid var(--accent-cyan)' : '1px solid transparent', borderRadius: '3px' }}
                      >
                        ⚙️
                      </button>
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

                  {expandedIndex === index && (
                    <div className="oz-config-panel" style={{ padding: '8px 12px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderTop: 'none', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>📐 Observation Zone Configuration</span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'left' }}>Type</label>
                          <select
                            value={observationZones[index]?.type || 'Cylinder'}
                            onChange={(e) => {
                              const newType = e.target.value as any;
                              setObservationZones(prev => {
                                const next = [...prev];
                                next[index] = {
                                  ...next[index],
                                  type: newType,
                                  radius: newType === 'Line' ? 500 : (newType === 'Ring' ? 3000 : (newType === 'Sector' ? 10000 : (newType === 'Keyhole' ? 10000 : 500)))
                                };
                                return next;
                              });
                            }}
                            style={{ background: 'var(--bg-card)', color: 'inherit', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '4px', fontSize: '11px', outline: 'none' }}
                          >
                            <option value="Cylinder">Cylinder (Barrel)</option>
                            <option value="Sector">FAI Sector</option>
                            <option value="Line">Start/Finish Line</option>
                            <option value="Keyhole">Keyhole Sector</option>
                            <option value="Ring">Finish Ring</option>
                          </select>
                        </div>

                        <div style={{ width: '85px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'left' }}>Radius (km)</label>
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="0.1"
                            value={((observationZones[index]?.radius || 500) / 1000).toString()}
                            onChange={(e) => {
                              const newRadiusKm = parseFloat(e.target.value) || 0.1;
                              setObservationZones(prev => {
                                const next = [...prev];
                                next[index] = {
                                  ...next[index],
                                  radius: Math.round(newRadiusKm * 1000)
                                };
                                return next;
                              });
                            }}
                            style={{ background: 'var(--bg-card)', color: 'inherit', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                          />
                        </div>

                        {['Sector', 'Keyhole'].includes(observationZones[index]?.type) && (
                          <div style={{ width: '65px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <label style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'left' }}>Angle (°)</label>
                            <input
                              type="number"
                              min="10"
                              max="360"
                              step="5"
                              value={observationZones[index]?.angle || 90}
                              onChange={(e) => {
                                const newAngle = parseInt(e.target.value) || 90;
                                setObservationZones(prev => {
                                  const next = [...prev];
                                  next[index] = {
                                    ...next[index],
                                    angle: newAngle
                                  };
                                  return next;
                                });
                              }}
                              style={{ background: 'var(--bg-card)', color: 'inherit', border: '1px solid var(--border-color)', borderRadius: '3px', padding: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
            <>
              <div className={`route-hazard-alert ${routeHazardsCount > 0 ? 'warning' : 'safe'}`} style={{ marginTop: '12px' }}>
                {routeHazardsCount > 0 ? (
                  <span>⚠️ <strong>{routeHazardsCount} Hazards</strong> inside the {corridorNm} NM diversion boundary!</span>
                ) : (
                  <span>✅ Corridor is clear of active hazards.</span>
                )}
              </div>
              <TaskSynchronizer waypoints={waypoints} corridorNm={corridorNm} observationZones={observationZones} bgaTurnpoints={bgaTurnpoints} />
            </>
          )}
        </div>
      )}
    </div>
  );
};
