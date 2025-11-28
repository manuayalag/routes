import React from 'react';
import MapContainer from '../components/Map/MapContainer';
import type { MapaData } from '../types';

const MapaDashboard: React.FC = () => {
  // For now load data from parent/app; MapContainer delegates to original component
  const mapaData: MapaData | null = null;
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MapContainer mapaData={mapaData} loading={false} />
    </div>
  );
};

export default MapaDashboard;
