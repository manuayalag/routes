export const getColorByPerformance = (zona: { kpis?: { rendimiento_vs_promedio?: string; crecimiento_porcentual?: number } }) => {
  const rendimiento = zona.kpis?.rendimiento_vs_promedio;
  const crecimiento = zona.kpis?.crecimiento_porcentual || 0;
  
  if (rendimiento === 'excelente' || crecimiento > 20) return '#10b981';
  if (rendimiento === 'bueno' || crecimiento > 10) return '#06d6a0';
  if (rendimiento === 'promedio' || (crecimiento >= 0 && crecimiento <= 10)) return '#f59e0b';
  if (rendimiento === 'bajo' || (crecimiento < 0 && crecimiento > -10)) return '#f97316';
  return '#ef4444';
};

export const getZonaIntensity = (zona: { kpis?: { ventas_actuales?: number } }) => {
  const ventas = zona.kpis?.ventas_actuales || 0;
  if (ventas > 1000000) return 0.9;
  if (ventas > 500000) return 0.7;
  if (ventas > 100000) return 0.5;
  return 0.3;
};
