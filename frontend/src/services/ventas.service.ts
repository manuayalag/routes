export const getVentasPorRouteDetail = async (
  routeDetailId: number,
  onlyEventType?: number,
  fechaInicio?: string,
  fechaFin?: string
) => {
  const qs: string[] = [];
  if (onlyEventType !== undefined) qs.push(`only_event_type=${encodeURIComponent(String(onlyEventType))}`);
  if (fechaInicio) qs.push(`fecha_inicio=${encodeURIComponent(fechaInicio)}`);
  if (fechaFin) qs.push(`fecha_fin=${encodeURIComponent(fechaFin)}`);
  const q = qs.length ? `?${qs.join('&')}` : '';
  const res = await fetch(`/route_detail/${routeDetailId}/ventas${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
