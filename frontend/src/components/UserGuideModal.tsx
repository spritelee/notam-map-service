import React from 'react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📖 Workstation User Guide</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close guide modal">✕</button>
        </div>
        <div className="modal-content">
          <div className="guide-safety-warning" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '12px', marginBottom: '16px', fontSize: '12px', lineHeight: '1.5' }}>
            <strong>⚠️ UK Flight Safety Notice & Disclaimer:</strong>
            <p style={{ margin: '4px 0 8px 0' }}>
              This visualization workstation is an unofficial tool and is <strong>NOT</strong> a replacement for an official aeronautical briefing. Under the UK Air Navigation Order, the Pilot-in-Command (PIC) retains sole, non-delegable responsibility for the safe conduct of the flight. Always cross-reference your flight planning with the official <strong>UK AIS Portal (PIB)</strong> before takeoff.
            </p>
            <strong>🔒 Safety Improvement - Unplaceable Notices:</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              Unlike other platforms that silently omit notices without valid spatial coordinates, this tool isolates them in the <strong>Unplaceable Notices</strong> panel. You <strong>MUST</strong> check the Unplaceable list manually to ensure no critical hazards are missed.
            </p>
          </div>

          <div className="guide-section">
            <h3>💻 Web Workstation (Desktop & Laptop)</h3>
            <ul>
              <li>
                <strong>Aeronautical Information Layers:</strong> Toggle layer checkboxes in the left panel to show/hide specific hazards. Features are color-coded (🔴 Red for Danger areas, 🟡 Yellow for Winch launch lines, 🪂 Orange for Drop Zones, 🟣 Purple for Drone areas & GPS Jamming).
              </li>
              <li>
                <strong>Altitude Filtering:</strong> Drag the Floor/Ceiling range sliders to select your planned flight band. Only hazards intersecting this vertical band will remain on the map.
              </li>
              <li>
                <strong>Date Horizon:</strong> Filter hazards active Today, Tomorrow, or this Week relative to the current live feed.
              </li>
              <li>
                <strong>BGA Turnpoint Task Planner:</strong> 
                <br />
                Click green BGA turnpoint markers on the map and tap <strong>➕ Add to Task</strong> (or search using the search bar) to define waypoint routes. Toggle <strong>Filter Map by Task Corridor</strong> and set your safety diversion boundary (5–50 NM) to isolate hazards along your route and view hazard collision alerts.
              </li>
              <li>
                <strong>Unplaceable Notices:</strong> Brief notices whose coordinates couldn't be resolved automatically under the **Unplaceable** list to prevent silent data loss.
              </li>
              <li>
                <strong>Device Export:</strong> Download your filtered notices as <strong>.openair</strong> (for XCSoar / LX) or <strong>.sua</strong> (for Oudie / ClearNav). If a corridor filter is active, only overlapping notices are exported.
              </li>
            </ul>
          </div>

          <div className="guide-section">
            <h3>📱 Mobile Layout ("Lite" Version)</h3>
            <ul>
              <li>
                <strong>Workbench Toggle:</strong> The sidebar is hidden. Tapping the floating <strong>⚙️ Workbench</strong> button in the bottom right slides in control options. Tapping <strong>✕ Map View</strong> slides it shut.
              </li>
              <li>
                <strong>Tabbed Navigation:</strong> Controls are grouped into **Filters** (layers & sliders), **Route** (waypoints list & corridor sliders), and **Unplaceable** tabs. Live badges indicate counts.
              </li>
              <li>
                <strong>Details Bottom Sheet:</strong> Tapping any marker or shape on the mobile map slides up a bottom details card. Tap <strong>🔍 Center on Map</strong> in the card to pan directly to the hazard shape.
              </li>
              <li>
                <strong>Export Buttons:</strong> File download buttons are tucked away inside the collapsible <em>OpenAir & SUA Exports</em> accordion at the bottom of the Filters tab.
              </li>
            </ul>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-action-btn" onClick={onClose}>Got it, let's fly!</button>
        </div>
      </div>
    </div>
  );
};
