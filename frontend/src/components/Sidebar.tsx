import React from 'react';
import { LayerControl } from './LayerControl';
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
  showUnplaceableOnly: boolean;
  setShowUnplaceableOnly: (val: boolean) => void;
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
  showUnplaceableOnly,
  setShowUnplaceableOnly
}) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>NOTAM Map Service</h1>
        <div className="live-status-pill">
          <span className="dot"></span> NATS UK Live Feed ({visibleNotamsCount} / {totalNotamsCount})
        </div>
      </div>

      <div className="sidebar-content">
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
        />

        <UnplaceableDrawer 
          unplaceableNotams={unplaceableNotams}
          onSelectNotam={onSelectNotam}
          selectedNotamId={selectedNotamId}
        />

        <div className="export-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="action-btn export-btn" onClick={onExportOpenAir}>
            📥 Download .openair (XCSoar / LX)
          </button>
          <button className="action-btn export-btn secondary" onClick={onExportSua}>
            📥 Download .sua (ClearNav / Oudie)
          </button>
        </div>
      </div>
    </div>
  );
};
