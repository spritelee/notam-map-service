import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FeatureCollection } from 'geojson';

interface NotamMapProps {
  filteredData: FeatureCollection | null;
  selectedNotam: any;
  onSelectNotam: (notam: any) => void;
  bgaTurnpoints: any;
  layers: any;
}

// Sub-component to pan to selected NOTAM
const MapPanController = ({ selectedNotam }: { selectedNotam: any }) => {
  const map = useMap();
  useEffect(() => {
    if (selectedNotam && selectedNotam.geometry) {
      const geoJsonLayer = L.geoJSON(selectedNotam as any);
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 11 });
      }
    }
  }, [selectedNotam, map]);
  return null;
};

const getHazardIcon = (type: string) => {
  const t = (type || '').toUpperCase();
  if (t.includes('WINCH') || t.includes('GLIDER')) return '🦅';
  if (t.includes('PARACHUTE') || t.includes('DROP')) return '🪂';
  if (t.includes('UAS') || t.includes('DRONE')) return '🛸';
  if (t.includes('OBSTACLE') || t.includes('CRANE') || t.includes('MAST')) return '🏗️';
  if (t.includes('FORMATION') || t.includes('TRANSIT') || t.includes('JET')) return '✈️';
  if (t.includes('DANGER') || t.includes('RESTRICTED') || t.includes('TDA')) return '🔴';
  return '⚠️';
};

const getHazardColor = (type: string) => {
  const t = (type || '').toUpperCase();
  if (t.includes('DANGER') || t.includes('RESTRICTED') || t.includes('TDA')) return '#ef4444'; // Red
  if (t.includes('PARACHUTE') || t.includes('DROP')) return '#f97316'; // Orange
  if (t.includes('WINCH') || t.includes('GLIDER')) return '#eab308'; // Yellow
  if (t.includes('UAS') || t.includes('DRONE')) return '#a855f7'; // Purple
  if (t.includes('FORMATION') || t.includes('TRANSIT')) return '#06b6d4'; // Cyan
  if (t.includes('OBSTACLE') || t.includes('CRANE')) return '#94a3b8'; // Gray
  return '#38bdf8'; // Blue default
};

