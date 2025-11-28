import React from 'react';

const MapLegend: React.FC = () => {
  return (
    <div className="bg-white/95 rounded-lg shadow-xl p-4 text-sm">
      <div className="font-bold mb-2">📍 Leyenda</div>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-500"></div><span>Excelente</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-300"></div><span>Bueno</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500"></div><span>Promedio</span></div>
      </div>
    </div>
  );
};

export default MapLegend;
