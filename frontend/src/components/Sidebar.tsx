import React, { useState } from 'react';
import { LayerControl } from './LayerControl';
import { TaskPlanner } from './TaskPlanner';
import { UnplaceableDrawer } from './UnplaceableDrawer';

interface SidebarProps {
  layers: any;
  setLayers: React.Dispatch<React.SetStateAction<any>>;
  altitudeFloor: number;
  setAltitudeFloor: (alt: number) => void;
  altitudeCeiling: number;
  setAltitudeCeiling: (alt: number) => void;
  dateFilters: {
    today: boolean;
    plus1: boolean;
    plus2: boolean;
    thisWeek: boolean;
  };
  setDateFilters: React.Dispatch<React.SetStateAction<any>>;
  unplaceableNotams: any[];
  onSelectNotam: (notam: any) => void;
  selectedNotamId: string | null;
  totalNotamsCount: number;
  visibleNotamsCount: number;
  onExportOpenAir: () => void;
  onExportSua: () => void;
  onExportIgcTask: () => void;
  showUnplaceableOnly: boolean;
  setShowUnplaceableOnly: (val: boolean) => void;
  
  // Task Planner Props
  waypoints: [number, number][];
  clearRoute: () => void;
  corridorNm: number;
  setCorridorNm: (val: number) => void;
  isCorridorFilterActive: boolean;
  setIsCorridorFilterActive: (val: boolean) => void;
  bgaTurnpoints: any;
  setWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  routeHazardsCount: number;
  observationZones: any[];
  setObservationZones: React.Dispatch<React.SetStateAction<any[]>>;

  // Mobile layout props
  isMobile: boolean;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (val: boolean) => void;

  // Help Guide Support
  onOpenGuide: () => void;

  // Map Engine Switcher Props
  mapEngine: 'leaflet' | 'maplibre';
  setMapEngine: (engine: 'leaflet' | 'maplibre') => void;

  // Feed Staleness Metadata
  notamMeta?: { fetched_at?: string; feed_degraded?: boolean } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  layers,
  setLayers,
  altitudeFloor,
  setAltitudeFloor,
  altitudeCeiling,
  setAltitudeCeiling,
  dateFilters,
  setDateFilters,
  unplaceableNotams,
  onSelectNotam,
  selectedNotamId,
  totalNotamsCount,
  visibleNotamsCount,
  onExportOpenAir,
  onExportSua,
  onExportIgcTask,
  showUnplaceableOnly,
  setShowUnplaceableOnly,
  
  waypoints,
  clearRoute,
  corridorNm,
  setCorridorNm,
  isCorridorFilterActive,
  setIsCorridorFilterActive,
  bgaTurnpoints,
  setWaypoints,
  routeHazardsCount,
  observationZones,
  setObservationZones,

  isMobile,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,

