import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import L from 'leaflet';
import {Crosshair, Layers} from 'lucide-react';
import type {CalculatedRouteData, OriginPoint, StopItem} from '../types/route';
import {buildStopGpsUrl, formatDistanceKm, formatDurationPt} from '../utils/mapsUrls';

interface RouteMapProps {
  origin: OriginPoint | null;
  stops: StopItem[];
  routeData: CalculatedRouteData | null;
  nextStopId: string | null;
  focusedStopId: string | null;
  onSelectStop: (stopId: string | null) => void;
}

const DEFAULT_CENTER: [number, number] = [-23.55052, -46.633308];

type MapStyleMode = 'dark' | 'osm';

function buildStopPopupNode(
  stop: StopItem,
  displayIndex: number,
  isNext: boolean,
  origin: OriginPoint | null,
  legMetric?: {distanceMeters: number; durationMillis: number}
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.minWidth = '195px';
  wrapper.style.maxWidth = '240px';
  wrapper.style.padding = '2px';

  const badge = document.createElement('div');
  badge.style.fontSize = '11px';
  badge.style.fontWeight = '700';
  badge.style.color = stop.completed ? '#94A3B8' : '#00E599';
  badge.textContent = `Parada ${displayIndex}${
    stop.completed ? ' · Concluída' : isNext ? ' · Próxima' : ''
  }`;
  wrapper.appendChild(badge);

  const title = document.createElement('div');
  title.style.marginTop = '4px';
  title.style.fontSize = '14px';
  title.style.fontWeight = '700';
  title.style.lineHeight = '1.3';
  title.style.color = '#FFFFFF';
  title.textContent = stop.name;
  wrapper.appendChild(title);

  const addr = document.createElement('div');
  addr.style.marginTop = '3px';
  addr.style.fontSize = '12px';
  addr.style.lineHeight = '1.35';
  addr.style.color = '#94A3B8';
  addr.textContent = stop.address;
  wrapper.appendChild(addr);

  if (legMetric) {
    const metric = document.createElement('div');
    metric.style.marginTop = '6px';
    metric.style.fontSize = '12px';
    metric.style.fontFamily = "'JetBrains Mono', monospace";
    metric.style.color = '#CBD5E1';
    metric.textContent = `${formatDistanceKm(legMetric.distanceMeters)} · ${formatDurationPt(
      legMetric.durationMillis
    )}`;
    wrapper.appendChild(metric);
  }

  const link = document.createElement('a');
  link.href = buildStopGpsUrl(stop, origin);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'flex';
  link.style.alignItems = 'center';
  link.style.justifyContent = 'center';
  link.style.marginTop = '10px';
  link.style.minHeight = '38px';
  link.style.padding = '6px 12px';
  link.style.borderRadius = '8px';
  link.style.backgroundColor = '#00E599';
  link.style.color = '#04140D';
  link.style.fontSize = '12px';
  link.style.fontWeight = '700';
  link.style.textDecoration = 'none';
  link.textContent = 'Abrir no GPS ↗';
  wrapper.appendChild(link);

  return wrapper;
}

function createOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -42],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:36px;height:36px;border-radius:9999px;background:#083344;border:2px solid #A5F3FC;color:#22D3EE;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(0,0,0,0.6);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
        </div>
        <div style="width:2px;height:10px;background:#22D3EE;"></div>
      </div>
    `,
  });
}

function createStopIcon(displayIndex: number, isNext: boolean, completed: boolean): L.DivIcon {
  const bg = completed ? '#1E293B' : isNext ? '#00E599' : '#0F172A';
  const border = completed ? '#475569' : isNext ? '#A7F3D0' : '#22D3EE';
  const color = completed ? '#94A3B8' : isNext ? '#04140D' : '#F3F6FA';
  const scale = isNext ? 'transform:scale(1.12);' : '';

  const innerContent = completed
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    : String(displayIndex);

  return L.divIcon({
    className: '',
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -42],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;${scale}">
        <div style="width:36px;height:36px;border-radius:9999px;background:${bg};border:2px solid ${border};color:${color};display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;box-shadow:0 8px 18px rgba(0,0,0,0.6);">
          ${innerContent}
        </div>
        <div style="width:2px;height:10px;background:${border};"></div>
      </div>
    `,
  });
}

