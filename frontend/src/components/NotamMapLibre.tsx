import React, { useEffect, useRef, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';

interface NotamMapProps {
  filteredData: FeatureCollection | null;
  selectedNotam: any;
  onSelectNotam: (notam: any) => void;
  bgaTurnpoints: any;
  layers: any;
  
  waypoints: [number, number][];
  onAddWaypoint: (latlng: [number, number]) => void;
  corridorGeoJSON: any;
  observationZones: any[];

  // Mobile layout and double-click fix props
  isMobile: boolean;
  panToNotam: any;
  setPanToNotam: (val: any) => void;
}

const MAPLIBRE_DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark-tiles': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      ],
      tileSize: 256,
      attribution: '&copy; CARTO'
    }
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark-tiles',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

const getHazardIcon = (type: string) => {
  const t = (type || '').toUpperCase();
  if (t === 'GPS_JAMMING') return '📡';
  if (t === 'AIRSPACE_STATUS') return '🛑';
  if (t === 'LOW_LEVEL_HAZARD') return '🎆';
  if (t === 'GROUND_SERVICES') return '⛽';
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
  if (t === 'GPS_JAMMING') return '#d946ef';
  if (t === 'AIRSPACE_STATUS') return '#2563eb';
  if (t === 'LOW_LEVEL_HAZARD') return '#f43f5e';
  if (t === 'GROUND_SERVICES') return '#0d9488';
  if (t.includes('DANGER') || t.includes('RESTRICTED') || t.includes('TDA')) return '#ef4444';
  if (t.includes('PARACHUTE') || t.includes('DROP')) return '#f97316';
  if (t.includes('WINCH') || t.includes('GLIDER')) return '#eab308';
  if (t.includes('UAS') || t.includes('DRONE')) return '#a855f7';
  if (t.includes('FORMATION') || t.includes('TRANSIT')) return '#06b6d4';
  if (t.includes('OBSTACLE') || t.includes('CRANE')) return '#94a3b8';
  return '#38bdf8';
};

