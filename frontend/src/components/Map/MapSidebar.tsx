import React, { useEffect, useState, useRef } from 'react';
import type { MapaData, Zona, Ruta, FiltrosUI } from '../../../types';
import { getVentasPorRouteDetail } from '../../services/ventas.service';
import { getVendedores } from '../../services/vendedores.service';

// Small concurrency helper: map an array with limited parallel requests
async function mapWithConcurrency<T, R>(items: T[], mapper: (t: T) => Promise<R>, concurrency = 8): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let idx = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        results[i] = await mapper(items[i]);
      } catch (e) {
        results[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchVentasWithRetries(id: number, maxRetries = 2): Promise<any | null> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await getVentasPorRouteDetail(id).catch(() => { throw new Error('fetch failed'); });
    } catch (e) {
      attempt += 1;
      if (attempt > maxRetries) return null;
      // Backoff small delay
      await new Promise(res => setTimeout(res, 200 * attempt));
    }
  }
  return null;
}

interface MapSidebarProps {
  mapaData: MapaData | null;
  collapsed?: boolean;
  onAplicarFiltros?: (f: FiltrosUI) => void;
}

const MapSidebar: React.FC<MapSidebarProps> = ({ mapaData, collapsed = false, onAplicarFiltros }) => {
  const [ventasPayload, setVentasPayload] = useState<any | null>(null);
  const [topProducts, setTopProducts] = useState<any[] | null>(null);
  const [loadingTopProducts, setLoadingTopProducts] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zona | null>(null);
  const [zoneProductsMap, setZoneProductsMap] = useState<Record<string, any[]>>({});
  const [zoneLoadingMap, setZoneLoadingMap] = useState<Record<string, boolean>>({});
  const [expandedZoneIds, setExpandedZoneIds] = useState<Record<string, boolean>>({});
  const [selectedZoneOrRoute, setSelectedZoneOrRoute] = useState<string | null>(null);
  const [selectedRouteObj, setSelectedRouteObj] = useState<Ruta | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(320);
  // Date filter UI state
  const [periodo, setPeriodo] = useState<string>('hoy');
  const [fecha, setFecha] = useState<string>('');
  const [dateDesde, setDateDesde] = useState<string>('');
  const [dateHasta, setDateHasta] = useState<string>('');
  // Vendedores filter state
  const [vendedoresList, setVendedoresList] = useState<Array<{id:number, full_name:string}>>([]);
  const [vendorQuery, setVendorQuery] = useState<string>('');
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>([]);
  const [showVendorPicker, setShowVendorPicker] = useState<boolean>(false);
  // persistible: try load from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('sidebarWidth');
      if (raw) {
        const nw = Number(raw);
        if (!Number.isNaN(nw)) setSidebarWidth(Math.max(180, Math.min(900, nw)));
      }
    } catch (e) { /* ignore */ }
  }, []);

  // Load persisted date filters (if any) and default to today
  useEffect(() => {
    try {
      const rawDesde = window.localStorage.getItem('sidebar_fecha_desde');
      const rawHasta = window.localStorage.getItem('sidebar_fecha_hasta');
      if (rawDesde) setDateDesde(rawDesde);
      if (rawHasta) setDateHasta(rawHasta);
    } catch (e) { /* ignore */ }
    // default to hoy if none
    const hoyStr = new Date().toISOString().split('T')[0];
    if (!dateDesde && !dateHasta) {
      setPeriodo('hoy');
      setFecha(hoyStr);
      setDateDesde(hoyStr);
      setDateHasta(hoyStr);
    }
  }, []);

  // Load vendedores list on mount and when refreshed
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const v = await getVendedores();
        if (!mounted) return;
        setVendedoresList(v || []);
      } catch (e) {
        console.error('Error cargando vendedores', e);
        setVendedoresList([]);
      }
    };
    load();
    const handler = () => { load(); };
    window.addEventListener('vendedores:refresh', handler as EventListener);
    return () => { mounted = false; window.removeEventListener('vendedores:refresh', handler as EventListener); };
  }, []);

  // Apply default filters on first mount (show today)
  useEffect(() => {
    // give React a tick to render before applying
    const t = setTimeout(() => {
      try { aplicarFiltrosLocal(); } catch (e) { /* ignore */ }
    }, 50);
    return () => clearTimeout(t);
  }, []);
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  // Format helpers (accessible across render)
  const formatCurrency = (v: number | null | undefined) => {
    try { return (v == null) ? '-' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(v)); } catch (e) { return Number(v || 0).toLocaleString(); }
  };
  const formatQty = (v: number | undefined | null) => (v == null ? '-' : Number(v).toLocaleString());

  const handleShowTopProductsForZone = async (zona: Zona) => {
    if (!mapaData) return;
    setSelectedZone(zona as Zona);
    setSelectedZoneOrRoute(zona.nombre || (zona.zona_id || zona.id || 'zona'));
    setTopProducts(null);
    setLoadingTopProducts(true);
    try {
      // find rutas that belong to this zone
      const rutasEnZona: Ruta[] = (mapaData.rutas || []).filter(r => (r.zona_code && String(r.zona_code) === String(zona.zona_id)) || (r.zona_name && String(r.zona_name) === String(zona.nombre)));
      const rdIds: number[] = [];
      rutasEnZona.forEach(r => (r.clientes || []).forEach((c: any) => {
        const rd = Number(c.route_detail_id ?? c.route_detail ?? c.cliente_id ?? c.id);
        if (rd && !rdIds.includes(rd)) rdIds.push(rd);
      }));

      const productsMap: Record<string, { name: string; code?: string; qty: number; sales: number }> = {};
      let aggSalesTotal = 0;

      // fetch ventas in limited concurrency to avoid exhausting browser resources
      const results = await mapWithConcurrency<number, any>(rdIds, (id) => fetchVentasWithRetries(id), 8);
      for (const data of results) {
        if (!data) continue;
        if (Array.isArray(data.events) && data.events.length > 0) {
          for (const ev of data.events) {
            if (!Array.isArray(ev.invoices)) continue;
            for (const inv of ev.invoices) {
              if (!Array.isArray(inv.lines)) continue;
              for (const ln of inv.lines) {
                const key = String(ln.product_code || ln.product_name || 'unknown');
                if (!productsMap[key]) productsMap[key] = { name: ln.product_name || ln.product_code || key, code: ln.product_code, qty: 0, sales: 0 };
                productsMap[key].qty += Number(ln.quantity || 0);
                productsMap[key].sales += Number(ln.line_total || (ln.quantity * ln.unit_price) || 0);
              }
            }
          }
        } else if (data.ventas_aggregadas) {
          // no product lines: accumulate aggregated invoice amount (if present and >0)
          const amt = Number(data.ventas_aggregadas.invoice_amount || 0);
          if (amt > 0) {
            aggSalesTotal += amt;
          }
        }
      }
      // If we have aggregated sales without detailed lines, show one summary entry
      if (aggSalesTotal > 0) {
        const key = `AGG_SUM_${Date.now()}`;
        productsMap[key] = { name: `Ventas agregadas (sin detalle)`, qty: 0, sales: aggSalesTotal };
      }
      const list = Object.entries(productsMap).map(([k, v]) => ({ key: k, ...v })).sort((a,b) => b.qty - a.qty || b.sales - a.sales);
      setTopProducts(list.slice(0, 30));
      // also populate inline map for this zone (use zone id/key)
      try {
        const zid = String(zona.zona_id ?? zona.id ?? zona.nombre ?? 'zona');
        setZoneProductsMap(m => ({ ...m, [zid]: list.slice(0, 30) }));
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('Error agregando top products por zona', e);
      setTopProducts(null);
    } finally {
      setLoadingTopProducts(false);
    }
  };

  const handleShowTopProductsInline = async (zona: Zona) => {
    const zid = String(zona.zona_id ?? zona.id ?? zona.nombre ?? 'zona');
    const currently = !!expandedZoneIds[zid];
    if (currently) {
      setExpandedZoneIds(m => ({ ...m, [zid]: false }));
      return;
    }
    // expand
    setExpandedZoneIds(m => ({ ...m, [zid]: true }));
    if (zoneProductsMap[zid]) return; // already loaded
    setZoneLoadingMap(m => ({ ...m, [zid]: true }));
    try {
      // reuse same fetching logic as the main function but scoped to this zone
      if (!mapaData) return;
      const rutasEnZona: Ruta[] = (mapaData.rutas || []).filter(r => (r.zona_code && String(r.zona_code) === String(zona.zona_id)) || (r.zona_name && String(r.zona_name) === String(zona.nombre)));
      const rdIds: number[] = [];
      rutasEnZona.forEach(r => (r.clientes || []).forEach((c: any) => {
        const rd = Number(c.route_detail_id ?? c.route_detail ?? c.cliente_id ?? c.id);
        if (rd && !rdIds.includes(rd)) rdIds.push(rd);
      }));

      const productsMap: Record<string, { name: string; code?: string; qty: number; sales: number }> = {};
      let aggSalesTotal = 0;
      const results = await mapWithConcurrency<number, any>(rdIds, (id) => fetchVentasWithRetries(id), 8);
      for (const data of results) {
        if (!data) continue;
        if (Array.isArray(data.events) && data.events.length > 0) {
          for (const ev of data.events) {
            if (!Array.isArray(ev.invoices)) continue;
            for (const inv of ev.invoices) {
              if (!Array.isArray(inv.lines)) continue;
              for (const ln of inv.lines) {
                const key = String(ln.product_code || ln.product_name || 'unknown');
                if (!productsMap[key]) productsMap[key] = { name: ln.product_name || ln.product_code || key, code: ln.product_code, qty: 0, sales: 0 };
                productsMap[key].qty += Number(ln.quantity || 0);
                productsMap[key].sales += Number(ln.line_total || (ln.quantity * ln.unit_price) || 0);
              }
            }
          }
        } else if (data.ventas_aggregadas) {
          const amt = Number(data.ventas_aggregadas.invoice_amount || 0);
          if (amt > 0) aggSalesTotal += amt;
        }
      }
      if (aggSalesTotal > 0) {
        const key = `AGG_SUM_${Date.now()}`;
        productsMap[key] = { name: `Ventas agregadas (sin detalle)`, qty: 0, sales: aggSalesTotal };
      }
      const list = Object.entries(productsMap).map(([k, v]) => ({ key: k, ...v })).sort((a,b) => b.qty - a.qty || b.sales - a.sales);
      setZoneProductsMap(m => ({ ...m, [zid]: list.slice(0, 30) }));
    } catch (e) {
      console.error('Error agregando top products por zona (inline)', e);
      setZoneProductsMap(m => ({ ...m, [zid]: [] }));
    } finally {
      setZoneLoadingMap(m => ({ ...m, [zid]: false }));
    }
  };

  const aplicarFiltrosLocal = () => {
    // Build FiltrosUI to match useMapaData.aplicarFiltros expectations
    // If a date range is provided, prefer 'rango_fechas' so the hook uses the provided range
    const periodoFinal = (dateDesde && dateHasta) ? 'rango_fechas' : (periodo || 'hoy');
    const filtrosUI: FiltrosUI = {
      periodo: periodoFinal,
      fecha: fecha || '',
      vendedor: selectedVendorIds && selectedVendorIds.length > 0 ? String(selectedVendorIds.join(',')) : 'todos',
      vendedor_ids: selectedVendorIds && selectedVendorIds.length > 0 ? selectedVendorIds : undefined,
      dateRange: { desde: dateDesde || '', hasta: dateHasta || '' }
    };
    try {
      if (onAplicarFiltros && typeof onAplicarFiltros === 'function') {
        onAplicarFiltros(filtrosUI);
      } else {
        // fallback: dispatch global event
        window.dispatchEvent(new CustomEvent('filtros:aplicar', { detail: filtrosUI }));
      }
      try { window.localStorage.setItem('sidebar_fecha_desde', filtrosUI.dateRange.desde || ''); } catch (e) {}
      try { window.localStorage.setItem('sidebar_fecha_hasta', filtrosUI.dateRange.hasta || ''); } catch (e) {}
    } catch (e) {
      console.error('Error aplicando filtros desde sidebar', e);
    }
  };

  const handleShowTopProductsForRoute = async (ruta: Ruta) => {
    if (!ruta) return;
    setSelectedZoneOrRoute(`Ruta ${ruta.route_id}`);
    setTopProducts(null);
    setLoadingTopProducts(true);
    try {
      const rdIds: number[] = [];
      (ruta.clientes || []).forEach((c: any) => {
        const rd = Number(c.route_detail_id ?? c.route_detail ?? c.cliente_id ?? c.id);
        if (rd && !rdIds.includes(rd)) rdIds.push(rd);
      });
      const productsMap: Record<string, { name: string; code?: string; qty: number; sales: number }> = {};
      let aggSalesTotal = 0;
      // fetch ventas for route with limited concurrency/retries
      const results = await mapWithConcurrency<number, any>(rdIds, (id) => fetchVentasWithRetries(id), 8);
      for (const data of results) {
        if (!data) continue;
        if (Array.isArray(data.events) && data.events.length > 0) {
          for (const ev of data.events) {
            if (!Array.isArray(ev.invoices)) continue;
            for (const inv of ev.invoices) {
              if (!Array.isArray(inv.lines)) continue;
              for (const ln of inv.lines) {
                const key = String(ln.product_code || ln.product_name || 'unknown');
                if (!productsMap[key]) productsMap[key] = { name: ln.product_name || ln.product_code || key, code: ln.product_code, qty: 0, sales: 0 };
                productsMap[key].qty += Number(ln.quantity || 0);
                productsMap[key].sales += Number(ln.line_total || (ln.quantity * ln.unit_price) || 0);
              }
            }
          }
        } else if (data.ventas_aggregadas) {
          const amt = Number(data.ventas_aggregadas.invoice_amount || 0);
          if (amt > 0) aggSalesTotal += amt;
        }
      }
      if (aggSalesTotal > 0) {
        const key = `AGG_SUM_${Date.now()}`;
        productsMap[key] = { name: `Ventas agregadas (sin detalle)`, qty: 0, sales: aggSalesTotal };
      }
      const list = Object.entries(productsMap).map(([k, v]) => ({ key: k, ...v })).sort((a,b) => b.qty - a.qty || b.sales - a.sales);
      setTopProducts(list.slice(0, 30));
    } catch (e) {
      console.error('Error agregando top products por ruta', e);
      setTopProducts(null);
    } finally {
      setLoadingTopProducts(false);
    }
  };

  // KPI color helpers
  const kpiColorForGrowth = (pct: number | undefined | null) => {
    if (pct == null) return 'text-gray-700';
    if (pct >= 50) return 'text-green-700';
    if (pct >= 20) return 'text-green-500';
    if (pct >= 0) return 'text-yellow-600';
    return 'text-red-600';
  };

  const kpiBadgeForPerformance = (kpis: any) => {
    // determine overall performance color from kpis.rendimiento_vs_promedio or crecimiento
    const rend = kpis?.rendimiento_vs_promedio;
    if (rend === 'excelente') return 'bg-green-100 text-green-800';
    if (rend === 'promedio') return 'bg-yellow-100 text-yellow-800';
    if (rend === 'bajo') return 'bg-red-100 text-red-800';
    const pct = Number(kpis?.crecimiento_porcentual ?? 0);
    if (pct >= 20) return 'bg-green-100 text-green-800';
    if (pct >= 0) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Sidebar resize handlers
  useEffect(() => {
    let startX = 0;
    let startWidth = 0;
    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const newW = Math.max(220, Math.min(720, startWidth + dx));
      setSidebarWidth(newW);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    const onMouseDown = (ev: MouseEvent) => {
      startX = ev.clientX;
      startWidth = sidebarWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      ev.preventDefault();
    };
    const res = resizerRef.current;
    if (res) res.addEventListener('mousedown', onMouseDown as any);
    return () => { if (res) res.removeEventListener('mousedown', onMouseDown as any); };
  }, [sidebarWidth]);

  useEffect(() => {
    const handler = (ev: any) => {
      try {
        setVentasPayload(ev.detail?.payload || null);
      } catch (e) { setVentasPayload(null); }
    };
    window.addEventListener('cliente:ventas', handler as EventListener);
    const rutaHandler = (ev: any) => {
      try {
        const ruta = ev.detail?.ruta;
        if (ruta) {
          // Do NOT auto-fetch top products for the route; selection only.
          setSelectedRouteObj(ruta as Ruta);
          setSelectedZoneOrRoute(`Ruta ${(ruta as Ruta).route_id}`);
          // clear previous topProducts until user requests
          setTopProducts(null);
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('ruta:click', rutaHandler as EventListener);
    const zonaHandler = (ev: any) => {
      try {
        const zonaPayload = ev.detail?.zona;
        if (zonaPayload) {
          // zonaPayload may be just properties; try to preserve as Zona
          setSelectedZone(zonaPayload as Zona);
          // auto-fetch top products and show sticky summary
          try { handleShowTopProductsForZone(zonaPayload as Zona); } catch (e) { console.error('zona handler fetch failed', e); }
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('zona:click', zonaHandler as EventListener);
    return () => { 
      window.removeEventListener('cliente:ventas', handler as EventListener);
      window.removeEventListener('ruta:click', rutaHandler as EventListener);
      window.removeEventListener('zona:click', zonaHandler as EventListener);
    };
  }, []);

  return (
    <div ref={sidebarRef} className={`bg-white shadow-xl z-30 flex flex-col border-r h-full max-h-screen overflow-hidden`} style={{ width: sidebarWidth }}>
      <div className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white flex-shrink-0 relative">
        <div style={{ position: 'absolute', right: -6, top: 0, bottom: 0, width: 12, cursor: 'col-resize' }} ref={resizerRef} title="Arrastra para redimensionar" />
          <div className="pl-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">📊 STK RUTAS</h2>
            <p className="text-sm opacity-90 mt-1">Analytics en Tiempo Real</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.dispatchEvent(new Event('vendedores:refresh'))} className="text-xs px-2 py-1 bg-white bg-opacity-20 hover:bg-opacity-40 rounded">Refrescar vendedores</button>
            <div className="flex items-center gap-1 bg-white bg-opacity-10 rounded px-2 py-1">
              <button title="Enmas" onClick={() => { setSidebarWidth(w => { const nw = Math.max(180, w - 40); try { localStorage.setItem('sidebarWidth', String(nw)); } catch (e) {} return nw; }); }} className="text-xs px-2 py-0.5 bg-white bg-opacity-20 rounded">-</button>
              <input aria-label="Ancho sidebar" value={String(sidebarWidth)} onChange={(e) => { const v = Number(e.target.value || 0); if (!Number.isNaN(v)) { const nw = Math.max(180, Math.min(900, v)); setSidebarWidth(nw); try { localStorage.setItem('sidebarWidth', String(nw)); } catch (err) {} } }} className="w-16 text-xs text-center bg-transparent border border-white border-opacity-10 rounded px-1" />
              <button title="Mas" onClick={() => { setSidebarWidth(w => { const nw = Math.min(900, w + 40); try { localStorage.setItem('sidebarWidth', String(nw)); } catch (e) {} return nw; }); }} className="text-xs px-2 py-0.5 bg-white bg-opacity-20 rounded">+</button>
            </div>
          </div>
        </div>
        </div>
      </div>
      {/* Date filters UI */}
      <div className="p-3 bg-white border-b">
        <div className="flex items-center gap-2">
          <button onClick={() => { const hoyStr = new Date().toISOString().split('T')[0]; setPeriodo('hoy'); setFecha(hoyStr); setDateDesde(hoyStr); setDateHasta(hoyStr); aplicarFiltrosLocal(); }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Hoy</button>
          <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().split('T')[0]; setPeriodo('ayer'); setFecha(s); setDateDesde(s); setDateHasta(s); aplicarFiltrosLocal(); }} className="px-2 py-1 bg-gray-100 rounded text-xs">Ayer</button>
          <button onClick={() => { setPeriodo('rango_fechas'); }} className="px-2 py-1 bg-gray-100 rounded text-xs">Rango</button>
        </div>
        <div className="mt-2 flex gap-2 items-center">
          <input type="date" value={dateDesde} onChange={(e) => setDateDesde(e.target.value)} className="text-xs p-1 border rounded" />
          <span className="text-xs">a</span>
          <input type="date" value={dateHasta} onChange={(e) => setDateHasta(e.target.value)} className="text-xs p-1 border rounded" />
          <button onClick={aplicarFiltrosLocal} className="ml-auto px-2 py-1 bg-green-600 text-white rounded text-xs">Aplicar</button>
        </div>
          {/* Vendedor filter */}
          <div className="mt-3">
            <div className="text-xs font-semibold mb-1">Vendedores</div>
            <div className="flex gap-2">
              <input value={vendorQuery} onChange={(e) => setVendorQuery(e.target.value)} placeholder="Buscar vendedor" className="text-xs p-1 border rounded flex-grow" />
              <button onClick={() => { setSelectedVendorIds([]); setVendorQuery(''); aplicarFiltrosLocal(); }} className="px-2 py-1 bg-gray-100 rounded text-xs">Todos</button>
            </div>
            <div className="mt-2 max-h-28 overflow-auto border rounded p-1 bg-white">
              {vendedoresList && vendedoresList.length > 0 ? (
                vendedoresList.filter(v => (v.full_name || '').toLowerCase().includes((vendorQuery || '').toLowerCase())).slice(0, 200).map(v => (
                  <label key={v.id} className="block text-xs">
                    <input type="checkbox" checked={selectedVendorIds.includes(v.id)} onChange={() => {
                      setSelectedVendorIds(prev => prev.includes(v.id) ? prev.filter(x => x !== v.id) : [...prev, v.id]);
                    }} />
                    <span className="ml-2">{v.full_name}</span>
                  </label>
                ))
              ) : (
                <div className="text-xs text-gray-500">Cargando vendedores...</div>
              )}
            </div>
          </div>
      </div>
      <div className="p-4 overflow-auto sidebar-scroll">
        {/* Sticky Zone Summary (appears when a zone is clicked on the map) */}
        {selectedZone && (
          <div className="mb-4 p-3 bg-white rounded border shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">Resumen Zona: {selectedZone.nombre || selectedZone.zona_id}</div>
                <div className="text-xs text-gray-600">Clientes visitados: <strong>{selectedZone.total_clientes_visitados ?? (selectedZone.kpis?.clientes_actuales ?? 0)}</strong></div>
                <div className="text-xs text-gray-600">Venta actual: <strong>{formatCurrency(selectedZone.kpis?.ventas_actuales ?? selectedZone.ventas ?? 0)}</strong></div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{selectedZone.kpis?.crecimiento_porcentual != null ? `${Number(selectedZone.kpis?.crecimiento_porcentual).toFixed(1)}%` : '-'}</div>
                <div className="text-xs mt-1"><span className={`${kpiBadgeForPerformance(selectedZone.kpis)} px-2 py-0.5 rounded text-xs`}>{(Number(selectedZone.kpis?.crecimiento_porcentual ?? 0)).toFixed(1)}%</span></div>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { try { handleShowTopProductsForZone(selectedZone); } catch (e) {} }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Productos Top</button>
                <button onClick={() => { setSelectedZone(null); setTopProducts(null); }} className="px-2 py-1 bg-gray-100 text-xs rounded">Cerrar</button>
              </div>
              <div className="mt-3">
                {loadingTopProducts ? (
                  <div className="text-xs text-gray-500">Cargando productos...</div>
                ) : topProducts && topProducts.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {topProducts.map((p: any, idx: number) => (
                      <div key={p.key || idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div className="text-sm">{p.name}</div>
                        <div className="text-right text-xs">
                          <div>Cant: <strong>{formatQty(p.qty)}</strong></div>
                          <div>Total: <strong>{formatCurrency(Number(p.sales || 0))}</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Haz click en 'Productos Top' para ver los más vendidos.</div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Resumen rápido */}
        <div className="mb-4">
          <h3 className="font-semibold">Resumen</h3>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {(() => {
              const ventasNow = (mapaData?.estadisticas_mapa?.ventas_totales ?? (
                (mapaData?.rutas || []).reduce((s, r) => s + ((r.clientes || []).reduce((ss, c) => ss + (Number(c.ventas || 0)), 0)), 0)
              ));
              const ventasPrev = ((mapaData?.zonas || []).reduce((s: number, z: any) => s + (z?.kpis?.ventas_periodo_anterior || 0), 0));
              const growthPct = ventasPrev ? ((ventasNow - ventasPrev) / Math.max(ventasPrev || 1, 1) * 100) : null;
              const nowClass = ventasNow >= ventasPrev ? 'text-green-700' : 'text-red-600';
              
              return (
                <>
                  <div className="p-2 bg-gray-50 rounded border flex justify-between items-center">
                    <div>
                      <div className="text-xs text-gray-600">Venta actual</div>
                      <div className="text-xs text-gray-500">(Periodo seleccionado)</div>
                    </div>
                    <div className={`font-bold ${nowClass}`}>{formatCurrency(ventasNow)}</div>
                  </div>
                  <div className="p-2 bg-gray-50 rounded border flex justify-between items-center">
                    <div>
                      <div className="text-xs text-gray-600">Venta anterior</div>
                      <div className="text-xs text-gray-500">(Periodo anterior)</div>
                    </div>
                    <div className={`font-bold ${kpiColorForGrowth(growthPct ?? undefined)}`}>{formatCurrency(ventasPrev)}</div>
                  </div>
                  <div className="p-2 bg-gray-50 rounded border flex justify-between items-center">
                    <div className="text-xs text-gray-600">% Crecimiento</div>
                    <div className={`font-bold ${kpiColorForGrowth(growthPct ?? undefined)}`}>{growthPct == null ? '-' : `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}%`}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Ranking de zonas */}
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Ranking de Zonas</h3>
          {mapaData?.zonas && mapaData.zonas.length > 0 ? (
            <div className="space-y-2">
              {([...(mapaData.zonas || [])] as Zona[]).sort((a,b) => ((b.kpis?.ventas_actuales || b.total_ventas || 0) - (a.kpis?.ventas_actuales || a.total_ventas || 0))).map((z, i) => (
                <div key={z.zona_id || z.id || i} className="p-2 bg-white rounded border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">{z.nombre}</div>
                      <div className="text-xs text-gray-600">Clientes visitados: <strong>{z.total_clientes_visitados ?? (z.kpis?.clientes_actuales ?? 0)}</strong></div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">
                        <div className={kpiColorForGrowth(z.kpis?.crecimiento_porcentual)}>{formatCurrency(z.kpis?.ventas_actuales ?? z.total_ventas ?? 0)}</div>
                      </div>
                      <div className="text-xs mt-1 text-gray-600">
                        <div>Venta anterior: <strong>{formatCurrency(z.kpis?.ventas_periodo_anterior ?? 0)}</strong></div>
                        <div>Promedio / cliente: <strong>{formatCurrency(z.kpis?.promedio_venta_cliente ?? z.kpis?.promedio_general ?? 0)}</strong></div>
                      </div>
                      <div className="text-xs mt-1">
                        <span className={`${kpiBadgeForPerformance(z.kpis)} px-2 py-0.5 rounded text-xs`}>{(Number(z.kpis?.crecimiento_porcentual ?? 0)).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => handleShowTopProductsInline(z)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Productos Top</button>
                  </div>
                  {(() => {
                    const zid = String(z.zona_id ?? z.id ?? z.nombre ?? 'zona');
                    const expanded = !!expandedZoneIds[zid];
                    const loading = !!zoneLoadingMap[zid];
                    const items = zoneProductsMap[zid] || [];
                    return expanded ? (
                      <div className="mt-3 p-2 bg-gray-50 rounded border">
                        {loading ? <div className="text-xs text-gray-500">Cargando productos...</div> : (
                          items && items.length > 0 ? (
                            <div className="space-y-2">
                              {items.map((p: any, idx: number) => (
                                <div key={p.key || idx} className="flex justify-between items-center text-xs">
                                  <div className="truncate pr-2">{p.name}</div>
                                  <div className="text-right">
                                    <div>Cant: <strong>{formatQty(p.qty)}</strong></div>
                                    <div>Total: <strong>{formatCurrency(Number(p.sales || 0))}</strong></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">No se encontraron productos para esta zona.</div>
                          )
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500">No hay zonas para mostrar.</div>
          )}
        </div>

        {ventasPayload ? (
          <div>
            <h3 className="font-semibold mb-2">Eventos / Ventas</h3>
            {Array.isArray(ventasPayload.events) && ventasPayload.events.length > 0 ? (
              ventasPayload.events.map((ev: any, idx: number) => (
                <div key={idx} className="mb-3 p-2 border rounded bg-gray-50">
                  <div className="text-sm font-medium">{ev.event_date ? new Date(ev.event_date).toLocaleString() : 'Evento'}</div>
                  {ev.comments && <div className="text-xs"><strong>{ev.comments}</strong></div>}
                  {Array.isArray(ev.invoices) && ev.invoices.length > 0 ? (
                    <div className="mt-2">
                      {ev.invoices.map((inv: any, j: number) => (
                        <div key={j} className="mb-2 p-2 bg-white border rounded">
                          <div className="text-xs font-semibold">Factura: {inv.invoice_number || '-'}</div>
                          <div className="text-xs text-right font-bold">{inv.invoice_total ? formatCurrency(Number(inv.invoice_total)) : ''}</div>
                          {Array.isArray(inv.lines) && inv.lines.length > 0 && (
                            <table className="w-full text-xs mt-2">
                              <tbody>
                                {inv.lines.map((ln: any, k: number) => (
                                  <tr key={k} className="border-b"><td>{ln.product_name || ln.product_code}</td><td className="text-right">{formatQty(Number(ln.quantity || 0))}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">No se encontraron eventos/ventas para el cliente seleccionado.</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-600">Selecciona un cliente en el mapa para ver eventos y ventas aquí.</div>
        )}

        {/* Top products panel */}
        {selectedZoneOrRoute && (
          <div className="mt-4 p-2 bg-white border rounded">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Top Productos — {selectedZoneOrRoute}</div>
              <div className="text-xs text-gray-500">{loadingTopProducts ? 'Cargando...' : (topProducts ? `${topProducts.length} items` : '')}</div>
            </div>
            {selectedRouteObj && (
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => { if (selectedRouteObj) handleShowTopProductsForRoute(selectedRouteObj); }} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Ver Top Productos de la ruta</button>
                  <button onClick={() => { if (selectedRouteObj) { try { window.dispatchEvent(new CustomEvent('ruta:open', { detail: { route_id: selectedRouteObj.route_id ?? selectedRouteObj.id } })); } catch (e) { console.error('dispatch ruta:open failed', e); } } }} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Ver ruta</button>
                </div>
              </div>
            )}
            {loadingTopProducts ? (
              <div className="text-xs text-gray-500">Cargando productos vendidos...</div>
            ) : topProducts && topProducts.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-auto">
                {topProducts.map((p: any, idx: number) => (
                  <div key={p.key || idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <div className="text-sm">{p.name}</div>
                    <div className="text-right text-xs">
                      <div>Cant: <strong>{formatQty(p.qty)}</strong></div>
                      <div>Total: <strong>{formatCurrency(Number(p.sales || 0))}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No se encontraron productos para esta selección.</div>
            )}
            <div className="mt-2 text-right">
              <button onClick={() => { setSelectedZoneOrRoute(null); setTopProducts(null); }} className="px-2 py-1 text-xs bg-gray-100 rounded">Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapSidebar;
