import React from 'react';

interface MapPlayerProps {
  activeRoute: any;
  playerVisible: boolean;
  setPlayerVisible: (v: boolean) => void;
  setActiveRoute?: (r: any) => void;
  playerStep: number;
  setPlayerStep: (n: number) => void;
  playerVentasMap: Record<number, any>;
  setPlayerVentasMap: (m: Record<number, any>) => void;
  fetchVentasForRd?: (rdId: number) => Promise<any> | null;
  goToStep: (index: number) => Promise<void> | void;
  prevStep: () => void;
  nextStep: () => void;
}

const MapPlayer: React.FC<MapPlayerProps> = ({ activeRoute, playerVisible, setPlayerVisible, setActiveRoute, playerStep, setPlayerStep, playerVentasMap, setPlayerVentasMap, fetchVentasForRd, goToStep, prevStep, nextStep }) => {
  if (!playerVisible || !activeRoute) return null;

  const formatCurrency = (v: number | null | undefined) => {
    try { return (v == null) ? '-' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(v)); } catch (e) { return Number(v || 0).toLocaleString(); }
  };
  const formatQty = (v: number | undefined | null) => (v == null ? '-' : Number(v).toLocaleString());

  const clientesVisitados = (activeRoute.clientes || [])
    .filter((c: any) => c.visit_sequence != null && c.visit_sequence > 0 && c.visitado)
    .sort((a: any, b: any) => (a.visit_sequence || 0) - (b.visit_sequence || 0));

  const cliente = clientesVisitados[playerStep];

  return (
    <div className="absolute right-20 bottom-20 z-40 w-96 bg-white rounded-lg shadow-xl p-4 text-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-bold">Reproductor: {activeRoute.vendedor} — {activeRoute.zona_name}</div>
          <div className="text-xs text-gray-600">Visita {playerStep + 1} de {clientesVisitados.length}{clientesVisitados.length === 0 && " (sin visitas registradas)"}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setPlayerVisible(false); if (setActiveRoute) setActiveRoute(null); }} className="text-xs px-2 py-1 bg-gray-100 rounded">Cerrar</button>
        </div>
      </div>

      <div className="border p-2 rounded mb-2">
        {!cliente ? (
          <div className="text-center text-gray-500">
            <div className="font-semibold">No hay visitas registradas</div>
            <div className="text-xs mt-1">Esta ruta no tiene clientes con visit_sequence</div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{cliente.visit_sequence}</div>
              <div className="font-semibold">{cliente.nombre || cliente.codigo || '—'}</div>
            </div>
            <div className="text-xs text-gray-600">Código: {cliente.codigo || '—'}</div>
            <div className="mt-2 text-sm">Venta actual: <strong>{formatCurrency(Number(cliente.ventas || 0))}</strong></div>
            <div className="text-xs text-gray-500 mt-1">Estado: {cliente.estado || 'visitado'}</div>

            {/* Comparative metrics: last visit amount & average purchase */}
            {(() => {
              // Prefer backend KPIs if available
              const kpis = cliente.kpis || null;
              let lastVisit = kpis && kpis.venta_anterior ? Number(kpis.venta_anterior) : null;
              let avgPurchase = kpis && kpis.promedio_cliente ? Number(kpis.promedio_cliente) : null;

              // Fallback: compute from ventasData if backend KPIs missing
              try {
                const rdId = (cliente as any).route_detail_id ?? (cliente as any).cliente_id ?? (cliente as any).id;
                const ventasData = rdId ? playerVentasMap[rdId] : null;
                if ((!lastVisit || !avgPurchase) && ventasData && Array.isArray(ventasData.events) && ventasData.events.length > 0) {
                  const evTotals: number[] = ventasData.events.map((ev: any) => {
                    if (!ev || !Array.isArray(ev.invoices) || ev.invoices.length === 0) return 0;
                    return ev.invoices.reduce((s: number, inv: any) => {
                      const invTotal = inv.invoice_total ?? (Array.isArray(inv.lines) ? inv.lines.reduce((ss: number, l: any) => ss + (Number(l.line_total || 0)), 0) : 0);
                      return s + Number(invTotal || 0);
                    }, 0);
                  });
                  const positives = evTotals.filter(n => n > 0);
                  if (!avgPurchase && positives.length > 0) avgPurchase = positives.reduce((a, b) => a + b, 0) / positives.length;
                  if (!lastVisit) {
                    // lastVisit = last previous non-zero event total (skip last if it's the current)
                    for (let i = evTotals.length - 2; i >= 0; i--) {
                      if (evTotals[i] > 0) { lastVisit = evTotals[i]; break; }
                    }
                    if (lastVisit === null || lastVisit === undefined) {
                      // fallback to last element if nothing else
                      const last = evTotals[evTotals.length - 1];
                      lastVisit = last > 0 ? last : 0;
                    }
                  }
                }
              } catch (e) {
                // ignore computation errors
              }

              if (lastVisit == null) lastVisit = 0;
              if (avgPurchase == null) avgPurchase = 0;

              return (
                <div className="mt-2 text-xs text-gray-600">
                  <div>Venta anterior: <strong>{formatCurrency(Number(lastVisit || 0))}</strong></div>
                  <div>Promedio compra: <strong>{formatCurrency(Number(avgPurchase || 0))}</strong></div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Productos vendidos (evento tipo 16) */}
        {(() => {
          if (!cliente) return null;
          const rdId = (cliente as any).route_detail_id ?? (cliente as any).cliente_id ?? (cliente as any).id;
          const ventasData = rdId ? playerVentasMap[rdId] : null;
          if (!ventasData || !Array.isArray(ventasData.events) || ventasData.events.length === 0) return null;
          return (
            <div className="mt-2">
              <div className="font-semibold text-sm mb-1">Productos vendidos (evento tipo 16)</div>
              {ventasData.events.map((ev: any, evIndex: number) => (
                <div key={ev.event_id ?? `ev-${evIndex}`} className="mb-2 p-2 bg-gray-50 rounded border">
                  <div className="text-xs text-gray-600">Evento: {ev.event_date ? new Date(ev.event_date).toLocaleString() : ''}</div>
                  {ev.comments && <div className="text-sm mt-1"><strong>{ev.comments}</strong></div>}
                  {Array.isArray(ev.invoices) && ev.invoices.length > 0 ? ev.invoices.map((inv: any, invIndex: number) => (
                    <div key={inv.invoice_id ?? `inv-${evIndex}-${invIndex}`} className="mt-1">
                      <div className="text-xs"><strong>Factura:</strong> {inv.invoice_number || '-'} {inv.invoice_date ? ` - ${new Date(inv.invoice_date).toLocaleString()}` : ''}</div>
                      <div className="text-xs mt-1">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500"><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Total</th></tr>
                          </thead>
                          <tbody>
                            {Array.isArray(inv.lines) && inv.lines.map((ln: any, lnIndex: number) => (
                              <tr key={ln.invoice_detail_id ?? `ln-${evIndex}-${invIndex}-${lnIndex}`} className="border-t"><td>{ln.product_name || ln.product_code || '-'}</td><td className="text-right">{formatQty(ln.quantity)}</td><td className="text-right">{formatCurrency(Number(ln.line_total || (ln.quantity * ln.unit_price) || 0))}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )) : <div className="text-xs text-gray-500">Sin líneas de factura</div>}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <PlayerControls
        prevStep={prevStep}
        nextStep={nextStep}
        playerStep={playerStep}
        setPlayerStep={setPlayerStep}
        activeRoute={activeRoute}
        playerVentasMap={playerVentasMap}
        fetchVentasForRd={fetchVentasForRd}
      />
    </div>
  );
};

// Inline small controls component to handle progressive fetching
const PlayerControls: React.FC<any> = ({ prevStep, nextStep, playerStep, setPlayerStep, activeRoute, playerVentasMap, fetchVentasForRd }) => {
  const [loading, setLoading] = React.useState(false);
  const prefetchingRef = React.useRef<Record<number, boolean>>({});

  const clientesVisitados = (activeRoute?.clientes || [])
    .filter((c: any) => c.visit_sequence != null && c.visit_sequence > 0 && c.visitado)
    .sort((a: any, b: any) => (a.visit_sequence || 0) - (b.visit_sequence || 0));

  const handleNext = async () => {
    const nextIndex = playerStep + 1;
    if (nextIndex >= clientesVisitados.length) return;
    const nextCliente = clientesVisitados[nextIndex];
    const rdId = Number(nextCliente.route_detail_id ?? nextCliente.route_detail ?? nextCliente.routeDetailId ?? nextCliente.cliente_id ?? nextCliente.id);
    if (rdId && !playerVentasMap[rdId] && typeof fetchVentasForRd === 'function') {
      try {
        setLoading(true);
        await fetchVentasForRd(rdId);
      } finally {
        setLoading(false);
      }
    }
    setPlayerStep(nextIndex);

    // predictive prefetch: start fetching next+1 in background (single concurrent per rd)
    const prefetchIndex = nextIndex + 1;
    if (prefetchIndex < clientesVisitados.length) {
      const preCliente = clientesVisitados[prefetchIndex];
      const preRd = Number(preCliente.route_detail_id ?? preCliente.route_detail ?? preCliente.routeDetailId ?? preCliente.cliente_id ?? preCliente.id);
      if (preRd && !playerVentasMap[preRd] && typeof fetchVentasForRd === 'function' && !prefetchingRef.current[preRd]) {
        prefetchingRef.current[preRd] = true;
        // don't await: background fetch
        fetchVentasForRd(preRd).finally(() => { try { delete prefetchingRef.current[preRd]; } catch (e) { /* ignore */ } });
      }
    }
  };

  return (
    <div className="flex justify-between">
      <button onClick={prevStep} disabled={playerStep <= 0} className="px-3 py-2 bg-gray-100 rounded disabled:opacity-50">← Anterior</button>
      <div className="flex items-center gap-2 text-xs text-gray-500"><span>Orden real de visitas</span></div>
      <button onClick={handleNext} disabled={loading || playerStep + 1 >= clientesVisitados.length} className="px-3 py-2 bg-gray-100 rounded flex items-center gap-2">
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-t-transparent border-gray-600 rounded-full animate-spin inline-block" />
            <span className="text-xs">Cargando...</span>
          </>
        ) : (
          'Siguiente →'
        )}
      </button>
    </div>
  );
};

export default MapPlayer;