  onOpenGuide,
  mapEngine,
  setMapEngine,
  notamMeta
}) => {
  const [activeTab, setActiveTab] = useState<'filters' | 'route' | 'unplaceable'>('filters');

  const formatDataAsOf = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return null;
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm} UTC`;
    } catch (e) {
      return null;
    }
  };

  const dataAsOfStr = formatDataAsOf(notamMeta?.fetched_at);

  // Helper to render the export buttons panel
  const renderExportSection = (isCompact = false) => (
    <div className={`export-section ${isCompact ? 'compact' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button className="action-btn export-btn" onClick={onExportOpenAir}>
        📥 Download .openair (XCSoar / LX)
      </button>
      <button className="action-btn export-btn secondary" onClick={onExportSua}>
        📥 Download .sua (ClearNav / Oudie)
      </button>
      {waypoints.length >= 2 && (
        <button 
          className="action-btn export-btn igc-btn" 
          onClick={onExportIgcTask}
          style={{ background: 'linear-gradient(135deg, #10b981, #047857)', border: 'none' }}
        >
          📝 Download .igc Task Declaration
        </button>
      )}
    </div>
  );

  // Helper to render UK flight safety disclaimer
  const renderDisclaimer = () => (
    <div 
      className="sidebar-disclaimer" 
      style={{ 
        marginTop: '16px', 
        fontSize: '10.5px', 
        opacity: 0.85, 
        color: '#94a3b8', 
        borderTop: '1px solid #334155', 
        paddingTop: '12px', 
        lineHeight: '1.4' 
      }}
    >
      <div style={{ marginBottom: '4px', fontWeight: 'bold', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
        ⚠️ UK Flight Safety Notice & Disclaimer
      </div>
      <div style={{ marginBottom: '6px' }}>
        Unofficial tool for supplemental situational awareness only. Always verify all NOTAMs against the official <strong>UK AIS Portal (PIB)</strong> before takeoff.
      </div>
      <div>
        <strong>🔒 Safety Feature:</strong> Notices with invalid coordinates are isolated under the <em>Unplaceable</em> tab instead of being silently ignored. Check these manually.
      </div>
    </div>
  );

  return (
    <div className={`sidebar ${isMobile ? 'mobile-drawer' : ''} ${isMobileSidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="brand-container">
            <img src="/favicon.png" alt="NOTAM Radar Logo" className="header-logo" />
            <h1>NOTAM Radar</h1>
          </div>
          {isMobile && (
            <button 
              className="close-drawer-btn" 
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close sidebar panel"
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
          <div className={`live-status-pill ${notamMeta?.feed_degraded ? 'degraded' : ''}`} style={{ marginTop: 0 }}>
            <span className={`dot ${notamMeta?.feed_degraded ? 'degraded-dot' : ''}`}></span>
            {notamMeta?.feed_degraded ? '⚠️ Feed Degraded' : 'UK Aeronautical Feed'} ({visibleNotamsCount} / {totalNotamsCount})
          </div>
          {dataAsOfStr && (
            <div className="data-as-of-pill" title="Timestamp of ingested NATS NOTAM feed cache">
              🕒 Data as of {dataAsOfStr}
            </div>
          )}
          <button className="user-guide-link-btn" onClick={onOpenGuide} title="View Workstation User Guide">
            📖 Guide
          </button>
        </div>
      </div>

      {isMobile && (
        <div className="mobile-tabs-header">
          <button 
            className={`tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
            onClick={() => setActiveTab('filters')}
          >
            🗂️ Filters
          </button>
          <button 
            className={`tab-btn ${activeTab === 'route' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('route');
              setLayers((prev: any) => ({ ...prev, bgaTurnpoints: true }));
            }}
          >
            🛰️ Route
            {waypoints.length > 0 && <span className="tab-badge">{waypoints.length}</span>}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'unplaceable' ? 'active' : ''}`}
            onClick={() => setActiveTab('unplaceable')}
          >
            ⚠️ Unplaceable
            {unplaceableNotams.length > 0 && (
              <span className="tab-badge warning-badge">{unplaceableNotams.length}</span>
            )}
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {!isMobile ? (
          // Desktop View: Stacked Layout
          <>
            <LayerControl 
              layers={layers}
              setLayers={setLayers}
              altitudeFloor={altitudeFloor}
              setAltitudeFloor={setAltitudeFloor}
              altitudeCeiling={altitudeCeiling}
              setAltitudeCeiling={setAltitudeCeiling}
              dateFilters={dateFilters}
              setDateFilters={setDateFilters}
              unplaceableCount={unplaceableNotams.length}
              showUnplaceableOnly={showUnplaceableOnly}
              setShowUnplaceableOnly={setShowUnplaceableOnly}
              mapEngine={mapEngine}
              setMapEngine={setMapEngine}
            />

            <TaskPlanner 
              waypoints={waypoints}
              clearRoute={clearRoute}
              corridorNm={corridorNm}
              setCorridorNm={setCorridorNm}
              isCorridorFilterActive={isCorridorFilterActive}
              setIsCorridorFilterActive={setIsCorridorFilterActive}
              routeHazardsCount={routeHazardsCount}
              bgaTurnpoints={bgaTurnpoints}
              setWaypoints={setWaypoints}
              onActivateTurnpoints={() => setLayers((prev: any) => ({ ...prev, bgaTurnpoints: true }))}
              observationZones={observationZones}
              setObservationZones={setObservationZones}
              bgaTurnpointsActive={layers.bgaTurnpoints}
              onToggleBgaTurnpoints={() => setLayers((prev: any) => ({ ...prev, bgaTurnpoints: !prev.bgaTurnpoints }))}
            />

            <UnplaceableDrawer 
              unplaceableNotams={unplaceableNotams}
              onSelectNotam={onSelectNotam}
              selectedNotamId={selectedNotamId}
            />

            {renderExportSection()}
          </>
        ) : (
          // Mobile View: Tabbed Layout
          <div className="mobile-tab-content">
            {activeTab === 'filters' && (
              <>
                <LayerControl 
                  layers={layers}
                  setLayers={setLayers}
                  altitudeFloor={altitudeFloor}
                  setAltitudeFloor={setAltitudeFloor}
                  altitudeCeiling={altitudeCeiling}
                  setAltitudeCeiling={setAltitudeCeiling}
                  dateFilters={dateFilters}
                  setDateFilters={setDateFilters}
                  unplaceableCount={unplaceableNotams.length}
                  showUnplaceableOnly={showUnplaceableOnly}
                  setShowUnplaceableOnly={setShowUnplaceableOnly}
                  mapEngine={mapEngine}
                  setMapEngine={setMapEngine}
                />
                <details className="mobile-export-accordion" style={{ marginTop: '16px' }}>
                  <summary>📥 OpenAir & SUA Exports</summary>
                  <div style={{ marginTop: '10px' }}>
                    {renderExportSection(true)}
                  </div>
                </details>
              </>
            )}

            {activeTab === 'route' && (
              <TaskPlanner 
                waypoints={waypoints}
                clearRoute={clearRoute}
                corridorNm={corridorNm}
                setCorridorNm={setCorridorNm}
                isCorridorFilterActive={isCorridorFilterActive}
                setIsCorridorFilterActive={setIsCorridorFilterActive}
                routeHazardsCount={routeHazardsCount}
                bgaTurnpoints={bgaTurnpoints}
                setWaypoints={setWaypoints}
                onActivateTurnpoints={() => setLayers((prev: any) => ({ ...prev, bgaTurnpoints: true }))}
                observationZones={observationZones}
                setObservationZones={setObservationZones}
                bgaTurnpointsActive={layers.bgaTurnpoints}
                onToggleBgaTurnpoints={() => setLayers((prev: any) => ({ ...prev, bgaTurnpoints: !prev.bgaTurnpoints }))}
              />
            )}

            {activeTab === 'unplaceable' && (
              <UnplaceableDrawer 
                unplaceableNotams={unplaceableNotams}
                onSelectNotam={onSelectNotam}
                selectedNotamId={selectedNotamId}
              />
            )}
          </div>
        )}
        {renderDisclaimer()}
      </div>
    </div>
  );
};
