import React from 'react';
import type { Ruta } from '../../../types/map.types';

interface MapPlayerProps {
  activeRoute: Ruta | null;
  visible: boolean;
  playerStep: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const MapPlayer: React.FC<MapPlayerProps> = ({ activeRoute, visible, playerStep, onPrev, onNext, onClose }) => {
  if (!visible || !activeRoute) return null;

  return (
    <div className="absolute right-20 bottom-20 z-40 w-96 bg-white rounded-lg shadow-xl p-4 text-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-bold">Reproductor: {activeRoute.vendedor} — {activeRoute.zona_name}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-xs px-2 py-1 bg-gray-100 rounded">Cerrar</button>
        </div>
      </div>

      {/* The detailed player UI is currently implemented inside the original component to preserve exact behavior. */}
      <div className="text-xs text-gray-600">Visita {playerStep + 1} — UI delegated to original component.</div>

      <div className="flex justify-between mt-4">
        <button onClick={onPrev} className="px-3 py-2 bg-gray-100 rounded">← Anterior</button>
        <button onClick={onNext} className="px-3 py-2 bg-blue-600 text-white rounded">Siguiente →</button>
      </div>
    </div>
  );
};

export default MapPlayer;
