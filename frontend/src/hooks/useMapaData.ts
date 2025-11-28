import { useState, useCallback, useEffect } from 'react';
import type { MapaData, FiltrosData, FiltrosUI, NoVisitado } from '../types/index';

const useMapaData = () => {
  const [mapaData, setMapaData] = useState<MapaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtrosActivos, setFiltrosActivos] = useState<FiltrosData>({});
  const [noVisitados, setNoVisitados] = useState<NoVisitado[] | null>(null);
  const [allVendedores, setAllVendedores] = useState<string[] | null>(null);
  type RouteMin = { vendedor?: string };

  // Función para construir URL con parámetros de filtro
  const buildApiUrl = useCallback((filtros: FiltrosData) => {
    const baseUrl = 'http://192.168.0.50:8000/mapa/rutas';
    const params = new URLSearchParams();
    
    if (filtros.vendedor_id && filtros.vendedor_id !== 'todos') {
      params.append('vendedor_id', filtros.vendedor_id);
    }
    // support multiple vendedor_ids (array or comma-separated)
    if ((filtros as any).vendedor_ids) {
      const vids = (filtros as any).vendedor_ids;
      if (Array.isArray(vids)) {
        vids.forEach((v: any) => params.append('vendedor_ids', String(v)));
      } else if (typeof vids === 'string') {
        vids.split(',').map(s => s.trim()).filter(Boolean).forEach(s => params.append('vendedor_ids', s));
      }
    }
    
    if (filtros.fecha_inicio) {
      params.append('fecha_inicio', filtros.fecha_inicio);
    }
    
    if (filtros.fecha_fin) {
      params.append('fecha_fin', filtros.fecha_fin);
    }
    
    if (filtros.periodo) {
      params.append('periodo', filtros.periodo);
    }
    
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, []);

  // Función para obtener datos con filtros
  const fetchData = useCallback(async (filtros: FiltrosData = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = buildApiUrl(filtros);
      console.log('🚀 Obteniendo datos del mapa:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Datos recibidos:', data);
        setMapaData(data);
        setFiltrosActivos(filtros);
        // limpiar cache de no-visitados si cambian filtros de fecha
        setNoVisitados(null);

      // Capturar lista global de vendedores en la primera carga sin filtros
      try {
        const hasFilters = filtros && Object.keys(filtros).length > 0;
        if (!hasFilters && !allVendedores) {
          const vendedoresSet = new Set<string>();
          if (data?.rutas && Array.isArray(data.rutas)) {
            (data.rutas as RouteMin[]).forEach((r) => { if (r && r.vendedor) vendedoresSet.add(r.vendedor); });
          }
          setAllVendedores(Array.from(vendedoresSet).sort());
        }
      } catch (e) {
        // non-fatal
        console.warn('No se pudo capturar la lista de vendedores:', e);
      }
      
    } catch (err) {
      console.error('❌ Error obteniendo datos:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [buildApiUrl, allVendedores]);

  // Obtener clientes no visitados en un rango (por defecto últimos 3 meses)
  const fetchNoVisitados = useCallback(async (fecha_inicio?: string, fecha_fin?: string, vendedor_id?: string) => {
    try {
      const params = new URLSearchParams();
      if (fecha_inicio) params.append('fecha_inicio', fecha_inicio);
      if (fecha_fin) params.append('fecha_fin', fecha_fin);
      if (vendedor_id) params.append('vendedor_id', vendedor_id);

      const url = `http://192.168.0.50:8000/clientes_no_visitados?${params.toString()}`;
      console.log('Obteniendo clientes no visitados:', url);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Error: ${resp.status}`);
      const json = await resp.json();
      setNoVisitados(json.clientes || []);
      return json;
    } catch (err) {
      console.error('Error obteniendo no-visitados:', err);
      return null;
    }
  }, []);

  // Función para aplicar filtros UI
  const aplicarFiltros = useCallback((filtrosUI: FiltrosUI) => {
    console.log('🔍 Aplicando filtros UI:', filtrosUI);
    
    const filtrosApi: FiltrosData = {};
    const hoy = new Date();
    
    // Mapear vendedor: si vienen IDs explícitos, usarlos; sino intentar mapear por nombre
    if ((filtrosUI as any).vendedor_ids && Array.isArray((filtrosUI as any).vendedor_ids) && (filtrosUI as any).vendedor_ids.length > 0) {
      filtrosApi.vendedor_ids = (filtrosUI as any).vendedor_ids;
    } else if (filtrosUI.vendedor && filtrosUI.vendedor !== 'todos') {
      const rutaVendedor = mapaData?.rutas?.find(ruta => ruta.vendedor === filtrosUI.vendedor);
      if (rutaVendedor) {
        filtrosApi.vendedor_id = rutaVendedor.vendedor_id?.toString();
      }
    }
    
    // Mapear período y fechas con lógica mejorada
    switch (filtrosUI.periodo) {
      case 'hoy': {
        const hoyStr = hoy.toISOString().split('T')[0];
        filtrosApi.fecha_inicio = hoyStr;
        filtrosApi.fecha_fin = hoyStr;
        break;
      }
        
      case 'ayer': {
        const ayer = new Date(hoy);
        ayer.setDate(ayer.getDate() - 1);
        const ayerStr = ayer.toISOString().split('T')[0];
        filtrosApi.fecha_inicio = ayerStr;
        filtrosApi.fecha_fin = ayerStr;
        break;
      }
        
      case 'esta_semana': {
        // Lunes de esta semana
        const lunesEstaSemana = new Date(hoy);
        const diasDesdeElLunes = lunesEstaSemana.getDay() === 0 ? 6 : lunesEstaSemana.getDay() - 1;
        lunesEstaSemana.setDate(lunesEstaSemana.getDate() - diasDesdeElLunes);
        
        // Domingo de esta semana
        const domingoEstaSemana = new Date(lunesEstaSemana);
        domingoEstaSemana.setDate(domingoEstaSemana.getDate() + 6);
        
        filtrosApi.fecha_inicio = lunesEstaSemana.toISOString().split('T')[0];
        filtrosApi.fecha_fin = domingoEstaSemana.toISOString().split('T')[0];
        break;
      }
        
      case 'semana_pasada': {
        // Lunes de la semana pasada
        const lunesSemPasada = new Date(hoy);
        const diasDesdeElLunesAnt = lunesSemPasada.getDay() === 0 ? 6 : lunesSemPasada.getDay() - 1;
        lunesSemPasada.setDate(lunesSemPasada.getDate() - diasDesdeElLunesAnt - 7);
        
        // Domingo de la semana pasada
        const domingoSemPasada = new Date(lunesSemPasada);
        domingoSemPasada.setDate(domingoSemPasada.getDate() + 6);
        
        filtrosApi.fecha_inicio = lunesSemPasada.toISOString().split('T')[0];
        filtrosApi.fecha_fin = domingoSemPasada.toISOString().split('T')[0];
        break;
      }
        
      case 'este_mes': {
        const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        
        filtrosApi.fecha_inicio = primerDiaMes.toISOString().split('T')[0];
        filtrosApi.fecha_fin = ultimoDiaMes.toISOString().split('T')[0];
        break;
      }
        
      case 'mes_pasado': {
        const primerDiaMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        const ultimoDiaMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
        
        filtrosApi.fecha_inicio = primerDiaMesPasado.toISOString().split('T')[0];
        filtrosApi.fecha_fin = ultimoDiaMesPasado.toISOString().split('T')[0];
        break;
      }
        
      case 'fecha_especifica':
        if (filtrosUI.fecha) {
          filtrosApi.fecha_inicio = filtrosUI.fecha;
          filtrosApi.fecha_fin = filtrosUI.fecha;
        }
        break;
        
      case 'rango_fechas':
        if (filtrosUI.dateRange.desde && filtrosUI.dateRange.hasta) {
          filtrosApi.fecha_inicio = filtrosUI.dateRange.desde;
          filtrosApi.fecha_fin = filtrosUI.dateRange.hasta;
        }
        break;
        
      default:
        // Sin filtro de fecha específico
        break;
    }
    
    console.log('📅 Filtros API calculados:', filtrosApi);
    
    // Aplicar filtros
    fetchData(filtrosApi);
  }, [fetchData, mapaData]);

  // Cargar datos iniciales
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    mapaData,
    loading,
    error,
    filtrosActivos,
    noVisitados,
    allVendedores,
    aplicarFiltros,
    refetch: fetchData,
    fetchNoVisitados
  };
};

export default useMapaData;