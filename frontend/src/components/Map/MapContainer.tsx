import React, { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
// Temporary wrapper that delegates to the existing component to preserve behavior
import MapaCompletoProfesional from '../mapa/MapaCompletoProfesional';
import MapSidebar from './MapSidebar';
import type { MapaData, FiltrosUI } from '../../types';
import { useMapbox } from '../../hooks/useMapbox';

interface MapContainerProps {
  mapaData: MapaData | null;
  onAplicarFiltros?: (filtros: FiltrosUI) => void;
  loading?: boolean;
}

const MapContainer: React.FC<MapContainerProps> = (props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Mapbox token (was previously in the big component). Keep here for now.
  const token = 'pk.eyJ1IjoibWFudWF5YWxhZyIsImEiOiJjbWZwYm5rbHAwZWg1MmtwdWt5OTcxaHBmIn0.UL-UyBJogCQn0-81hsoQYA';
  const { mapRef, init } = useMapbox(token, 'mapbox://styles/mapbox/streets-v11', true);

  useEffect(() => {
    // Initialize Mapbox on the child's container element when available (run once after mount)
    let mounted = true;
    const tryInit = async () => {
      const start = Date.now();
      while (mounted && !mapRef.current && Date.now() - start < 3000) {
        const el = containerRef.current;
        if (el) {
          try {
            init(el);
            break;
          } catch (e) {
            // continue retrying
          }
        }
        // wait a bit
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 100));
      }
    };

    tryInit();
    return () => { mounted = false; };
  }, [init, mapRef]);

  // Layout: sidebar left, map content right. Pass refs down so child uses initialized map/container
  return (
    <div className="flex h-full w-full">
      <div className="flex-shrink-0">
        <MapSidebar mapaData={props.mapaData} onAplicarFiltros={props.onAplicarFiltros} />
      </div>
      <div className="flex-1 relative">
        <MapaCompletoProfesional {...props} externalMapRef={mapRef} externalContainerRef={containerRef} />
      </div>
    </div>
  );
};

export default MapContainer;
