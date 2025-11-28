import mapboxgl from 'mapbox-gl';
import { Ruta, MapaData, CapasVisibles } from '../types';
import { showClientePopup } from '../components/mapa/ClientePopup';

export default function useMapLayers() {
  const updateLayers = async (
    map: mapboxgl.Map | null,
    mapaData: MapaData | null,
    layersVisible: CapasVisibles,
    clientFilter: 'all' | 'visitados' | 'no_visitados',
    playerVentasMap: Record<number, any>,
    fetchVentasForRoute: (r: Ruta) => Promise<void> | void,
    MAP_DEBUG = false
  ) => {
    if (!map || !map.isStyleLoaded() || !mapaData) return;

    try {
      // helper to safely add layers/sources and avoid race conditions when
      // styles reload (hot-reload) or updateLayers runs multiple times.
      const safeAddLayer = (layer: any) => {
        try {
          if (!map.getLayer(layer.id)) map.addLayer(layer);
        } catch (e) {
          if (MAP_DEBUG) console.warn('safeAddLayer failed', layer.id, e);
        }
      };
      const ensureImage = (imgId: string, url: string) => {
        return new Promise<void>((resolve) => {
          try {
            // if map.hasImage exists and image already present, resolve
            if ((map as any).hasImage && (map as any).hasImage(imgId)) return resolve();
            // loadImage with callback
            try {
              map.loadImage(url, (err: any, img: any) => {
                if (!err && img) {
                  try { if (!(map as any).hasImage || !map.hasImage(imgId)) map.addImage(imgId, img); } catch (e) { if (MAP_DEBUG) console.warn('addImage failed', e); }
                } else {
                  if (MAP_DEBUG) console.warn('map.loadImage returned error or no image', err);
                }
                return resolve();
              });
            } catch (e) {
              if (MAP_DEBUG) console.warn('map.loadImage threw', e);
              return resolve();
            }
          } catch (e) { if (MAP_DEBUG) console.warn('ensureImage failed', e); return resolve(); }
        });
      };
      const safeSetSourceData = (srcId: string, data: any) => {
        try {
          if (map.getSource(srcId)) {
            try { (map.getSource(srcId) as any).setData(data); } catch (e) { if (MAP_DEBUG) console.warn('setData failed', srcId, e); }
          } else {
            try { map.addSource(srcId, { type: 'geojson', data }); } catch (e) { if (MAP_DEBUG) console.warn('addSource failed', srcId, e); }
          }
        } catch (e) {
          if (MAP_DEBUG) console.warn('safeSetSourceData failed', srcId, e);
        }
      };

      // Attach a cleanup handler once to support dev hot-reload and page unloads.
      if (!(map as any).__cleanupAttached) {
        (map as any).__cleanupAttached = true;
        const cleanup = () => {
          try {
            const removeLayerIf = (id: string) => { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) { /* ignore */ } };
            const removeSourceIf = (id: string) => { try { if (map.getSource(id)) map.removeSource(id); } catch (e) { /* ignore */ } };
            const layerIdsToRemove = ['zonas-fill', 'zonas-3d', 'zonas-line', 'zonas-labels', 'rutas-lines', 'rutas-highlight', 'rutas-arrows', 'rutas-debug', 'rutas-fallback-lines', 'clientes-no-visitados', 'clientes-no-visitados-unplanned', 'clientes-visitados', 'clientes-visitados-unplanned', 'clientes-visitados-numeros', 'vendedores-last-aura', 'vendedores-last-icon', 'vendedores-last-labels'];
            layerIdsToRemove.forEach(removeLayerIf);
            ['zonas', 'rutas', 'clientes', 'vendedores-last'].forEach(removeSourceIf);
            const handlers = (map as any).__layerHandlers || {};
            Object.entries(handlers).forEach(([layerId, h]: any) => {
              try { if (h.click) map.off('click', layerId, h.click); } catch (e) { }
              try { if (h.enter) map.off('mouseenter', layerId, h.enter); } catch (e) { }
              try { if (h.leave) map.off('mouseleave', layerId, h.leave); } catch (e) { }
            });
            (map as any).__layerHandlers = {};
          } catch (e) {
            if (MAP_DEBUG) console.warn('map cleanup failed', e);
          }
        };
        try { window.addEventListener('beforeunload', cleanup); } catch (e) { /* ignore */ }
      }
      // Remove previous layers/sources only on the first initialization.
      // Removing and re-adding layers/sources on every update causes the map to
      // flicker and lose current view. We keep a flag on the map to ensure
      // we only perform destructive reset once.
      const isLayersInitialized = (map as any).__layersInitialized || false;
      const layersToRemove = [
        'zonas-fill', 'zonas-line', 'zonas-3d', 'zonas-labels',
        'rutas-lines', 'rutas-highlight', 'rutas-arrows', 'rutas-debug', 'rutas-fallback-lines',
        // clientes layers (include 'unplanned' variants)
        'clientes-no-visitados', 'clientes-no-visitados-unplanned', 'clientes-visitados', 'clientes-visitados-unplanned', 'clientes-visitados-numeros',
        'vendedores-last-aura', 'vendedores-last-icon', 'vendedores-last-labels'
      ];

      if (!isLayersInitialized) {
        layersToRemove.forEach(layerId => {
          if (map.getLayer(layerId)) {
            try { map.removeLayer(layerId); } catch (e) { if (MAP_DEBUG) console.warn('removeLayer failed', layerId, e); }
          }
        });

        ['zonas', 'rutas', 'clientes', 'vendedores-last'].forEach(srcId => {
          if (map.getSource(srcId)) {
            try { map.removeSource(srcId); } catch (e) { if (MAP_DEBUG) console.warn('removeSource failed', srcId, e); }
          }
        });
      }

      // Zonas
      if (mapaData.zonas && mapaData.zonas.length > 0) {
        const zonasFeatures = mapaData.zonas
          .filter(z => z.coordinates || z.coordinates)
          .map(zona => {
            let coords: [number, number][] = [];
            const raw = zona.coordinates || zona.coordinates;
            if (Array.isArray(raw) && Array.isArray(raw[0]) && Array.isArray(raw[0][0])) coords = raw[0] as any;
            else if (Array.isArray(raw)) coords = raw as any;

            if (coords.length > 0) {
              const first = coords[0]; const last = coords[coords.length - 1];
              if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
            }

            return {
              type: 'Feature' as const,
              properties: {
                id: zona.id || zona.zona_id,
                nombre: zona.nombre,
                color: zona.color || '#888',
                intensity: zona.kpis?.ventas_actuales ? Math.min(1, (zona.kpis.ventas_actuales || 0) / 1000000) : 0.3,
                ventas: zona.kpis?.ventas_actuales || 0,
                crecimiento: zona.kpis?.crecimiento_porcentual || 0,
                rendimiento: zona.kpis?.rendimiento_vs_promedio || 'bajo',
                height: Math.max((zona.kpis?.ventas_actuales || 0) / 100000, 100)
              },
              geometry: { type: 'Polygon' as const, coordinates: [coords] }
            };
        });

        if (zonasFeatures.length > 0) {
          if (map.getSource('zonas')) {
            try { (map.getSource('zonas') as any).setData({ type: 'FeatureCollection', features: zonasFeatures }); } catch (e) { if (MAP_DEBUG) console.warn('setData zonas failed', e); }
          } else {
            map.addSource('zonas', { type: 'geojson', data: { type: 'FeatureCollection', features: zonasFeatures } });
          }
            if (!map.getLayer('zonas-fill')) { try { map.addLayer({ id: 'zonas-fill', type: 'fill', source: 'zonas', layout: { visibility: layersVisible.zonas ? 'visible' : 'none' }, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } }); } catch (e) { if (MAP_DEBUG) console.warn('add zonas-fill failed', e); } }
            if (!map.getLayer('zonas-3d')) { try { map.addLayer({ id: 'zonas-3d', type: 'fill-extrusion', source: 'zonas', layout: { visibility: layersVisible.zonas ? 'visible' : 'none' }, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.35 } }); } catch (e) { if (MAP_DEBUG) console.warn('add zonas-3d failed', e); } }
            if (!map.getLayer('zonas-line')) { try { map.addLayer({ id: 'zonas-line', type: 'line', source: 'zonas', layout: { visibility: layersVisible.zonas ? 'visible' : 'none' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3 } }); } catch (e) { if (MAP_DEBUG) console.warn('add zonas-line failed', e); } }
            if (!map.getLayer('zonas-labels')) { try { map.addLayer({ id: 'zonas-labels', type: 'symbol', source: 'zonas', layout: { 'text-field': ['get', 'nombre'], 'text-size': 11, 'visibility': layersVisible.labels ? 'visible' : 'none' }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 2 } }); } catch (e) { if (MAP_DEBUG) console.warn('add zonas-labels failed', e); } }
            // Attach click handler for zonas so UI can react (show summary/popup)
            try {
              (map as any).__layerHandlers = (map as any).__layerHandlers || {};
              if (!(map as any).__layerHandlers['zonas-fill']) {
                const onZonasClick = (e: any) => {
                  try { console.debug && console.debug('map zona click fired', e?.features?.[0]?.properties); } catch (ee) { /* ignore */ }
                  if (e.features && e.features[0]) {
                    const props = e.features[0].properties || {};
                    // dispatch event with zone properties
                    try { window.dispatchEvent(new CustomEvent('zona:click', { detail: { zona: props, geometry: e.features[0].geometry } })); } catch (ev) { if (MAP_DEBUG) console.warn('zona click dispatch failed', ev); }
                  }
                };
                try { map.on('click', 'zonas-fill', onZonasClick); } catch (e) { if (MAP_DEBUG) console.warn('attach zonas-fill click failed', e); }
                const onEnter = () => { try { (map.getCanvas() as HTMLCanvasElement).style.cursor = 'pointer'; } catch (er) {} };
                const onLeave = () => { try { (map.getCanvas() as HTMLCanvasElement).style.cursor = ''; } catch (er) {} };
                try { map.on('mouseenter', 'zonas-fill', onEnter); map.on('mouseleave', 'zonas-fill', onLeave); } catch (e) { /* ignore */ }
                (map as any).__layerHandlers['zonas-fill'] = { click: onZonasClick, enter: onEnter, leave: onLeave };
              }
            } catch (e) { if (MAP_DEBUG) console.warn('zonas click handler attach failed', e); }
        }
      }

      // Rutas
      if (mapaData.rutas && mapaData.rutas.length > 0) {
        const rutasFeatures: GeoJSON.Feature[] = [];
        mapaData.rutas.forEach(ruta => {
          const visitados = (ruta.clientes || []).filter((c: any) => c.visitado === true && c.visit_sequence != null && c.visit_sequence > 0);
          visitados.sort((a: any, b: any) => (a.visit_sequence || 0) - (b.visit_sequence || 0));
          const coords: [number, number][] = visitados.map((c: any) => [Number(c.longitud), Number(c.latitud)]).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
          if (coords.length >= 2) {
            rutasFeatures.push({ type: 'Feature', properties: { route_id: (ruta as any).route_id, vendedor: ruta.vendedor, zona: ruta.zona_name }, geometry: { type: 'LineString', coordinates: coords } } as GeoJSON.Feature);
          }
        });

        if (rutasFeatures.length > 0) {
          // safely set rutas source data / create source if missing
          safeSetSourceData('rutas', { type: 'FeatureCollection', features: rutasFeatures });
          try { if (!map.getLayer('rutas-lines')) map.addLayer({ id: 'rutas-lines', type: 'line', source: 'rutas', layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': layersVisible.rutas ? 'visible' : 'none' }, paint: { 'line-color': '#3b82f6', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 12, 4, 15, 6], 'line-opacity': 0.9 } }); } catch (e) { if (MAP_DEBUG) console.warn('add rutas-lines failed', e); }

          // Deduplicate rutas-lines click handler
          (map as any).__layerHandlers = (map as any).__layerHandlers || {};
          if (!(map as any).__layerHandlers['rutas-lines']) {
            const onRutasClick = (e: any) => {
              try { console.debug && console.debug('map rutas click fired', e?.features?.[0]?.properties); } catch (ee) { /* ignore */ }
              if (e.features && e.features[0]) {
                const routeId = e.features[0].properties?.route_id;
                const ruta = mapaData.rutas?.find(r => (r as any).route_id === routeId);
                if (ruta) {
                  try { fetchVentasForRoute(ruta as Ruta); } catch (err) { if (MAP_DEBUG) console.warn('prefetch ventas failed', err); }
                  try { window.dispatchEvent(new CustomEvent('ruta:click', { detail: { ruta } })); } catch (e) { if (MAP_DEBUG) console.warn('ruta click event failed', e); }
                }
              }
            };
            try { map.on('click', 'rutas-lines', onRutasClick); } catch (e) { 
              if (MAP_DEBUG) console.warn('attach rutas-lines click failed', e);
              // Fallback: attach a global click handler that queries rendered features
              try {
                const fallback = (ev: any) => {
                  try {
                    const pa = ev.point || (ev?.point || ev?.originalEvent && { x: ev.originalEvent.clientX, y: ev.originalEvent.clientY });
                    const features = map.queryRenderedFeatures(ev.point ? ev.point : ev.point || ev, { layers: ['rutas-lines'] });
                    if (features && features.length > 0) {
                      onRutasClick({ features });
                    }
                  } catch (qerr) {
                    if (MAP_DEBUG) console.warn('rutas-lines fallback queryRenderedFeatures failed', qerr);
                  }
                };
                map.on('click', fallback);
                // store fallback so it can be removed on cleanup
                (map as any).__layerHandlers['rutas-lines'] = { click: onRutasClick, fallback };
              } catch (e2) {
                if (MAP_DEBUG) console.warn('rutas-lines fallback attach failed', e2);
                (map as any).__layerHandlers['rutas-lines'] = { click: onRutasClick };
              }
            }
            if (!(map as any).__layerHandlers['rutas-lines']) (map as any).__layerHandlers['rutas-lines'] = { click: onRutasClick };
          }
        }
      }

      // Clientes points
      try {
        const clientesFeatures: GeoJSON.Feature[] = (mapaData.rutas || []).flatMap(ruta => (ruta.clientes || []).map((c: any) => {
          const lng = Number(c.longitud ?? c.longitud);
          const lat = Number(c.latitud ?? c.latitud);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
          const unplanned = (c.sequence && Number(c.sequence) >= 1000) || (c.visit_sequence && Number(c.visit_sequence) >= 1000) || false;
          return { type: 'Feature' as const, properties: { 
            cliente_id: c.cliente_id ?? c.id ?? null,
            route_detail_id: c.route_detail_id ?? c.route_detail ?? c.routeDetailId ?? null,
            nombre: c.nombre ?? c.codigo ?? null,
            visitado: !!(c.visitado || c.estado === 'visitado_exitoso'),
            visit_sequence: c.visit_sequence || null,
            unplanned
          }, geometry: { type: 'Point' as const, coordinates: [lng, lat] } };
        })).filter(Boolean) as GeoJSON.Feature[];

        // Always add the clientes source (may be empty) and the related layers so re-renders
        // don't accidentally remove or skip layer creation. This ensures layer presence even
        // when features temporarily evaluate to an empty array during updates.
        try {
          const clientesData = { type: 'FeatureCollection', features: clientesFeatures };
          safeSetSourceData('clientes', clientesData);

          // Regular no-visitados (red)
          try { if (!map.getLayer('clientes-no-visitados')) map.addLayer({ id: 'clientes-no-visitados', type: 'circle', source: 'clientes', filter: ['all', ['!', ['get', 'visitado']], ['!', ['==', ['get', 'unplanned'], true]]], layout: { 'visibility': layersVisible.clientes ? 'visible' : 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 6, 15, 8], 'circle-color': '#ef4444', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } }); } catch (e) { if (MAP_DEBUG) console.warn('add clientes-no-visitados failed', e); }

          // Unplanned no-visitados (purple)
          try { if (!map.getLayer('clientes-no-visitados-unplanned')) map.addLayer({ id: 'clientes-no-visitados-unplanned', type: 'circle', source: 'clientes', filter: ['all', ['!', ['get', 'visitado']], ['==', ['get', 'unplanned'], true]], layout: { 'visibility': layersVisible.clientes ? 'visible' : 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 7, 15, 9], 'circle-color': '#7c3aed', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } }); } catch (e) { if (MAP_DEBUG) console.warn('add clientes-no-visitados-unplanned failed', e); }

          // Regular visitados (green)
          try { if (!map.getLayer('clientes-visitados')) map.addLayer({ id: 'clientes-visitados', type: 'circle', source: 'clientes', filter: ['all', ['==', ['get', 'visitado'], true], ['!', ['==', ['get', 'unplanned'], true]]], layout: { 'visibility': layersVisible.clientes ? 'visible' : 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6, 12, 8, 15, 10], 'circle-color': '#10b981', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }); } catch (e) { if (MAP_DEBUG) console.warn('add clientes-visitados failed', e); }

          // Unplanned visitados (purple)
          try { if (!map.getLayer('clientes-visitados-unplanned')) map.addLayer({ id: 'clientes-visitados-unplanned', type: 'circle', source: 'clientes', filter: ['all', ['==', ['get', 'visitado'], true], ['==', ['get', 'unplanned'], true]], layout: { 'visibility': layersVisible.clientes ? 'visible' : 'none' }, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 6, 12, 8, 15, 10], 'circle-color': '#7c3aed', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }); } catch (e) { if (MAP_DEBUG) console.warn('add clientes-visitados-unplanned failed', e); }

          // Numbers layer: show visit_sequence for visited clients; halo color purple for unplanned
          try { if (!map.getLayer('clientes-visitados-numeros')) map.addLayer({ id: 'clientes-visitados-numeros', type: 'symbol', source: 'clientes', filter: ['all', ['==', ['get', 'visitado'], true], ['!=', ['get', 'visit_sequence'], null]], layout: { 'text-field': ['to-string', ['get', 'visit_sequence']], 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10, 12, 12, 15, 14], 'text-anchor': 'center', 'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': layersVisible.clientes ? 'visible' : 'none' }, paint: { 'text-color': '#ffffff', 'text-halo-color': ['case', ['==', ['get', 'unplanned'], true], '#7c3aed', '#10b981'], 'text-halo-width': 2 } }); } catch (e) { if (MAP_DEBUG) console.warn('add clientes-visitados-numeros failed', e); }

          // Click handlers: ensure we don't attach duplicates across repeated updateLayers calls
          const clienteLayerIds = ['clientes-no-visitados', 'clientes-no-visitados-unplanned', 'clientes-visitados', 'clientes-visitados-unplanned', 'clientes-visitados-numeros'];
          (map as any).__layerHandlers = (map as any).__layerHandlers || {};
          clienteLayerIds.forEach(layerId => {
            // remove previous handlers for this layer if present
            const prev = (map as any).__layerHandlers[layerId] || {};
            try { if (prev.click) map.off('click', layerId, prev.click); } catch (e) { /* ignore */ }
            try { if (prev.enter) map.off('mouseenter', layerId, prev.enter); } catch (e) { /* ignore */ }
            try { if (prev.leave) map.off('mouseleave', layerId, prev.leave); } catch (e) { /* ignore */ }

            const onClick = (e: any) => { try { console.debug && console.debug('map cliente click fired', e?.features?.[0]?.properties); } catch (ee) { /* ignore */ } if (e.features && e.features[0]) showClientePopup(map, e.features[0] as any); };
            const onEnter = () => { if (map) (map.getCanvas() as HTMLCanvasElement).style.cursor = 'pointer'; };
            const onLeave = () => { if (map) (map.getCanvas() as HTMLCanvasElement).style.cursor = ''; };

            map.on('click', layerId, onClick);
            map.on('mouseenter', layerId, onEnter);
            map.on('mouseleave', layerId, onLeave);

            (map as any).__layerHandlers[layerId] = { click: onClick, enter: onEnter, leave: onLeave };
          });
        } catch (err) {
          if (MAP_DEBUG) console.warn('clientes layers failed', err);
        }
      } catch (err) {
        if (MAP_DEBUG) console.warn('clientes layers failed', err);
      }

      // Vendedores: fetch external source and add layers if available (light weight)
      try {
        // Only fetch vendedores once on initial load. Subsequent updateLayers calls should
        // not trigger network requests again — we keep any cached data on the map object.
        (map as any).__vendedoresInitialized = (map as any).__vendedoresInitialized || false;
        const now = Date.now();
        const cache = (map as any).__vendedoresCache || { ts: 0, features: null };
        // If we have cache data, use it to ensure source/layers exist without refetching
        if (cache.features && cache.ts) {
          // Use cached features but ensure we only show those located today or yesterday.
          const vendedoresFeatures = (cache.features || []) as GeoJSON.Feature[];
          const filteredFeatures = (vendedoresFeatures || []).filter(f => {
            const when = (f.properties as any)?.when || null;
            return when === 'today' || when === 'yesterday';
          });
          const data = { type: 'FeatureCollection', features: filteredFeatures };
          safeSetSourceData('vendedores-last', data);
          try {
            if (!map.getLayer('vendedores-last-aura-today')) map.addLayer({ id: 'vendedores-last-aura-today', type: 'circle', source: 'vendedores-last', filter: ['==', ['get', 'when'], 'today'], paint: { 'circle-color': '#10b981', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18, 18, 28], 'circle-opacity': 0.35, 'circle-blur': 0.5 }, layout: { 'visibility': layersVisible.vendedores ? 'visible' : 'none' } });
          } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-aura-today failed', e); }
          try {
            if (!map.getLayer('vendedores-last-aura-yesterday')) map.addLayer({ id: 'vendedores-last-aura-yesterday', type: 'circle', source: 'vendedores-last', filter: ['==', ['get', 'when'], 'yesterday'], paint: { 'circle-color': '#ef4444', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18, 18, 28], 'circle-opacity': 0.35, 'circle-blur': 0.5 }, layout: { 'visibility': layersVisible.vendedores ? 'visible' : 'none' } });
          } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-aura-yesterday failed', e); }
          try {
            const IMG_ID = 'vendedor-car-image';
            await ensureImage(IMG_ID, '/car.png');
            const symbolLayout: any = { 'icon-image': IMG_ID, 'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.03, 6, 0.035, 12, 0.06, 16, 0.09, 22, 0.12], 'icon-allow-overlap': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' };
            try {
              if (!map.getLayer('vendedores-last-icon')) map.addLayer({ id: 'vendedores-last-icon', type: 'symbol', source: 'vendedores-last', layout: symbolLayout, paint: {} });
            } catch (e) {
              if (MAP_DEBUG) console.warn('add vendedores-last-icon with image failed, fallback to text', e);
              try { if (!map.getLayer('vendedores-last-icon')) map.addLayer({ id: 'vendedores-last-icon', type: 'symbol', source: 'vendedores-last', layout: { 'text-field': '🚗', 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 20, 12, 32, 18, 48], 'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' } }); } catch (e2) { if (MAP_DEBUG) console.warn('add vendedores-last-icon fallback failed', e2); }
            }
          } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-icon failed', e); }
          try { if (!map.getLayer('vendedores-last-labels')) map.addLayer({ id: 'vendedores-last-labels', type: 'symbol', source: 'vendedores-last', layout: { 'text-field': ['get', 'user_full_name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 13, 12, 16, 18, 22], 'text-offset': [0, 2.5], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' }, paint: { 'text-color': '#FFD700', 'text-halo-color': '#000', 'text-halo-width': 3 } }); } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-labels failed', e); }
          if (map.getLayer('vendedores-last-aura')) map.moveLayer('vendedores-last-aura');
          if (map.getLayer('vendedores-last-icon')) map.moveLayer('vendedores-last-icon');
          if (map.getLayer('vendedores-last-labels')) map.moveLayer('vendedores-last-labels');
          // don't refetch if we are already initialized
          if ((map as any).__vendedoresInitialized) {
            // done
          } else {
            (map as any).__vendedoresInitialized = true;
          }
          // skip network fetch because we used cache
        } else if (!(map as any).__vendedoresInitialized) {
          // first-time load: fetch vendedores and populate cache + layers
          try {
            const resp = await fetch('/vendedores/ultima_ubicacion');
            const contentType = resp.headers.get('content-type') || '';
            let vendedoresJson: any = null;
            if (contentType.includes('application/json')) {
              vendedoresJson = await resp.json().catch(() => null);
            }
            const vendedoresArray: any[] = Array.isArray(vendedoresJson) ? vendedoresJson : (vendedoresJson && Array.isArray(vendedoresJson.rows) ? vendedoresJson.rows : []);

                // Filter vendedores by tracking_date in the last 48 hours
                const now = Date.now();
                const twoDaysAgo = new Date(now - (2 * 24 * 60 * 60 * 1000));

                const filtered = (vendedoresArray || []).filter((v: any) => {
                  const td = v.tracking_date || v.trackingDate || v.updated_at || v.timestamp || null;
                  if (!td) return false;
                  const d = new Date(td);
                  if (Number.isNaN(d.getTime())) return false;
                  return d >= twoDaysAgo && d <= new Date(now);
                });

            // Compute day-bucket for each vendor: 'today' | 'yesterday' | null
            const vendedoresFeatures = filtered.map((v: any) => {
              const lat = Number(v.latitude ?? v.latitud ?? v.lat);
              const lng = Number(v.longitude ?? v.longitud ?? v.lon ?? v.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              const td = v.tracking_date || v.trackingDate || v.updated_at || v.timestamp || null;
              let when: string | null = null;
              if (td) {
                const d = new Date(td);
                if (!Number.isNaN(d.getTime())) {
                  const today = new Date();
                  const dY = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                  const tY = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const diff = Math.round((tY.getTime() - dY.getTime()) / (24 * 60 * 60 * 1000));
                  if (diff === 0) when = 'today';
                  else if (diff === 1) when = 'yesterday';
                }
              }
              // Only include vendors located today or yesterday
              if (!when) return null;
              return { type: 'Feature' as const, properties: { user_id: v.user_id, user_full_name: v.user_full_name || v.nombre || v.user_id, battery_level: v.battery_level, tracking_date: v.tracking_date || v.trackingDate || null, localizado_hoy: when === 'today', when }, geometry: { type: 'Point' as const, coordinates: [lng, lat] } };
            }).filter(Boolean) as GeoJSON.Feature[];

            (map as any).__vendedoresCache = { ts: Date.now(), features: vendedoresFeatures };
            (map as any).__vendedoresInitialized = true;
            // add source/layers using the same logic as above
              if (vendedoresFeatures && vendedoresFeatures.length > 0) {
              const data = { type: 'FeatureCollection', features: vendedoresFeatures };
              if (map.getSource('vendedores-last')) {
                try { (map.getSource('vendedores-last') as any).setData(data); } catch (e) { if (MAP_DEBUG) console.warn('setData vendedores failed', e); }
              } else {
                map.addSource('vendedores-last', { type: 'geojson', data });
              }
              if (!map.getLayer('vendedores-last-aura-today')) {
                map.addLayer({ id: 'vendedores-last-aura-today', type: 'circle', source: 'vendedores-last', filter: ['==', ['get', 'when'], 'today'], paint: { 'circle-color': '#10b981', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18, 18, 28], 'circle-opacity': 0.35, 'circle-blur': 0.5 }, layout: { 'visibility': layersVisible.vendedores ? 'visible' : 'none' } });
              }
              if (!map.getLayer('vendedores-last-aura-yesterday')) {
                map.addLayer({ id: 'vendedores-last-aura-yesterday', type: 'circle', source: 'vendedores-last', filter: ['==', ['get', 'when'], 'yesterday'], paint: { 'circle-color': '#ef4444', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18, 18, 28], 'circle-opacity': 0.35, 'circle-blur': 0.5 }, layout: { 'visibility': layersVisible.vendedores ? 'visible' : 'none' } });
              }
              if (!map.getLayer('vendedores-last-icon')) {
                try {
                  const IMG_ID = 'vendedor-car-image';
                  await ensureImage(IMG_ID, '/car.png');
                  const symbolLayout2: any = { 'icon-image': IMG_ID, 'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.03, 6, 0.035, 12, 0.06, 16, 0.09, 22, 0.12], 'icon-allow-overlap': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' };
                  map.addLayer({ id: 'vendedores-last-icon', type: 'symbol', source: 'vendedores-last', layout: symbolLayout2, paint: {} });
                } catch (e) {
                  try { map.addLayer({ id: 'vendedores-last-icon', type: 'symbol', source: 'vendedores-last', layout: { 'text-field': '🚗', 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 20, 12, 32, 18, 48], 'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' } }); } catch (e2) { if (MAP_DEBUG) console.warn('add vendedores-last-icon fallback failed', e2); }
                }
              }
              if (!map.getLayer('vendedores-last-labels')) {
                map.addLayer({ id: 'vendedores-last-labels', type: 'symbol', source: 'vendedores-last', layout: { 'text-field': ['get', 'user_full_name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 13, 12, 16, 18, 22], 'text-offset': [0, 2.5], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' }, paint: { 'text-color': '#FFD700', 'text-halo-color': '#000', 'text-halo-width': 3 } });
              }
              if (map.getLayer('vendedores-last-aura-today')) map.moveLayer('vendedores-last-aura-today');
              if (map.getLayer('vendedores-last-aura-yesterday')) map.moveLayer('vendedores-last-aura-yesterday');
              if (map.getLayer('vendedores-last-icon')) map.moveLayer('vendedores-last-icon');
              if (map.getLayer('vendedores-last-labels')) map.moveLayer('vendedores-last-labels');
            }
          } catch (err) {
            if (MAP_DEBUG) console.warn('vendedores fetch failed', err);
            (map as any).__vendedoresInitialized = true; // avoid retry storm on repeated updateLayers
          }
        }

        // Attach a single global handler to allow manual refresh of vendedores layer
        try {
          if (!(map as any).__vendedoresRefreshHandlerAttached) {
            (map as any).__vendedoresRefreshHandlerAttached = true;
            window.addEventListener('vendedores:refresh', async () => {
              try {
                if (MAP_DEBUG) console.debug('vendedores:refresh received');
                const resp = await fetch('/vendedores/ultima_ubicacion');
                const contentType2 = resp.headers.get('content-type') || '';
                let vendedoresJson2: any = null;
                if (contentType2.includes('application/json')) vendedoresJson2 = await resp.json().catch(() => null);
                const vendedoresArray2: any[] = Array.isArray(vendedoresJson2) ? vendedoresJson2 : (vendedoresJson2 && Array.isArray(vendedoresJson2.rows) ? vendedoresJson2.rows : []);
                const now2 = Date.now();
                const twoDaysAgo2 = new Date(now2 - (2 * 24 * 60 * 60 * 1000));
                const filtered2 = (vendedoresArray2 || []).filter((v: any) => {
                  const td = v.tracking_date || v.trackingDate || v.updated_at || v.timestamp || null;
                  if (!td) return false;
                  const d = new Date(td);
                  if (Number.isNaN(d.getTime())) return false;
                  return d >= twoDaysAgo2 && d <= new Date(now2);
                });
                const vendedoresFeatures2 = filtered2.map((v: any) => {
                  const lat = Number(v.latitude ?? v.latitud ?? v.lat);
                  const lng = Number(v.longitude ?? v.longitud ?? v.lon ?? v.lng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                  const td = v.tracking_date || v.trackingDate || v.updated_at || v.timestamp || null;
                  let when: string | null = null;
                  if (td) {
                    const d = new Date(td);
                    if (!Number.isNaN(d.getTime())) {
                      const today = new Date();
                      const dY = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                      const tY = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                      const diff = Math.round((tY.getTime() - dY.getTime()) / (24 * 60 * 60 * 1000));
                      if (diff === 0) when = 'today';
                      else if (diff === 1) when = 'yesterday';
                    }
                  }
                  if (!when) return null;
                  return { type: 'Feature' as const, properties: { user_id: v.user_id, user_full_name: v.user_full_name || v.nombre || v.user_id, battery_level: v.battery_level, tracking_date: v.tracking_date || v.trackingDate || null, localizado_hoy: when === 'today', when }, geometry: { type: 'Point' as const, coordinates: [lng, lat] } };
                }).filter(Boolean) as GeoJSON.Feature[];
                (map as any).__vendedoresCache = { ts: Date.now(), features: vendedoresFeatures2 };
                try {
                  const data2 = { type: 'FeatureCollection', features: vendedoresFeatures2 };
                    safeSetSourceData('vendedores-last', data2);
                    try { if (!map.getLayer('vendedores-last-aura-today')) map.addLayer({ id: 'vendedores-last-aura-today', type: 'circle', source: 'vendedores-last', filter: ['==', ['get', 'when'], 'today'], paint: { 'circle-color': '#10b981', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18, 18, 28], 'circle-opacity': 0.35, 'circle-blur': 0.5 }, layout: { 'visibility': layersVisible.vendedores ? 'visible' : 'none' } }); } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-aura-today failed', e); }
                    try { if (!map.getLayer('vendedores-last-aura-yesterday')) map.addLayer({ id: 'vendedores-last-aura-yesterday', type: 'circle', source: 'vendedores-last', filter: ['==', ['get', 'when'], 'yesterday'], paint: { 'circle-color': '#ef4444', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 12, 12, 18, 18, 28], 'circle-opacity': 0.35, 'circle-blur': 0.5 }, layout: { 'visibility': layersVisible.vendedores ? 'visible' : 'none' } }); } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-aura-yesterday failed', e); }
                    try {
                      const IMG_ID = 'vendedor-car-image';
                      await ensureImage(IMG_ID, '/car.png');
                      const symbolLayout: any = { 'icon-image': IMG_ID, 'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.03, 6, 0.035, 12, 0.06, 16, 0.09, 22, 0.12], 'icon-allow-overlap': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' };
                      try { if (!map.getLayer('vendedores-last-icon')) map.addLayer({ id: 'vendedores-last-icon', type: 'symbol', source: 'vendedores-last', layout: symbolLayout, paint: {} }); } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-icon with image failed', e); }
                    } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-icon failed', e); }
                    try { if (!map.getLayer('vendedores-last-labels')) map.addLayer({ id: 'vendedores-last-labels', type: 'symbol', source: 'vendedores-last', layout: { 'text-field': ['get', 'user_full_name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 13, 12, 16, 18, 22], 'text-offset': [0, 2.5], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': layersVisible.vendedores ? 'visible' : 'none' }, paint: { 'text-color': '#FFD700', 'text-halo-color': '#000', 'text-halo-width': 3 } }); } catch (e) { if (MAP_DEBUG) console.warn('add vendedores-last-labels failed', e); }
                    if (map.getLayer('vendedores-last-aura')) map.moveLayer('vendedores-last-aura');
                    if (map.getLayer('vendedores-last-icon')) map.moveLayer('vendedores-last-icon');
                    if (map.getLayer('vendedores-last-labels')) map.moveLayer('vendedores-last-labels');
                } catch (e) { if (MAP_DEBUG) console.warn('vendedores refresh layer update failed', e); }
              } catch (e) {
                if (MAP_DEBUG) console.warn('vendedores:refresh handler failed', e);
              }
            });
          }
        } catch (e) {
          if (MAP_DEBUG) console.warn('failed to attach vendedores refresh handler', e);
        }
      } catch (err) {
        if (MAP_DEBUG) console.warn('vendedores fetch failed outer', err);
      }

      // Fit bounds based on zonas if available (only once per map to avoid re-centering on updates)
      if (mapaData.zonas && mapaData.zonas.length > 0 && !(map as any).__zonasFitDone) {
        const bounds = new mapboxgl.LngLatBounds();
        let hasCoordenadas = false;
        mapaData.zonas.forEach(zona => {
          if (zona.coordinates) {
            let coords = zona.coordinates as any;
            if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) coords = coords[0] as [number, number][];
            coords.forEach((coord: any) => { if (Array.isArray(coord) && coord.length >= 2) { bounds.extend([Number(coord[0]), Number(coord[1])] as [number, number]); hasCoordenadas = true; } });
          }
        });
        if (hasCoordenadas) {
          map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 1200 });
          (map as any).__zonasFitDone = true;
        }
      }

      // Mark layers initialized so subsequent updateLayers calls avoid destructive resets
      try { (map as any).__layersInitialized = true; } catch (e) { /* ignore */ }

      // Apply visibility for layers already added
      Object.entries(layersVisible).forEach(([layerType, visible]) => {
        const layerIds: { [key: string]: string[] } = {
          zonas: ['zonas-fill', 'zonas-line', 'zonas-3d'],
          rutas: ['rutas-lines'],
          labels: ['zonas-labels'],
          clientes: ['clientes-visitados', 'clientes-no-visitados', 'clientes-visitados-numeros']
        };
        layerIds[layerType]?.forEach(layerId => {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
        });
      });

    } catch (error) {
      if (MAP_DEBUG) console.error('updateLayers error', error);
    }
  };

  return { updateLayers };
}

