export const getRutasMapa = async (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/mapa/rutas${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