export const RouteMap: React.FC<RouteMapProps> = ({
  origin,
  stops,
  routeData,
  nextStopId,
  focusedStopId,
  onSelectStop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerInstancesRef = useRef<Record<string, L.Marker>>({});

  const [mapStyle, setMapStyle] = useState<MapStyleMode>('dark');

  const orderedStops = useMemo(() => {
    if (!routeData) return stops;
    const stopDict: Record<string, StopItem> = {};
    stops.forEach((s) => {
      stopDict[s.id] = s;
    });
    const ordered = routeData.orderedStopIds
      .map((id) => stopDict[id])
      .filter((s): s is StopItem => Boolean(s));
    return ordered.length === stops.length ? ordered : stops;
  }, [stops, routeData]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = origin
      ? [origin.location.lat, origin.location.lng]
      : DEFAULT_CENTER;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({position: 'bottomright'}).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', () => {
      onSelectStop(null);
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      routeLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Switch tile layer (Dark CartoDB vs OpenStreetMap Standard)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
      tileLayerRef.current = null;
    }

    const tileLayer =
      mapStyle === 'dark'
        ? L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
          })
        : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
  }, [mapStyle]);

  // Fit bounds helper
  const fitMapBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routeData?.viewport) {
      const {north, south, east, west} = routeData.viewport;
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        {padding: [42, 42]}
      );
      return;
    }

    const pts: [number, number][] = [];
    if (origin) pts.push([origin.location.lat, origin.location.lng]);
    orderedStops.forEach((s) => pts.push([s.location.lat, s.location.lng]));

    if (pts.length === 0) return;

    if (pts.length === 1) {
      map.setView(pts[0], 14, {animate: true});
      return;
    }

    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, {padding: [42, 42]});
  }, [origin, orderedStops, routeData]);

  // Render route polyline
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!routeData || routeData.path.length < 2) return;

    const latLngs: [number, number][] = routeData.path.map((pt) => [pt.lat, pt.lng]);

    // Dark casing underneath for high contrast on both dark and light tiles
    L.polyline(latLngs, {
      color: '#032B1E',
      weight: 9,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);

    // Vibrant emerald-mint active route path
    L.polyline(latLngs, {
      color: '#00E599',
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layer);
  }, [routeData]);

  // Render origin + stop markers
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markerInstancesRef.current = {};

    if (origin) {
      const originMarker = L.marker([origin.location.lat, origin.location.lng], {
        icon: createOriginIcon(),
        zIndexOffset: 300,
      });

      const popupEl = document.createElement('div');
      popupEl.style.padding = '2px';
      const labelEl = document.createElement('div');
      labelEl.style.fontSize = '11px';
      labelEl.style.fontWeight = '700';
      labelEl.style.color = '#22D3EE';
      labelEl.textContent = 'Ponto de Partida';
      const addrEl = document.createElement('div');
      addrEl.style.marginTop = '4px';
      addrEl.style.fontSize = '13px';
      addrEl.style.fontWeight = '600';
      addrEl.style.color = '#FFFFFF';
      addrEl.textContent = origin.label;
      popupEl.appendChild(labelEl);
      popupEl.appendChild(addrEl);

      originMarker.bindPopup(popupEl);
      originMarker.addTo(layer);
    }

    orderedStops.forEach((stop, index) => {
      const displayIndex = index + 1;
      const isNext = stop.id === nextStopId;
      const marker = L.marker([stop.location.lat, stop.location.lng], {
        icon: createStopIcon(displayIndex, isNext, stop.completed),
        zIndexOffset: isNext ? 400 : stop.completed ? 100 : 200,
      });

      const popupNode = buildStopPopupNode(
        stop,
        displayIndex,
        isNext,
        origin,
        routeData?.legsByStopId[stop.id]
      );
      marker.bindPopup(popupNode);

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectStop(stop.id);
      });

      marker.addTo(layer);
      markerInstancesRef.current[stop.id] = marker;
    });
  }, [origin, orderedStops, routeData, nextStopId, onSelectStop]);

  // Auto fit bounds when route or stops update
  useEffect(() => {
    fitMapBounds();
  }, [fitMapBounds]);

  // Pan and open popup when a stop is focused from the list
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedStopId) return;

    const marker = markerInstancesRef.current[focusedStopId];
    if (marker) {
      map.panTo(marker.getLatLng(), {animate: true});
      marker.openPopup();
    }
  }, [focusedStopId]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0B0F17]">
      <div ref={containerRef} className="h-full w-full z-0" />

      {/* Floating Map Action Controls */}
      <div className="absolute right-3 top-3 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setMapStyle((s) => (s === 'dark' ? 'osm' : 'dark'))}
          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-[#0A0D12]/90 px-3 py-2 text-xs font-semibold text-[#F3F6FA] backdrop-blur-md transition-colors hover:border-white/30 hover:bg-[#121721]"
        >
          <Layers className="h-4 w-4 text-[#00E599]" aria-hidden="true" />
          <span className="whitespace-nowrap">
            {mapStyle === 'dark' ? 'OSM Padrão' : 'Mapa Escuro'}
          </span>
        </button>

        {(origin || stops.length > 0) && (
          <button
            type="button"
            onClick={fitMapBounds}
            aria-label="Centralizar rota no mapa"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0A0D12]/90 px-3 py-2 text-xs font-semibold text-[#F3F6FA] backdrop-blur-md transition-colors hover:border-white/30 hover:bg-[#121721]"
          >
            <Crosshair className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            <span className="whitespace-nowrap">Enquadrar</span>
          </button>
        )}
      </div>
    </div>
  );
};