const getFeatureAreaEstimate = (feature: any) => {
  const geom = feature.geometry;
  if (!geom) return 0;
  if (geom.type === 'Point') return 0;
  
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

export const NotamMapLibre: React.FC<NotamMapProps> = ({
  filteredData,
  selectedNotam,
  onSelectNotam,
  bgaTurnpoints,
  layers,
  waypoints,
  onAddWaypoint,
  corridorGeoJSON,
  observationZones,
  isMobile,
  panToNotam,
  setPanToNotam
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const isMapLoadedRef = useRef<boolean>(false);

  // Data refs to prevent race condition during initial async map load
  const sortedGeoJSONRef = useRef<any>({ type: 'FeatureCollection', features: [] });
  const corridorGeoJSONRef = useRef<any>(null);
  const waypointsRef = useRef<[number, number][]>(waypoints);
  const ozGeoJSONRef = useRef<any>({ type: 'FeatureCollection', features: [] });

  const isAlreadyClosed = useMemo(() => {
    if (waypoints.length < 2) return false;
    const start = waypoints[0];
    const end = waypoints[waypoints.length - 1];
    return Math.abs(start[0] - end[0]) < 0.0001 && Math.abs(start[1] - end[1]) < 0.0001;
  }, [waypoints]);

  // 1. Prepare Enriched NOTAM Data for WebGL Sources
  const sortedGeoJSON = useMemo(() => {
    if (!filteredData || !filteredData.features) return { type: 'FeatureCollection', features: [] };
    
    const features = [...filteredData.features].sort((a, b) => {
      return getFeatureAreaEstimate(b) - getFeatureAreaEstimate(a);
    }).map((f: any) => {
      const props = f.properties || {};
      const type = props.hazard_type || '';
      const isSelected = selectedNotam?.properties?.notam_id === props.notam_id;
      const isQLineCoarse = props.geometry_source === 'qline_circle';
      const area = getFeatureAreaEstimate(f);
      const color = getHazardColor(type);

      // High-visibility opacity & stroke styling for WebGL GPU renderer
      let fillOpacity = 0.20;
      let strokeWidth = 2.5;
      let strokeColor = color;

      if (area > 0.04 || isQLineCoarse) {
        fillOpacity = 0.10;
        strokeWidth = 2.0;
      } else if (area < 0.003) {
        fillOpacity = 0.45;
        strokeWidth = 3.5;
      }

      if (isSelected) {
        strokeColor = '#ffffff';
        strokeWidth = 5.0;
        fillOpacity = 0.70;
      }

      return {
        ...f,
        properties: {
          ...props,
          fillColor: color,
          fillOpacity,
          strokeColor,
          strokeWeight: strokeWidth
        }
      };
    });

    return { type: 'FeatureCollection', features };
  }, [filteredData, selectedNotam]);

  // Compute Observation Zone Polygons & Lines GeoJSON
  const ozGeoJSON = useMemo(() => {
    const features: any[] = [];
    waypoints.forEach((pos, idx) => {
      const oz = observationZones && observationZones[idx];
      if (!oz) return;

      const type = oz.type;
      const radius = oz.radius;
      const angle = oz.angle || 90;
      const cosLat = Math.cos((pos[0] * Math.PI) / 180);

      if (type === 'Cylinder' || type === 'Ring') {
        const steps = 36;
        const coords: [number, number][] = [];
        for (let i = 0; i <= steps; i++) {
          const a = (i * 2 * Math.PI) / steps;
          const latOffset = (radius * Math.cos(a)) / 111111;
          const lngOffset = (radius * Math.sin(a)) / (111111 * cosLat);
          coords.push([pos[1] + lngOffset, pos[0] + latOffset]);
        }
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: {}
        });
      } else if (type === 'Line') {
        let heading = 0;
        if (idx === 0 && waypoints.length > 1) {
          const next = waypoints[1];
          heading = Math.atan2(next[1] - pos[1], next[0] - pos[0]) + Math.PI / 2;
        } else if (idx === waypoints.length - 1 && waypoints.length > 1) {
          const prev = waypoints[waypoints.length - 2];
          heading = Math.atan2(pos[1] - prev[1], pos[0] - prev[0]) + Math.PI / 2;
        } else if (waypoints.length > 1) {
          const prev = waypoints[idx - 1];
          heading = Math.atan2(pos[1] - prev[1], pos[0] - prev[0]) + Math.PI / 2;
        }
        
        const latOffset = (radius * Math.cos(heading)) / 111111;
        const lngOffset = (radius * Math.sin(heading)) / (111111 * cosLat);
        
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [pos[1] - lngOffset, pos[0] - latOffset],
              [pos[1] + lngOffset, pos[0] + latOffset]
            ]
          },
          properties: {}
        });
      } else if (type === 'Sector' || type === 'Keyhole') {
        let heading = 0;
        if (idx > 0) {
          const prev = waypoints[idx - 1];
          heading = Math.atan2(pos[1] - prev[1], pos[0] - prev[0]);
        } else if (idx === 0 && waypoints.length > 1) {
          const next = waypoints[1];
          heading = Math.atan2(pos[1] - next[1], pos[0] - next[0]);
        }
        
        const vertices: [number, number][] = [[pos[1], pos[0]]];
        const startAngle = heading - (angle * Math.PI) / 360;
        const endAngle = heading + (angle * Math.PI) / 360;
        const steps = 12;
        for (let s = 0; s <= steps; s++) {
          const a = startAngle + (s * (endAngle - startAngle)) / steps;
          const latOffset = (radius * Math.cos(a)) / 111111;
          const lngOffset = (radius * Math.sin(a)) / (111111 * cosLat);
          vertices.push([pos[1] + lngOffset, pos[0] + latOffset]);
        }
        vertices.push([pos[1], pos[0]]);

        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [vertices] },
          properties: {}
        });

        if (type === 'Keyhole') {
          const stepsKey = 24;
          const keyCoords: [number, number][] = [];
          for (let k = 0; k <= stepsKey; k++) {
            const a = (k * 2 * Math.PI) / stepsKey;
            const latOffset = (500 * Math.cos(a)) / 111111;
            const lngOffset = (500 * Math.sin(a)) / (111111 * cosLat);
            keyCoords.push([pos[1] + lngOffset, pos[0] + latOffset]);
          }
          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [keyCoords] },
            properties: {}
          });
        }
      }
    });

    return { type: 'FeatureCollection', features };
  }, [waypoints, observationZones]);

  // Keep data refs updated
  useEffect(() => { sortedGeoJSONRef.current = sortedGeoJSON; }, [sortedGeoJSON]);
  useEffect(() => { corridorGeoJSONRef.current = corridorGeoJSON; }, [corridorGeoJSON]);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);
  useEffect(() => { ozGeoJSONRef.current = ozGeoJSON; }, [ozGeoJSON]);

  const updateAllWebGlSources = (map: maplibregl.Map) => {
    const notamSource = map.getSource('notam-polygons') as maplibregl.GeoJSONSource;
    if (notamSource && sortedGeoJSONRef.current) {
      notamSource.setData(sortedGeoJSONRef.current as any);
    }

    const corridorSource = map.getSource('route-corridor') as maplibregl.GeoJSONSource;
    if (corridorSource) {
      corridorSource.setData(corridorGeoJSONRef.current || { type: 'FeatureCollection', features: [] });
    }

    const waypointsSource = map.getSource('route-waypoints') as maplibregl.GeoJSONSource;
    if (waypointsSource) {
      if (waypointsRef.current.length > 1) {
        waypointsSource.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: waypointsRef.current.map(wp => [wp[1], wp[0]])
          },
          properties: {}
        } as any);
      } else {
        waypointsSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    const ozSource = map.getSource('observation-zones') as maplibregl.GeoJSONSource;
    if (ozSource && ozGeoJSONRef.current) {
      ozSource.setData(ozGeoJSONRef.current as any);
    }
  };

  // Initialize MapLibre Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAPLIBRE_DARK_STYLE,
      center: [-1.2, 52.8],
      zoom: 7
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      isMapLoadedRef.current = true;
      setupMapSourcesAndLayers(map);
      updateAllWebGlSources(map);
      map.resize();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      isMapLoadedRef.current = false;
    };
  }, []);

  // Setup static sources and vector layers
  const setupMapSourcesAndLayers = (map: maplibregl.Map) => {
    // Sources
    map.addSource('notam-polygons', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('route-corridor', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('route-waypoints', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource('observation-zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // Layers
    // NOTAM Polygons Fill Layer (WebGL hardware accelerated)
    map.addLayer({
      id: 'notam-polygons-fill',
      type: 'fill',
      source: 'notam-polygons',
      paint: {
        'fill-color': ['coalesce', ['get', 'fillColor'], '#38bdf8'],
        'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.20]
      }
    });

    // NOTAM Polygons Outline Line Layer
    map.addLayer({
      id: 'notam-polygons-outline',
      type: 'line',
      source: 'notam-polygons',
      paint: {
        'line-color': ['coalesce', ['get', 'strokeColor'], '#38bdf8'],
        'line-width': ['coalesce', ['get', 'strokeWeight'], 2.5]
      }
    });

    // Route Corridor Layer
    map.addLayer({
      id: 'route-corridor-fill',
      type: 'fill',
      source: 'route-corridor',
      paint: {
        'fill-color': '#00ffff',
        'fill-opacity': 0.15
      }
    });

    map.addLayer({
      id: 'route-corridor-outline',
      type: 'line',
      source: 'route-corridor',
      paint: {
        'line-color': '#00ffff',
        'line-width': 2.5,
        'line-dasharray': [4, 4]
      }
    });

    // Planned Route Polyline
    map.addLayer({
      id: 'route-waypoints-line',
      type: 'line',
      source: 'route-waypoints',
      paint: {
        'line-color': '#00ffff',
        'line-width': 4.0,
        'line-dasharray': [3, 3]
      }
    });

    // Observation Zones Layer
    map.addLayer({
      id: 'oz-fill',
      type: 'fill',
      source: 'observation-zones',
      paint: {
        'fill-color': '#00ffff',
        'fill-opacity': 0.15
      }
    });

    map.addLayer({
      id: 'oz-outline',
      type: 'line',
      source: 'observation-zones',
      paint: {
        'line-color': '#00ffff',
        'line-width': 2.0
      }
    });

    // Handle NOTAM click selection on WebGL layer
    map.on('click', 'notam-polygons-fill', (e: maplibregl.MapLayerMouseEvent) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        onSelectNotam(feature);
      }
    });

    map.on('mouseenter', 'notam-polygons-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'notam-polygons-fill', () => {
      map.getCanvas().style.cursor = '';
    });
  };

  // Update NOTAM Vector Source when data or selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    const source = map.getSource('notam-polygons') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(sortedGeoJSON as any);
      map.triggerRepaint();
    }
  }, [sortedGeoJSON]);

  // Update Route Corridor Source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    const source = map.getSource('route-corridor') as maplibregl.GeoJSONSource;
    if (source && corridorGeoJSON) {
      source.setData(corridorGeoJSON);
      map.triggerRepaint();
    } else if (source) {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [corridorGeoJSON]);

  // Update Waypoints Polyline Line Source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    const source = map.getSource('route-waypoints') as maplibregl.GeoJSONSource;
    if (source && waypoints.length > 1) {
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: waypoints.map(wp => [wp[1], wp[0]])
        },
        properties: {}
      } as any);
      map.triggerRepaint();
    } else if (source) {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [waypoints]);

  // Update Observation Zone Source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    const source = map.getSource('observation-zones') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(ozGeoJSON as any);
      map.triggerRepaint();
    }
  }, [ozGeoJSON]);

  // 3. Clear and Render Dynamic HTML Markers (Hazard Pins, Waypoints, BGA Turnpoints)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // A. Hazard Pin Centroids for small / point hazards
    if (filteredData && filteredData.features) {
      filteredData.features.filter((f: any) => {
        const geom = f.geometry;
        if (!geom) return false;
        const area = getFeatureAreaEstimate(f);
        return geom.type === 'Point' || area < 0.005;
      }).forEach((f: any) => {
        let lat = 52.0, lng = 0.0;
        if (f.geometry.type === 'Point') {
          lng = f.geometry.coordinates[0];
          lat = f.geometry.coordinates[1];
        } else if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
          const pts = f.geometry.coordinates[0];
          let sumX = 0, sumY = 0;
          pts.forEach((p: number[]) => { sumX += p[0]; sumY += p[1]; });
          lng = sumX / pts.length;
          lat = sumY / pts.length;
        }

        const emoji = getHazardIcon(f.properties?.hazard_type);
        const color = getHazardColor(f.properties?.hazard_type);
        const isSelected = selectedNotam?.properties?.notam_id === f.properties?.notam_id;

        const el = document.createElement('div');
        el.className = 'custom-hazard-pin-container';
        el.innerHTML = `<div class="custom-hazard-pin ${isSelected ? 'selected' : ''}" style="border-color: ${color}; cursor: pointer;">
                          <span class="pin-emoji">${emoji}</span>
                        </div>`;
        
        el.onclick = (e) => {
          e.stopPropagation();
          onSelectNotam(f);
        };

        const lower = formatAltitudeValue(f.properties?.lower_fl, false);
        const upper = formatAltitudeValue(f.properties?.upper_fl, true);
        const popupDom = document.createElement('div');
        popupDom.style.color = '#333';
        popupDom.innerHTML = `
          <div class="popup-title" style="font-weight:bold;">${f.properties?.hazard_label || f.properties?.hazard_type}</div>
          <div class="popup-meta" style="font-size:11px; color:#666;">ID: <strong>${f.properties?.notam_id}</strong></div>
          <div class="popup-meta" style="font-size:11px; margin-top:4px;">Vertical: <strong>${lower} - ${upper}</strong></div>
          <div class="popup-desc" style="margin-top:6px; font-size:11px;">${f.properties?.raw_text || ''}</div>
        `;
        const popup = new maplibregl.Popup({ offset: 12 }).setDOMContent(popupDom);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // B. Sequential Waypoint Markers
    waypoints.forEach((pos, i) => {
      const isStart = i === 0;
      const isFinish = i === waypoints.length - 1 && waypoints.length > 1;
      const label = isStart ? 'Start' : isFinish ? 'Finish' : `TP ${i}`;

      const el = document.createElement('div');
      el.className = 'task-waypoint-icon-container';
      el.innerHTML = `<div class="task-waypoint-pin ${isStart ? 'start' : isFinish ? 'finish' : ''}">
                        <span class="wp-number">${i + 1}</span>
                       </div>`;

      const popupContent = document.createElement('div');
      popupContent.style.color = '#333';
      popupContent.innerHTML = `
        <strong>Waypoint ${i + 1} (${label})</strong>
        <div>${pos[0].toFixed(4)}N, ${Math.abs(pos[1]).toFixed(4)}W</div>
      `;

      if (isStart && waypoints.length >= 2 && !isAlreadyClosed) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.style.cssText = 'margin-top: 8px; padding: 4px 8px; font-size: 11px; cursor: pointer; background: linear-gradient(135deg, #10b981, #047857); border: none; color: #fff; border-radius: 4px; width: 100%;';
        btn.innerText = '🏁 Set as Finish Point';
        btn.onclick = () => onAddWaypoint(pos);
        popupContent.appendChild(btn);
      }

      const popup = new maplibregl.Popup({ offset: 12 }).setDOMContent(popupContent);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pos[1], pos[0]])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // C. BGA Turnpoint Markers
    if (layers.bgaTurnpoints && bgaTurnpoints?.features) {
      bgaTurnpoints.features.forEach((f: any) => {
        const [lon, lat] = f.geometry.coordinates;

        const el = document.createElement('div');
        el.className = 'bga-turnpoint-icon';
        el.innerHTML = `<div class="bga-marker-dot"></div><div class="bga-marker-label">${f.properties.code}</div>`;

        const popupContent = document.createElement('div');
        popupContent.style.color = '#333';
        popupContent.innerHTML = `
          <div style="font-weight: bold;">BGA Turnpoint: ${f.properties.code}</div>
          <div>${f.properties.name}</div>
          <div>Elevation: ${f.properties.elevation_ft} ft</div>
        `;

        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.style.cssText = 'margin-top: 8px; padding: 4px 8px; font-size: 11px; cursor: pointer; background: #2563eb; border: none; color: #fff; border-radius: 4px; width: 100%;';
        
        if (waypoints.length > 0 && Math.abs(lat - waypoints[0][0]) < 0.0001 && Math.abs(lon - waypoints[0][1]) < 0.0001 && waypoints.length >= 2 && !isAlreadyClosed) {
          btn.innerText = '🏁 Set as Finish Point';
          btn.style.background = 'linear-gradient(135deg, #10b981, #047857)';
        } else {
          btn.innerText = '➕ Add to Task';
        }

        btn.onclick = () => onAddWaypoint([lat, lon]);
        popupContent.appendChild(btn);

        const popup = new maplibregl.Popup({ offset: 10 }).setDOMContent(popupContent);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

  }, [filteredData, selectedNotam, waypoints, layers.bgaTurnpoints, bgaTurnpoints, isAlreadyClosed, onSelectNotam, onAddWaypoint]);

  // 4. Smooth Bounds Camera Panning Controller
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panToNotam || !panToNotam.geometry) return;

    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;

    const processCoord = (lng: number, lat: number) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    const geom = panToNotam.geometry;
    if (geom.type === 'Point') {
      processCoord(geom.coordinates[0], geom.coordinates[1]);
    } else if (geom.type === 'Polygon' && geom.coordinates[0]) {
      geom.coordinates[0].forEach((pt: number[]) => processCoord(pt[0], pt[1]));
    }

    if (minLng < maxLng || minLat < maxLat) {
      const bottomPadding = isMobile ? 260 : 80;
      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        {
          padding: { top: 80, bottom: bottomPadding, left: 80, right: 80 },
          maxZoom: 11,
          duration: 1200
        }
      );
    }
    setPanToNotam(null);
  }, [panToNotam, isMobile, setPanToNotam]);

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};
