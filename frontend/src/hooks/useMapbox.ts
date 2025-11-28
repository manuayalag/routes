import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

export function useMapbox(token?: string, defaultStyle?: string, debug = false) {
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (token) mapboxgl.accessToken = token;
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (e) { /* ignore */ }
        mapRef.current = null;
      }
    };
  }, [token]);

  const init = (container: HTMLElement, options?: { style?: string; center?: [number, number]; zoom?: number; pitch?: number }) => {
    if (mapRef.current) return mapRef.current;
    const style = options?.style || defaultStyle || 'mapbox://styles/mapbox/streets-v11';
    const center = options?.center || [-56.0, -25.0];
    const zoom = typeof options?.zoom === 'number' ? options!.zoom : 8;
    const pitch = typeof options?.pitch === 'number' ? options!.pitch : 45;

    mapRef.current = new mapboxgl.Map({
      container,
      style,
      center,
      zoom,
      pitch,
      attributionControl: false
    });

    try { (window as any).__STK_MAP = mapRef.current; } catch (e) { /* ignore */ }

    // Basic controls
    try {
      mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapRef.current.addControl(new mapboxgl.ScaleControl(), 'bottom-right');
      mapRef.current.addControl(new mapboxgl.GeolocateControl(), 'top-right');
    } catch (err) {
      if (debug) console.warn('Error adding default controls to mapbox map', err);
    }

    // Dispatch a custom event when ready and ensure vendor layers stay on top
    const lastEmitRef = { current: 0 } as { current: number };
    const emitMapaListo = () => {
      const now = Date.now();
      if (now - lastEmitRef.current < 700) return; // debounce rapid emits
      lastEmitRef.current = now;
      if (debug) console.log('useMapbox: map loaded/style changed (emit)');
      try { (window as any).__STK_MAP = mapRef.current; } catch (e) { /* ignore */ }
      const ev = new CustomEvent('mapaListo');
      window.dispatchEvent(ev);
    };

    const moverVendedoresAlFrente = () => {
      const m = mapRef.current;
      if (!m) return;
      setTimeout(() => {
        try {
          if (m && m.isStyleLoaded()) {
            const vendedoresLayers = ['vendedores-last-aura', 'vendedores-last-icon', 'vendedores-last-labels'];
            vendedoresLayers.forEach(layerId => {
              if (m.getLayer && m.getLayer(layerId)) {
                try {
                  m.moveLayer(layerId);
                  if (debug) console.log(`useMapbox: moved layer ${layerId} to front`);
                } catch (err) {
                  if (debug) console.warn('useMapbox: could not move layer', layerId, err);
                }
              }
            });
          }
        } catch (e) {
          if (debug) console.warn('useMapbox: error in moverVendedoresAlFrente', e);
        }
      }, 100);
    };

    mapRef.current.on('load', () => {
      emitMapaListo();
      moverVendedoresAlFrente();
    });

    // Some styles may reload; emit mapaListo and move vendor layers shortly after style.load
    mapRef.current.on('style.load', () => {
      setTimeout(() => {
        emitMapaListo();
        moverVendedoresAlFrente();
      }, 250);
    });

    return mapRef.current;
  };

  return { mapRef, init };
}