const createDivIcon = (emoji: string, color: string, isSelected: boolean) => {
  return L.divIcon({
    className: 'custom-hazard-pin-container',
    html: `<div class="custom-hazard-pin ${isSelected ? 'selected' : ''}" style="border-color: ${color};">
            <span class="pin-emoji">${emoji}</span>
           </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
};

const getFeatureAreaEstimate = (feature: any) => {
  const geom = feature.geometry;
  if (!geom) return 0;
  if (geom.type === 'Point') return 0; // Points on top
  
  const coords = geom.coordinates;
  if (geom.type === 'Polygon' && coords && coords[0]) {
    let minX = 999, maxX = -999, minY = 999, maxY = -999;
    for (const pt of coords[0]) {
      const x = pt[0], y = pt[1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return (maxX - minX) * (maxY - minY);
  }
  return 0.01;
};

const formatAltitudeValue = (val: any, isUpper: boolean): string => {
  if (val === null || val === undefined) {
    return isUpper ? 'UNL' : 'SFC';
  }
  const fl = typeof val === 'string' ? parseInt(val) : val;
  if (isNaN(fl)) return String(val);
  if (fl === 0) return 'SFC';
  if (fl >= 999) return 'UNL';
  
  if (fl < 75) {
    const feet = fl * 100;
    const meters = Math.round(feet / 3.28084);
    return `${feet.toLocaleString()} ft (${meters.toLocaleString()} m)`;
  } else {
    return `FL${fl.toString().padStart(3, '0')}`;
  }
};

export const NotamMap: React.FC<NotamMapProps> = ({
  filteredData,
  selectedNotam,
  onSelectNotam,
  bgaTurnpoints,
  layers
}) => {
  // 1. SMART Z-INDEX SORTING: Large macro polygons drawn first (bottom), small local hazards on top
  const sortedFeatures = useMemo(() => {
    if (!filteredData || !filteredData.features) return [];
    return [...filteredData.features].sort((a, b) => {
      return getFeatureAreaEstimate(b) - getFeatureAreaEstimate(a);
    });
  }, [filteredData]);

  // Extract centroid/pins for small hazards so they pop out even inside big circles
  const localHazardPins = useMemo(() => {
    if (!filteredData || !filteredData.features) return [];
    return filteredData.features.filter((f: any) => {
      const geom = f.geometry;
      if (!geom) return false;
      const area = getFeatureAreaEstimate(f);
      // Include points AND small polygons (< 0.005 deg area, e.g. Drop zones & Winch sites)
      return geom.type === 'Point' || area < 0.005;
    }).map((f: any) => {
      let lat = 52.0, lng = 0.0;
      if (f.geometry.type === 'Point') {
        lng = f.geometry.coordinates[0];
        lat = f.geometry.coordinates[1];
      } else if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
        // Average coordinates to find center
        const pts = f.geometry.coordinates[0];
        let sumX = 0, sumY = 0;
        pts.forEach((p: number[]) => { sumX += p[0]; sumY += p[1]; });
        lng = sumX / pts.length;
        lat = sumY / pts.length;
      }
      return {
        feature: f,
        position: [lat, lng] as [number, number],
        emoji: getHazardIcon(f.properties?.hazard_type),
        color: getHazardColor(f.properties?.hazard_type),
        isSelected: selectedNotam?.properties?.notam_id === f.properties?.notam_id
      };
    });
  }, [filteredData, selectedNotam]);

  const getHazardStyle = (feature: any) => {
    const props = feature.properties || {};
    const type = props.hazard_type || '';
    const isSelected = selectedNotam?.properties?.notam_id === props.notam_id;
    const isQLineCoarse = props.geometry_source === 'qline_circle';
    const area = getFeatureAreaEstimate(feature);

    const color = getHazardColor(type);

    // 2. DYNAMIC OPACITY & STYLING
    let fillOpacity = 0.12;
    let weight = 1.8;
    let dashArray: string | undefined = undefined;

    if (area > 0.04 || isQLineCoarse) {
      // Large macro notices (e.g. 20-30 NM circles) -> Faint fill & dashed border
      fillOpacity = 0.03;
      weight = 1.2;
      dashArray = '5, 5';
    } else if (area < 0.003) {
      // Small local hazards -> Solid border & vibrant fill
      fillOpacity = 0.35;
      weight = 2.5;
    }

    if (isSelected) {
      return {
        color: '#ffffff',
        weight: 4,
        fillColor: color,
        fillOpacity: 0.6,
        dashArray: undefined
      };
    }

    return {
      color,
      weight,
      fillColor: color,
      fillOpacity,
      dashArray
    };
  };

  const onEachFeature = (feature: any, layer: any) => {
    const props = feature.properties || {};
    const lower = formatAltitudeValue(props.lower_fl, false);
    const upper = formatAltitudeValue(props.upper_fl, true);
    
    let parachuteWarning = '';
    if (props.hazard_type === 'PARACHUTE') {
      const txt = (props.raw_text || '').toUpperCase();
      const isUnknown = txt.includes('SUBJ') || txt.includes('ATC') || txt.includes('CALL') || txt.includes('NOTAM') || txt.includes('UNKNOWN') || txt.includes('VAR') || txt.includes('OPR') || txt.includes('AMDT') || txt.includes('EST');
      if (isUnknown) {
        parachuteWarning = `
          <div style="background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; padding: 8px; margin-top: 10px; border-radius: 4px; font-size: 11px;">
            <strong>⚠️ Activity Times Unknown / Variable:</strong> Call or radio nearest ATC / Drop Zone Operator to confirm if active before entering.
          </div>
        `;
      } else {
        parachuteWarning = `
          <div style="background: rgba(56, 189, 248, 0.15); border-left: 4px solid #38bdf8; padding: 8px; margin-top: 10px; border-radius: 4px; font-size: 11px;">
            <strong>ℹ️ Verify Drop Zone Activity:</strong> Call or radio ATC / Operator to confirm if active.
          </div>
        `;
      }
    }

    const popupContent = `
      <div class="popup-title">${props.hazard_label || props.hazard_type}</div>
      <div class="popup-meta">ID: <strong>${props.notam_id}</strong> (${props.q_code || ''})</div>
      <div class="popup-meta" style="margin-top: 4px;">Vertical: <strong>${lower} - ${upper}</strong></div>
      ${parachuteWarning}
      <div class="popup-desc" style="margin-top: 8px;">${props.raw_text || ''}</div>
    `;
    layer.bindPopup(popupContent, { maxWidth: 550, minWidth: 380 });
    layer.on({
      click: () => onSelectNotam(feature)
    });
  };

  const pointToLayer = (feature: any, latlng: L.LatLng) => {
    const props = feature.properties || {};
    const isSelected = selectedNotam?.properties?.notam_id === props.notam_id;
    const emoji = getHazardIcon(props.hazard_type);
    const color = getHazardColor(props.hazard_type);
    return L.marker(latlng, { icon: createDivIcon(emoji, color, isSelected) });
  };

  const sortedCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: sortedFeatures
  };

  return (
    <div className="map-container">
      <MapContainer
        center={[52.8, -1.2]} // Center UK
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* 1 & 2: Sorted GeoJSON Polygons with Dynamic Opacity */}
        {sortedFeatures.length > 0 && (
          <GeoJSON
            key={JSON.stringify((filteredData as any)?.meta || {}) + (selectedNotam?.properties?.notam_id || '')}
            data={sortedCollection}
            style={getHazardStyle}
            onEachFeature={onEachFeature}
            pointToLayer={pointToLayer}
          />
        )}

        {/* 3: High-Contrast Floating Icon Pins for Small / Local Hazards */}
        {localHazardPins.map((pin, i) => (
          <Marker
            key={i}
            position={pin.position}
            icon={createDivIcon(pin.emoji, pin.color, pin.isSelected)}
            eventHandlers={{
              click: () => onSelectNotam(pin.feature)
            }}
          >
            <Popup maxWidth={550} minWidth={380}>
              <div className="popup-title">{pin.feature.properties?.hazard_label || pin.feature.properties?.hazard_type}</div>
              <div className="popup-meta">ID: <strong>{pin.feature.properties?.notam_id}</strong></div>
              <div className="popup-meta" style={{ marginTop: '4px' }}>Vertical: <strong>{formatAltitudeValue(pin.feature.properties?.lower_fl, false)} - {formatAltitudeValue(pin.feature.properties?.upper_fl, true)}</strong></div>
              {pin.feature.properties?.hazard_type === 'PARACHUTE' && (
                (() => {
                  const txt = (pin.feature.properties?.raw_text || '').toUpperCase();
                  const isUnknown = txt.includes('SUBJ') || txt.includes('ATC') || txt.includes('CALL') || txt.includes('NOTAM') || txt.includes('UNKNOWN') || txt.includes('VAR') || txt.includes('OPR') || txt.includes('AMDT') || txt.includes('EST');
                  if (isUnknown) {
                    return (
                      <div style={{ background: 'rgba(239, 68, 68, 0.15)', borderLeft: '4px solid #ef4444', padding: '8px', marginTop: '10px', borderRadius: '4px', fontSize: '11px' }}>
                        <strong>⚠️ Activity Times Unknown / Variable:</strong> Call or radio nearest ATC / Drop Zone Operator to confirm if active before entering.
                      </div>
                    );
                  } else {
                    return (
                      <div style={{ background: 'rgba(56, 189, 248, 0.15)', borderLeft: '4px solid #38bdf8', padding: '8px', marginTop: '10px', borderRadius: '4px', fontSize: '11px' }}>
                        <strong>ℹ️ Verify Drop Zone Activity:</strong> Call or radio ATC / Operator to confirm if active.
                      </div>
                    );
                  }
                })()
              )}
              <div className="popup-desc" style={{ marginTop: '6px' }}>{pin.feature.properties?.raw_text}</div>
            </Popup>
          </Marker>
        ))}

        {/* BGA Turnpoint Markers */}
        {layers.bgaTurnpoints && bgaTurnpoints?.features?.map((f: any, i: number) => {
          const [lon, lat] = f.geometry.coordinates;
          const createBgaDivIcon = (code: string) => {
            return L.divIcon({
              className: 'bga-turnpoint-icon',
              html: `<div class="bga-marker-dot"></div><div class="bga-marker-label">${code}</div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            });
          };

          return (
            <Marker 
              key={`bga-tp-${i}`} 
              position={[lat, lon]}
              icon={createBgaDivIcon(f.properties.code)}
            >
              <Popup>
                <div style={{ fontWeight: 'bold' }}>BGA Turnpoint: {f.properties.code}</div>
                <div>{f.properties.name}</div>
                <div>Elevation: {f.properties.elevation_ft} ft</div>
              </Popup>
            </Marker>
          );
        })}

        <MapPanController selectedNotam={selectedNotam} />
      </MapContainer>
    </div>
  );
};
