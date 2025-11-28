const API_BASE = import.meta.env.VITE_API_BASE || '';

export const getRutasMapa = async (params: Record<string, any> = {}) => {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/mapa/rutas${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
