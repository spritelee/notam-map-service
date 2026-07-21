import React from 'react';

interface UnplaceableDrawerProps {
  unplaceableNotams: any[];
  onSelectNotam: (notam: any) => void;
  selectedNotamId: string | null;
}

export const UnplaceableDrawer: React.FC<UnplaceableDrawerProps> = ({
  unplaceableNotams,
  onSelectNotam,
  selectedNotamId
}) => {
  if (unplaceableNotams.length === 0) return null;

  return (
    <div className="unplaceable-drawer">
      <div className="unplaceable-header">
        <span className="warning-icon">⚠️</span>
        <div>
          <h4>Unplaceable Notices ({unplaceableNotams.length})</h4>
          <p>Geometry could not be reliably extracted. Manual pilot review required (Never silently lost).</p>
        </div>
      </div>
      <div className="unplaceable-list">
        {unplaceableNotams.map((n, idx) => {
          const props = n.properties || {};
          const isSelected = selectedNotamId === props.notam_id;
          return (
            <div 
              key={idx} 
              className={`unplaceable-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectNotam(n)}
            >
              <div className="card-top">
                <span className="notam-id-badge">{props.notam_id}</span>
                <span className="q-code">{props.q_code || 'Q-Code'}</span>
              </div>
              <div className="raw-text-snippet">{props.raw_text || 'No text'}</div>
              <div className="flags-badge">
                Flag: {props.flags ? props.flags.join(', ') : 'Unresolved Coordinate'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
