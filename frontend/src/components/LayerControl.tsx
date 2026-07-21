import React from 'react';

interface LayerControlProps {
  layers: {
    tda: boolean;
    dropZone: boolean;
    winch: boolean;
    drone: boolean;
    fastJet: boolean;
    obstacle: boolean;
    aerodrome: boolean;
    other: boolean;
    bgaTurnpoints: boolean;
  };
  setLayers: React.Dispatch<React.SetStateAction<any>>;
  altitudeFloor: number;
  setAltitudeFloor: (alt: number) => void;
  altitudeCeiling: number;
  setAltitudeCeiling: (alt: number) => void;
  dateFilters: {
    today: boolean;
    plus1: boolean;
    plus2: boolean;
    plus7: boolean;
  };
  setDateFilters: React.Dispatch<React.SetStateAction<any>>;
  unplaceableCount: number;
  showUnplaceableOnly: boolean;
  setShowUnplaceableOnly: (val: boolean) => void;
}

const formatAltitude = (fl: number): string => {
  if (fl === 0) return 'SFC';
  if (fl < 75) {
    const feet = fl * 100;
    const meters = Math.round(feet / 3.28084);
    return `${feet.toLocaleString()} ft (${meters.toLocaleString()} m)`;
  } else {
    return `FL${fl.toString().padStart(3, '0')}`;
  }
};

export const LayerControl: React.FC<LayerControlProps> = ({
  layers,
  setLayers,
  altitudeFloor,
  setAltitudeFloor,
  altitudeCeiling,
  setAltitudeCeiling,
  dateFilters,
  setDateFilters,
  unplaceableCount,
  showUnplaceableOnly,
  setShowUnplaceableOnly
}) => {
  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleDateFilter = (key: string) => {
    setDateFilters((prev: any) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="panel-section layer-control-panel">
      <div className="section-title">
        <span>🗂️ Aeronautical Hazard Layers</span>
      </div>
      <div className="layer-grid">
        <label className="layer-toggle red">
          <input type="checkbox" checked={layers.tda} onChange={() => toggleLayer('tda')} />
          <span>🔴 Danger / Restricted (TDA)</span>
        </label>
        <label className="layer-toggle orange">
          <input type="checkbox" checked={layers.dropZone} onChange={() => toggleLayer('dropZone')} />
          <span>🪂 Parachute Drop Zones</span>
        </label>
        <label className="layer-toggle yellow">
          <input type="checkbox" checked={layers.winch} onChange={() => toggleLayer('winch')} />
          <span>🦅 Gliding Operations (Winch/Airfields/Comps)</span>
        </label>
        <label className="layer-toggle purple">
          <input type="checkbox" checked={layers.drone} onChange={() => toggleLayer('drone')} />
          <span>🛸 Drone / BVLOS Areas</span>
        </label>
        <label className="layer-toggle blue">
          <input type="checkbox" checked={layers.fastJet} onChange={() => toggleLayer('fastJet')} />
          <span>✈️ Fast Jet / Red Arrows</span>
        </label>
        <label className="layer-toggle gray">
          <input type="checkbox" checked={layers.obstacle} onChange={() => toggleLayer('obstacle')} />
          <span>🏗️ Masts & Cranes</span>
        </label>
        <label className="layer-toggle dark-gray">
          <input type="checkbox" checked={layers.aerodrome} onChange={() => toggleLayer('aerodrome')} />
          <span>🏢 Aerodromes & Procedures</span>
        </label>
        <label className="layer-toggle white">
          <input type="checkbox" checked={layers.other} onChange={() => toggleLayer('other')} />
          <span>⚪ Other / Nav Warnings</span>
        </label>
      </div>

      <div className="section-title" style={{ marginTop: '16px' }}>
        <span>🏔️ Altitude Floor: {formatAltitude(altitudeFloor)}</span>
      </div>
      <input 
        type="range" 
        min="0" 
        max="195" 
        step="5"
        value={altitudeFloor}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          setAltitudeFloor(val);
          if (val > altitudeCeiling) {
            setAltitudeCeiling(val);
          }
        }}
        className="altitude-slider"
      />

      <div className="section-title" style={{ marginTop: '12px' }}>
        <span>🏔️ Altitude Ceiling: {formatAltitude(altitudeCeiling)}</span>
      </div>
      <input 
        type="range" 
        min="0" 
        max="195" 
        step="5"
        value={altitudeCeiling}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          setAltitudeCeiling(val);
          if (val < altitudeFloor) {
            setAltitudeFloor(val);
          }
        }}
        className="altitude-slider"
      />

      <div className="section-title" style={{ marginTop: '16px' }}>
        <span>📅 Time Horizon (Relative to Today)</span>
      </div>
      <div className="layer-grid" style={{ gap: '6px' }}>
        <label className="layer-toggle">
          <input 
            type="checkbox" 
            checked={dateFilters.today} 
            onChange={() => toggleDateFilter('today')} 
          />
          <span>Today</span>
        </label>
        <label className="layer-toggle">
          <input 
            type="checkbox" 
            checked={dateFilters.plus1} 
            onChange={() => toggleDateFilter('plus1')} 
          />
          <span>Tomorrow (+1 Day)</span>
        </label>
        <label className="layer-toggle">
          <input 
            type="checkbox" 
            checked={dateFilters.plus2} 
            onChange={() => toggleDateFilter('plus2')} 
          />
          <span>Day After (+2 Days)</span>
        </label>
        <label className="layer-toggle">
          <input 
            type="checkbox" 
            checked={dateFilters.plus7} 
            onChange={() => toggleDateFilter('plus7')} 
          />
          <span>Next Week (+7 Days)</span>
        </label>
      </div>

      <div className="section-title" style={{ marginTop: '16px' }}>
        <span>📍 Navigation References</span>
      </div>
      <div className="layer-grid">
        <label className="layer-toggle green">
          <input type="checkbox" checked={layers.bgaTurnpoints} onChange={() => toggleLayer('bgaTurnpoints')} />
          <span>🟢 Show BGA Turnpoints (Official)</span>
        </label>
      </div>

      <div className="unplaceable-badge-container" style={{ marginTop: '14px' }}>
        <button 
          className={`unplaceable-filter-btn ${showUnplaceableOnly ? 'active' : ''}`}
          onClick={() => setShowUnplaceableOnly(!showUnplaceableOnly)}
        >
          ⚠️ {unplaceableCount} Unplaceable Notices {showUnplaceableOnly ? '(Showing)' : '(Review)'}
        </button>
      </div>
    </div>
  );
};
