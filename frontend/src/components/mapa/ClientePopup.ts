import mapboxgl from 'mapbox-gl';

export async function showClientePopup(map: mapboxgl.Map | null, feat: any) {
  if (!map || !feat) return;
  const props = feat.properties || {};
  const coords = feat.geometry && feat.geometry.coordinates ? feat.geometry.coordinates : null;
  if (!coords) return;

  // Try multiple candidate identifiers: prefer route_detail_id, then cliente_id, then id
  const candidates = [props.route_detail_id, props.route_detail, props.cliente_id, props.clienteId, props.id]
    .map((v: any) => (v == null ? null : Number(v)))
    .filter((v: any, i: number, a: any[]) => v != null && Number.isFinite(v) && a.indexOf(v) === i);

  let html = `<div style="max-width:320px"><strong>${props.nombre || (candidates[0] ?? 'cliente')}</strong><br/>Estado: ${props.visitado ? 'Visitado' : 'No visitado'}`;

  let data: any = null;
  let usedId: number | null = null;
  const fmtCurrency = (n: number) => {
    try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n)); } catch (e) { return String(n); }
  };
  const fmtNum = (n: number) => { try { return new Intl.NumberFormat('es-AR').format(Number(n)); } catch (e) { return String(n); } };
  try {
    for (const cand of candidates.length ? candidates : [null]) {
      if (cand == null) continue;
      try {
        const resp = await fetch(`/route_detail/${cand}/ventas`);
        const contentType = resp.headers.get('content-type') || '';
        if (!resp.ok) {
          // try next candidate
          continue;
        }
        if (!contentType.includes('application/json')) {
          // non-json response — try next candidate
          continue;
        }
        // parse json
        data = await resp.json().catch(() => null);
        if (data) { usedId = cand; break; }
      } catch (e) {
        // network or parse error — try next candidate
        continue;
      }
    }

    if (!data) {
      // no candidate returned JSON — show a helpful message with candidates tried
      const tried = candidates.length ? candidates.join(', ') : 'ninguno';
      html += `<div style="margin-top:8px;color:#c00">Respuesta no JSON del servidor o no hay datos para route_detail_id(s): ${tried}</div>`;
      new mapboxgl.Popup({ maxWidth: '380px' }).setLngLat(coords).setHTML(html + '</div>').addTo(map);
      return;
    }

    // dispatch payload for sidebar (use the resolved id)
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cliente:ventas', { detail: { cliente: usedId || (candidates[0] ?? null), payload: data } }));
      }
    } catch (e) { /* ignore */ }

    // Prefer grouped events -> invoices -> lines
    if (Array.isArray(data.events) && data.events.length > 0) {
      html += `<div style="margin-top:8px"><strong>Eventos y ventas:</strong></div>`;
      data.events.forEach((ev: any) => {
        const evDate = ev.event_date ? new Date(ev.event_date).toLocaleString() : '';
        html += `<div style="margin-top:8px;padding:6px;border:1px solid #eee;border-radius:4px;background:#fafafa">`;
        html += `<div style="font-size:13px"><strong>Evento:</strong> ${evDate}`;
        if (ev.event_type_id) html += ` (tipo ${ev.event_type_id})`;
        if (ev.comments) html += `<br/><strong>${String(ev.comments)}</strong>`;
        html += `</div>`;

        if (Array.isArray(ev.invoices) && ev.invoices.length > 0) {
          ev.invoices.forEach((inv: any) => {
            html += `<div style="margin-top:6px;padding:6px;border:1px solid #f3f3f3;border-radius:3px;background:#fff">`;
            html += `<div style="font-size:12px;margin-bottom:6px"><strong>Factura:</strong> ${inv.invoice_number || '-'} `;
            if (inv.invoice_date) html += ` - ${new Date(inv.invoice_date).toLocaleString()}`;
            if (inv.invoice_total) html += ` <span style="float:right"><strong>${fmtCurrency(Number(inv.invoice_total))}</strong></span>`;
            html += `</div>`;

            if (Array.isArray(inv.lines) && inv.lines.length > 0) {
              html += `<table style="width:100%;border-collapse:collapse;font-size:12px">`;
              html += `<thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">Producto</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px">Cant.</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px">P.U.</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px">Total</th></tr></thead><tbody>`;
              let invSum = 0;
              inv.lines.forEach((ln: any) => {
                const prod = ln.product_name || ln.product_code || '-';
                const qty = Number(ln.quantity || 0);
                const pu = Number(ln.unit_price || 0);
                const line = Number(ln.line_total || (qty * pu) || 0);
                invSum += line;
                html += `<tr><td style="padding:4px;border-bottom:1px solid #f3f3f3">${prod}</td><td style="padding:4px;border-bottom:1px solid #f3f3f3;text-align:right">${fmtNum(qty)}</td><td style="padding:4px;border-bottom:1px solid #f3f3f3;text-align:right">${fmtNum(pu)}</td><td style="padding:4px;border-bottom:1px solid #f3f3f3;text-align:right">${fmtNum(line)}</td></tr>`;
              });
              html += `</tbody></table>`;
              html += `<div style="margin-top:6px;text-align:right;font-size:12px"><strong>Total factura: ${fmtCurrency(invSum)}</strong></div>`;
            } else {
              html += `<div style="margin-top:6px;color:#666">Sin líneas de factura disponibles.</div>`;
            }

            html += `</div>`;
          });
        } else if (ev.invoice_amount || ev.order_amount) {
          html += `<div style="margin-top:6px"><strong>Ventas registradas:</strong><br/>Total facturado: ${fmtCurrency(Number(ev.invoice_amount || 0))}<br/>Pedidos: ${fmtNum(Number(ev.order_amount || 0))}</div>`;
        } else {
          html += `<div style="margin-top:6px;color:#666">No se encontraron facturas para este evento.</div>`;
        }

        html += `</div>`;
      });
    } else if (data.count && data.count > 0 && Array.isArray(data.ventas) && data.ventas.length > 0) {
      html += `<div style="margin-top:8px"><strong>Factura(s) y detalle:</strong></div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px">`;
      html += `<thead><tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:4px">Producto</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px">Cant.</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px">P.U.</th><th style="text-align:right;border-bottom:1px solid #ddd;padding:4px">Total</th></tr></thead><tbody>`;
      let sumTotal = 0;
      data.ventas.forEach((v: any) => {
        const prod = v.product_name || v.product_code || '-';
        const qty = Number(v.quantity || 0);
        const pu = Number(v.unit_price || 0);
        const line = Number(v.line_total || (qty * pu) || 0);
        sumTotal += line;
          html += `<tr><td style="padding:4px;border-bottom:1px solid #f3f3f3">${prod}</td><td style="padding:4px;border-bottom:1px solid #f3f3f3;text-align:right">${fmtNum(qty)}</td><td style="padding:4px;border-bottom:1px solid #f3f3f3;text-align:right">${fmtNum(pu)}</td><td style="padding:4px;border-bottom:1px solid #f3f3f3;text-align:right">${fmtNum(line)}</td></tr>`;
      });
      html += `</tbody></table>`;
      html += `<div style="margin-top:6px;text-align:right"><strong>Total: ${ (data.totales && data.totales.line_total_sum) ? fmtCurrency(Number(data.totales.line_total_sum)) : fmtCurrency(sumTotal) }</strong></div>`;
    } else if (data.ventas_aggregadas) {
      html += `<div style="margin-top:8px"><strong>Ventas registradas:</strong><br/>Total facturado: ${fmtCurrency(Number(data.ventas_aggregadas.invoice_amount || 0))}<br/>Pedidos: ${fmtNum(Number(data.ventas_aggregadas.order_amount || 0))}</div>`;
    } else {
      html += `<div style="margin-top:8px;color:#666">No se encontraron ventas detalladas para este cliente/visita.</div>`;
    }

  } catch (err) {
    console.error('Error fetching ventas por cliente:', err);
    html += `<div style="margin-top:8px;color:#c00">Error al cargar ventas.</div>`;
  }

  html += '</div>';
  new mapboxgl.Popup({ maxWidth: '380px' }).setLngLat(coords).setHTML(html).addTo(map);
}

export default showClientePopup;
