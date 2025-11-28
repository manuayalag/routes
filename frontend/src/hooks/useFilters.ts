import { useState, useCallback } from 'react';

export function useFilters(initial = { vendedor: 'todos', periodo: 'hoy' }) {
  const [filters, setFilters] = useState(initial);
  const setVendedor = useCallback((v: string) => setFilters(f => ({ ...f, vendedor: v })), []);
  const setPeriodo = useCallback((p: string) => setFilters(f => ({ ...f, periodo: p })), []);
  return { filters, setVendedor, setPeriodo };
}
