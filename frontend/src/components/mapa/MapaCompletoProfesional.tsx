/* Minimal composer for the modular map components.
   This file is intentionally small: it provides the map container
   element and composes `MapPlayer`. Actual layer management and
   popups live in the extracted hooks/components.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapPlayer from './MapPlayer';
import { getVentasPorRouteDetail } from '../../services/ventas.service';
import useMapLayers from '../../hooks/useMapLayers';
import type { MapaData, FiltrosUI, CapasVisibles, Ruta } from '../../types';

interface MapaCompletoProfesionalProps {
  mapaData: MapaData | null;
  onAplicarFiltros?: (filtros: FiltrosUI) => void;
  loading?: boolean;
  externalMapRef?: React.MutableRefObject<any> | null;
  externalContainerRef?: React.RefObject<HTMLDivElement> | null;
}

const MapaCompletoProfesional: React.FC<MapaCompletoProfesionalProps> = ({ mapaData, externalMapRef, externalContainerRef }) => {
  const internalMapContainer = useRef<HTMLDivElement>(null);
  const internalMapRef = useRef<any>(null);
  const mapContainer = (externalContainerRef as React.RefObject<HTMLDivElement> | null) || internalMapContainer;
  const map = (externalMapRef as React.MutableRefObject<any> | null) || internalMapRef;

  const [layersVisible] = useState<CapasVisibles>({ zonas: true, rutas: true, vendedores: true, labels: true, clientes: true });
  const [playerVisible, setPlayerVisible] = useState(false);
  const [activeRoute, setActiveRoute] = useState<Ruta | null>(null);
  const [playerStep, setPlayerStep] = useState(0);
  const [playerVentasMap, setPlayerVentasMap] = useState<Record<number, any>>({});
  const [clientFilter] = useState<'all'|'visitados'|'no_visitados'>('all');

  const { updateLayers } = useMapLayers();

  // Fetch ventas for all clients in a route, cache results, and open the player
  const fetchVentasForRoute = useCallback(async (ruta: any) => {
    if (!ruta) return;
    if (process.env.NODE_ENV !== 'production') console.debug('fetchVentasForRoute called', ruta?.route_id ?? ruta?.id ?? ruta?.routeId);
    try {
      setActiveRoute(ruta);
      setPlayerVisible(true);
      // reset to first step when opening a route
      setPlayerStep(0);
      // Focus map to bounds covering the route's clients (if map available)
      try {
        const m = map.current;
        if (m && typeof m.fitBounds === 'function') {
          const clientes = ruta.clientes || [];
          const bounds = new mapboxgl.LngLatBounds();
          let has = false;
          for (const c of clientes) {
            const lat = Number(c.latitud ?? c.latitude ?? c.lat);
            const lng = Number(c.longitud ?? c.longitude ?? c.lng ?? c.lon);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              bounds.extend([lng, lat]);
              has = true;
            }
            // also try event coords if present (fallback)
            if (!has && c.event_begin && c.event_begin.latitude && c.event_begin.longitude) {
              const elat = Number(c.event_begin.latitude);
              const elng = Number(c.event_begin.longitude);
              if (Number.isFinite(elat) && Number.isFinite(elng)) {
                bounds.extend([elng, elat]);
                has = true;
              }
            }
          }
          if (has) m.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 });
        }
      } catch (e) {
        // Non-fatal: focus failure should not block prefetch
        console.warn('fitBounds failed', e);
      }
      // Load only the first cliente's ventas (progressive load on demand)
      const clientes = (ruta.clientes || []).filter((c: any) => c.visit_sequence != null && c.visit_sequence > 0).sort((a: any, b: any) => (a.visit_sequence || 0) - (b.visit_sequence || 0));
      const first = clientes[0];
      if (first) {
        const rdId = Number(first.route_detail_id ?? first.route_detail ?? first.routeDetailId ?? first.cliente_id ?? first.id);
        if (rdId && !playerVentasMap[rdId]) {
          try {
            const data = await getVentasPorRouteDetail(rdId).catch(() => null);
            if (data) setPlayerVentasMap(prev => ({ ...prev, [rdId]: data }));
          } catch (e) {
            // ignore load error for initial cliente
          }
        }
      }
    } catch (err) {
      console.error('fetchVentasForRoute error', err);
    }
  }, [playerVentasMap, setPlayerVentasMap]);

  // Global listener: allow other components (sidebar, popups) to request opening a route
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const routeId = ev?.detail?.route_id ?? ev?.detail?.ruta?.route_id ?? ev?.detail?.ruta?.id;
        if (!routeId) return;
        if (process.env.NODE_ENV !== 'production') console.debug('ruta:open event received', routeId);
        const rutas = (mapaData && (mapaData.rutas || [])) || [];
        const ruta = rutas.find((r: any) => String(r.route_id ?? r.id ?? r.RouteId) === String(routeId));
        if (ruta) {
          fetchVentasForRoute(ruta);
        } else {
          console.warn('ruta:open - ruta not found', routeId);
        }
      } catch (e) {
        console.error('ruta:open handler error', e);
      }
    };
    window.addEventListener('ruta:open', handler as EventListener);
    return () => { window.removeEventListener('ruta:open', handler as EventListener); };
  }, [mapaData, fetchVentasForRoute]);

  // Fetch ventas for a single route_detail id with simple cache and retries/backoff
  const ventasCacheRef = useRef<Record<number, { ts: number; data: any }>>({});
  const fetchVentasForRd = useCallback(async (rdId: number) => {
    if (!rdId) return null;
    // check ephemeral cache first (5 minutes)
    const CACHE_TTL = 5 * 60 * 1000;
    const now = Date.now();
    const cache = ventasCacheRef.current[rdId];
    if (cache && (now - cache.ts) < CACHE_TTL) {
      // populate playerVentasMap if not present
      if (!playerVentasMap[rdId]) setPlayerVentasMap(prev => ({ ...prev, [rdId]: cache.data }));
      return cache.data;
    }

    const maxRetries = 2;
    let attempt = 0;
    let lastErr: any = null;
    while (attempt <= maxRetries) {
      try {
        const data = await getVentasPorRouteDetail(rdId);
        if (data) {
          ventasCacheRef.current[rdId] = { ts: Date.now(), data };
          setPlayerVentasMap(prev => ({ ...prev, [rdId]: data }));
        }
        return data;
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt > maxRetries) break;
        // exponential-ish backoff
        const wait = 150 * attempt;
        await new Promise(res => setTimeout(res, wait));
      }
    }
    if (now && (ventasCacheRef.current[rdId] && ventasCacheRef.current[rdId].data)) {
      // return stale cache if available
      return ventasCacheRef.current[rdId].data;
    }
    if (lastErr) console.warn('fetchVentasForRd failed', rdId, lastErr);
    return null;
  }, [playerVentasMap, setPlayerVentasMap]);

  useEffect(() => {
    const run = async () => {
      try {
        if (map.current && mapaData && typeof map.current.isStyleLoaded === 'function' && map.current.isStyleLoaded()) {
          // pass a noop fetchVentasForRoute for now; useMapLayers expects this argument
          if (process.env.NODE_ENV !== 'production') console.debug('calling updateLayers (initial run)');
          await updateLayers(map.current, mapaData, layersVisible, clientFilter, playerVentasMap, fetchVentasForRoute, false);
        }
      } catch (err) {
        console.error('updateLayers error', err);
      }
    };
    run();
  }, [map, mapaData, updateLayers, layersVisible, clientFilter, playerVentasMap]);

  // Ensure updateLayers runs when the style/map becomes ready. useMapbox dispatches a
  // 'mapaListo' custom event when the map is loaded / style is ready. Listen to it
  // so that layers and click handlers are attached reliably even if the map wasn't
  // ready during the initial effect run.
  useEffect(() => {
    const handler = async () => {
      try {
        const m = map.current;
        if (m && mapaData) {
          if (process.env.NODE_ENV !== 'production') console.debug('mapaListo received — calling updateLayers');
          await updateLayers(m, mapaData, layersVisible, clientFilter, playerVentasMap, fetchVentasForRoute, false);
        }
      } catch (e) {
        console.error('mapaListo handler failed', e);
      }
    };
    window.addEventListener('mapaListo', handler as EventListener);
    return () => { window.removeEventListener('mapaListo', handler as EventListener); };
  }, [map, mapaData, updateLayers, layersVisible, clientFilter, playerVentasMap, fetchVentasForRoute]);

  const goToStep = useCallback((i: number) => setPlayerStep(i), []);
  const prevStep = useCallback(() => setPlayerStep(s => Math.max(0, s - 1)), []);
  const nextStep = useCallback(() => setPlayerStep(s => s + 1), []);

  // When playerStep or activeRoute changes, center the map on the active cliente.
  useEffect(() => {
    try {
      const m = map.current;
      if (!m || !activeRoute) return;
      const clientes = (activeRoute.clientes || []).filter((c: any) => c.visit_sequence != null && c.visit_sequence > 0).sort((a: any, b: any) => (a.visit_sequence || 0) - (b.visit_sequence || 0));
      const cliente = clientes[playerStep];
      if (!cliente) return;
      const lat = Number(cliente.latitud ?? cliente.latitude ?? cliente.lat);
      const lng = Number(cliente.longitud ?? cliente.longitude ?? cliente.lng ?? cliente.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      // Use flyTo for a smooth focused movement to the cliente; keep moderate zoom
      try {
        m.flyTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 14), speed: 0.8, curve: 1, essential: true });
      } catch (e) {
        try { m.setCenter([lng, lat]); } catch (e2) { /* ignore */ }
      }
    } catch (e) {
      // non-fatal
    }
  }, [playerStep, activeRoute, map]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <MapPlayer
        activeRoute={activeRoute}
        playerVisible={playerVisible}
        setPlayerVisible={setPlayerVisible}
        setActiveRoute={setActiveRoute}
        playerStep={playerStep}
        setPlayerStep={setPlayerStep}
        playerVentasMap={playerVentasMap}
        setPlayerVentasMap={setPlayerVentasMap}
        fetchVentasForRd={fetchVentasForRd}
        goToStep={goToStep}
        prevStep={prevStep}
        nextStep={nextStep}
      />
    </div>
  );
};

export default MapaCompletoProfesional;