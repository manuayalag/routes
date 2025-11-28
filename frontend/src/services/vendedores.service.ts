const API_BASE = import.meta.env.VITE_API_BASE || '';

export const getVendedores = async () => {
  const res = await fetch(`${API_BASE}/vendedores`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  // body.vendedores expected
  return body.vendedores || [];
};

export const getUltimaUbicacionVendedores = async () => {
  const res = await fetch(`${API_BASE}/vendedores/ultima_ubicacion`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
