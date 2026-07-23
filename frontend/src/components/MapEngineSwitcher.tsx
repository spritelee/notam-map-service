import React, { useState, useRef, useEffect } from 'react';

interface MapEngineSwitcherProps {
  mapEngine: 'leaflet' | 'maplibre';
  setMapEngine: (engine: 'leaflet' | 'maplibre') => void;
}

export const MapEngineSwitcher: React.FC<MapEngineSwitcherProps> = ({
  mapEngine,
  setMapEngine
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="floating-engine-switcher"
      style={{
        position: 'absolute',
        top: '75px',
        right: '16px',
        zIndex: 1000,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Subtle Floating Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle Map Engine (Tester Mode)"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '20px',
          background: mapEngine === 'maplibre' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: mapEngine === 'maplibre' ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid rgba(255, 255, 255, 0.15)',
          color: mapEngine === 'maplibre' ? '#e9d5ff' : '#cbd5e1',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.2s ease'
        }}
      >
        <span style={{ fontSize: '13px' }}>{mapEngine === 'maplibre' ? '⚡' : '🍃'}</span>
        <span>{mapEngine === 'maplibre' ? 'WebGL' : 'Leaflet'}</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>▼</span>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '36px',
            right: '0',
            width: '210px',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '2px 6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Map Engine (Tester Switch)
          </div>

          <button
            type="button"
            onClick={() => {
              setMapEngine('leaflet');
              setIsOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '6px',
              border: mapEngine === 'leaflet' ? '1px solid #38bdf8' : '1px solid transparent',
              background: mapEngine === 'leaflet' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: mapEngine === 'leaflet' ? '#38bdf8' : '#e2e8f0',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🍃</span>
              <span>Leaflet (Default)</span>
            </div>
            {mapEngine === 'leaflet' && <span style={{ fontSize: '11px' }}>✓</span>}
          </button>

          <button
            type="button"
            onClick={() => {
              setMapEngine('maplibre');
              setIsOpen(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '6px',
              border: mapEngine === 'maplibre' ? '1px solid #a855f7' : '1px solid transparent',
              background: mapEngine === 'maplibre' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
              color: mapEngine === 'maplibre' ? '#c084fc' : '#e2e8f0',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚡</span>
              <span>MapLibre (WebGL GPU)</span>
            </div>
            {mapEngine === 'maplibre' && <span style={{ fontSize: '11px' }}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
};
