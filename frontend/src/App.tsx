import React from 'react'
import MapContainer from './components/Map/MapContainer'
import useMapaData from './hooks/useMapaData';
import './App.css'


function App() {
  const { mapaData, loading, aplicarFiltros } = useMapaData();
  return (
    <div className="w-full h-screen">
      <MapContainer
        mapaData={mapaData}
        onAplicarFiltros={aplicarFiltros}
        loading={loading}
      />
    </div>
  );
}

export default App
