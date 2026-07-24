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
            <strong>🕒 Feed Freshness & Degraded Status:</strong>
            <p style={{ margin: '4px 0 8px 0' }}>
              Check the live header status pill for feed ingestion timestamp (<em>Data as of HH:MM UTC</em>) and feed health alerts (<em>⚠️ Feed Degraded</em>).
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
                <strong>Altitude & Date Filtering:</strong> Drag the Floor/Ceiling range sliders to select your planned flight band. Filter hazards active Today, Tomorrow, or this Week relative to the current live feed.
              </li>
              <li>
                <strong>BGA Turnpoint Task Planner & Leg Calculations:</strong> 
                <br />
                Search BGA turnpoints or airfields via the search bar or click green markers on the map. View real-time leg distance and magnetic track heading (<code>⬇️ XX NM @ YY°</code>) between waypoints, reorder points with ▲/▼ arrows, and inspect total task distance. Set your safety diversion boundary (5–50 NM) to isolate hazards along your route.
              </li>
              <li>
                <strong>Observation Zones & Task Options:</strong> Tap <strong>⚙️</strong> on any waypoint to configure Observation Zones (Cylinder, FAI Sector, Start/Finish Line, Keyhole, Finish Ring) with custom radius and angle parameters. Toggle Assigned Area Task (AAT) or PEV Start Gate options.
              </li>
              <li>
                <strong>Task & NOTAM Synchronizer:</strong>
                <br />
                - <strong>WeGlide:</strong> Declare planned task routes directly to the WeGlide platform.
                <br />
                - <strong>LXNAV Connect:</strong> Sync task <code>.cup</code> files and corridor-filtered NOTAM <code>.openair</code> files directly to Dropbox or Google Drive.
                <br />
                - <strong>Share & QR Code:</strong> Generate instant share links and QR codes to scan and load tasks directly into cockpit devices.
              </li>
              <li>
                <strong>Unplaceable Notices:</strong> Brief notices whose coordinates couldn't be resolved automatically stay listed under the <strong>Unplaceable</strong> drawer to prevent silent data loss.
              </li>
              <li>
                <strong>Device & Task Exports:</strong> Download filtered notices as <strong>.openair</strong> (XCSoar / LX) or <strong>.sua</strong> (ClearNav / Oudie), plus <strong>.igc</strong> Task Declarations, <strong>.cup</strong> (SeeYou), and <strong>.tsk</strong> (XCSoar XML).
              </li>
            </ul>
          </div>

          <div className="guide-section">
            <h3>📱 Mobile Layout ("Lite" Version)</h3>
            <ul>
              <li>
                <strong>Workbench Toggle:</strong> The sidebar is hidden on mobile to maximize map area. Tapping the floating <strong>⚙️ Workbench</strong> button in the bottom right slides in control options. Tapping <strong>✕</strong> slides it shut.
              </li>
              <li>
                <strong>Tabbed Navigation:</strong>
                <br />
                - <strong>🗂️ Filters:</strong> Access layer toggles, altitude/date sliders, and collapsible OpenAir/SUA export buttons.
                <br />
                - <strong>🛰️ Route:</strong> Complete BGA Task Planner with autocomplete search, waypoint reordering, Observation Zone configuration, QR Code generator, and WeGlide/LXNAV Connect sync.
                <br />
                - <strong>⚠️ Unplaceable:</strong> View unplaceable notices with live hazard count badge.
              </li>
              <li>
                <strong>Details Bottom Sheet:</strong> Tapping any hazard or marker on the mobile map slides up a bottom details card. Tap <strong>🔍 Center on Map</strong> to focus the camera directly on the hazard shape.
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
