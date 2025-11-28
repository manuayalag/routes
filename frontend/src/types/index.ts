// Tipos para el sistema de mapas - COMPLETOS PARA TODAS LAS ESTADÍSTICAS

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface Cliente {
  // Identifiers: backend may provide route_detail_id or id or cliente_id
  cliente_id?: number;
  route_detail_id?: number;
  id?: number;
  codigo?: string;
  nombre?: string;
  // Coordinates may be optional or named differently depending on source
  latitud?: number | null;
  longitud?: number | null;
  sequence?: number;
  visit_sequence?: number | null;
  visitado?: boolean;
  planificado?: boolean;
  visita_positiva?: boolean;
  ventas?: number;
  pedidos?: number;
  recibos?: number;
  estado?: 'visitado_exitoso' | 'visitado_sin_venta' | 'no_visitado' | 'visita_no_planificada' | string;
  kpis?: {
    venta_anterior?: number;
    promedio_cliente?: number;
    vs_promedio?: number;
    vs_anterior?: number;
    visitas_mes?: number;
    tendencia?: 'creciente' | 'decreciente' | 'estable' | 'pocos_datos' | 'sin_datos' | 'error' | string;
  };
}

export interface PasoRuta {
  paso_numero: number;
  cliente_id: number;
  codigo: string;
  nombre: string;
  coordenadas: string;
  visit_sequence: number;
  ventas: number;
  pedidos: number;
  recibos: number;
  estado: string;
  es_planificado: boolean;
  distancia_desde_anterior: number;
  tiempo_estimado_minutos: number;
}

export interface Ruta {
  route_id: number;
  vendedor_id: number;
  vendedor: string;
  fecha: string;
  dia_semana: string;
  color: string;
  status: string;
  distancia_planificada: number;
  distancia_real: number;
  zona_code: string;
  zona_name: string;
  zona_color: string;
  clientes: Cliente[];
  ruta_linea: [number, number][];
  secuencia_pasos: PasoRuta[];
  total_puntos_ruta: number;
  clientes_visitados_validos: number;
  distancia_total_estimada: number;
  tiempo_total_estimado: number;
}

export interface KPIs {
  ventas_actuales: number;
  ventas_periodo_anterior: number;
  clientes_actuales: number;
  crecimiento_porcentual: number;
  rendimiento_vs_promedio: 'excelente' | 'promedio' | 'bajo';
  ranking_zona: number;
  promedio_venta_cliente: number;
  promedio_general: number;
  color_rendimiento: string;
  promedio_mensual: number;
  vs_promedio_mensual: number;
  dias_activos_mes: number;
  clientes_unicos_mes: number;
  eficiencia_diaria: number;
}

export interface Zona {
  id?: string;
  zona_id?: string;
  group_id?: number;
  nombre: string;
  color?: string;
  coordenadas?: number[][][] | [number, number][];
  coordinates?: number[][][] | [number, number][]; // Backend usa este campo
  centro_lng?: number;
  centro_lat?: number;
  total_rutas?: number;
  total_ventas?: number;
  total_clientes_visitados?: number;
  kpis?: KPIs;
}

export interface EstadisticasMapa {
  total_clientes_visitados: number;
  total_clientes_no_visitados: number;
  clientes_no_visitados: number;
  ventas_totales: number;
  zonas_activas: number;
}

export interface MapaData {
  rutas: Ruta[];
  zonas: Zona[];
  estadisticas_mapa: EstadisticasMapa;
}

export interface FiltrosData {
  vendedor_id?: string;
  vendedor_ids?: string | string[];
  fecha_inicio?: string;
  fecha_fin?: string;
  periodo?: string;
}

export interface FiltrosUI {
  periodo: string;
  fecha: string;
  vendedor: string;
  dateRange: { 
    desde: string; 
    hasta: string; 
  };
  vendedor_ids?: number[];
}

export interface CapasVisibles {
  zonas: boolean;
  rutas: boolean;
  labels: boolean;
  vendedores: boolean;
  clientes: boolean;
}

export interface NoVisitado {
  codigo: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
  primera_planificacion: string | null;
  ultima_visita: string | null;
  visitas_con_venta: number;
  veces_planificado: number;
}