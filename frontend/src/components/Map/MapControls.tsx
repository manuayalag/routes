import React from 'react';
import { Maximize2, Minimize2, Settings, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MapControlsProps {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleSettings: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

const MapControls: React.FC<MapControlsProps> = ({ fullscreen, onToggleFullscreen, onToggleSettings, onZoomIn, onZoomOut, onResetView }) => {
  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col space-y-2">
      <div className="flex flex-col space-y-2">
        <button onClick={onToggleFullscreen} className="bg-white shadow-lg rounded-lg p-3 hover:bg-gray-50 transition-all">
          {fullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
        <button onClick={onToggleSettings} className="bg-white shadow-lg rounded-lg p-3 hover:bg-gray-50 transition-all">
          <Settings className="w-5 h-5" />
        </button>
        <div className="flex flex-col mt-2 space-y-2">
          <button onClick={onZoomIn} className="p-2 bg-white rounded hover:bg-gray-100"><ZoomIn /></button>
          <button onClick={onZoomOut} className="p-2 bg-white rounded hover:bg-gray-100"><ZoomOut /></button>
          <button onClick={onResetView} className="p-2 bg-white rounded hover:bg-gray-100"><RotateCcw /></button>
        </div>
      </div>
    </div>
  );
};

export default MapControls;
