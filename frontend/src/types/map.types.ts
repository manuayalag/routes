export interface Cliente {
  cliente_id?: number;
  nombre?: string;
  codigo?: string;
  latitud?: number;
  longitud?: number;
  visitado?: boolean;
  visit_sequence?: number | null;
  ventas?: number;
  estado?: string;
  kpis?: any;
}

export interface Ruta {
  route_id?: number;
  vendedor?: string;
  zona_name?: string;
  clientes?: Cliente[];
}

export interface MapaData {
  zonas?: any[];
  rutas?: Ruta[];
}
