from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import math
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta

# Cargar variables de entorno
load_dotenv()

# Configuración de base de datos
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"), 
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD")
}

def get_db_connection():
    """Crear conexión a PostgreSQL"""
    try:
        connection = psycopg2.connect(**DB_CONFIG)
        return connection
    except psycopg2.Error as e:
        print(f"Error conectando a PostgreSQL: {e}")
        raise HTTPException(status_code=500, detail="Error de conexión a la base de datos")

def execute_query(query: str, params=None) -> List[Dict[str, Any]]:
    """Ejecutar consulta SQL y retornar resultados"""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, params)
        results = cursor.fetchall()
        return [dict(row) for row in results]
    except psycopg2.Error as e:
        print(f"Error ejecutando consulta: {e}")
        raise HTTPException(status_code=500, detail=f"Error en consulta SQL: {str(e)}")
    finally:
        if connection:
            connection.close()

app = FastAPI(
    title="Dashboard Rutas API",
    description="API para dashboard de seguimiento de rutas y KPIs comerciales",
    version="1.0.0"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos Pydantic
class VentaPorDia(BaseModel):
    fecha: date
    total_ventas: float

class Cliente(BaseModel):
    id: int
    codigo: str
    latitud: float
    longitud: float
    vendedor_id: int
    vendedor: str

@app.get("/")
def read_root():
    return {"message": "API Dashboard Rutas y KPIs - Funcionando correctamente"}

@app.get("/test-db")
def test_database_connection():
    """Probar conexión a la base de datos"""
    try:
        query = "SELECT current_database(), current_user, version()"
        result = execute_query(query)
        return {
            "status": "success",
            "message": "Conexión exitosa a PostgreSQL",
            "database_info": result[0] if result else {}
        }
    except Exception as e:
        return {
            "status": "error", 
            "message": f"Error de conexión: {str(e)}"
        }

def buscar_ultimo_dia_con_datos(fecha_actual: str, connection) -> str:
    """Busca el último día con datos disponible antes de la fecha actual"""
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        
        # Buscar el último día con datos antes de la fecha actual
        query = """
        SELECT r.day
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        WHERE r.day < %s
          AND rd.visit_sequence IS NOT NULL
        GROUP BY r.day
        HAVING COUNT(*) > 0
        ORDER BY r.day DESC
        LIMIT 1
        """
        
        cursor.execute(query, (fecha_actual,))
        resultado = cursor.fetchone()
        
        if resultado:
            return resultado['day'].strftime('%Y-%m-%d')
        else:
            # Si no encuentra, devolver 7 días atrás como fallback
            fecha_dt = datetime.strptime(fecha_actual, '%Y-%m-%d')
            return (fecha_dt - timedelta(days=7)).strftime('%Y-%m-%d')
            
    except Exception as e:
        print(f"⚠️  Error buscando último día con datos: {e}")
        # Fallback: 7 días atrás
        fecha_dt = datetime.strptime(fecha_actual, '%Y-%m-%d')
        return (fecha_dt - timedelta(days=7)).strftime('%Y-%m-%d')
@app.get("/route_details_with_events")
def get_route_details_with_events():
    # Implementación de la función para obtener detalles de la ruta con eventos
    pass

def obtener_ventas_anteriores_por_zona(fecha_actual: str, connection) -> dict:
    """Obtiene las últimas ventas de cada zona específica antes de la fecha actual"""
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        
        # Obtener todas las zonas que tienen ventas hoy
        query_zonas_actuales = """
        SELECT DISTINCT rzd.zone_code
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
        WHERE r.day = %s 
          AND rzd.zone_code IS NOT NULL
          AND rd.visit_sequence IS NOT NULL
        """
        
        cursor.execute(query_zonas_actuales, (fecha_actual,))
        zonas_actuales = [row['zone_code'] for row in cursor.fetchall()]
        
        ventas_por_zona = {}
        
        # Para cada zona, buscar su última venta
        for zona_code in zonas_actuales:
            query_ultima_venta = """
            SELECT 
                r.day as fecha_ultima,
                SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END) as ventas_anteriores,
                COUNT(DISTINCT rd.subject_code) as clientes_anteriores
            FROM public.route r
            JOIN public.route_detail rd ON rd.route_id = r.id
            LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
            WHERE rzd.zone_code = %s 
              AND r.day < %s
              AND rd.visit_sequence IS NOT NULL
            GROUP BY r.day
            HAVING SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END) > 0
            ORDER BY r.day DESC
            LIMIT 1
            """
            
            cursor.execute(query_ultima_venta, (zona_code, fecha_actual))
            resultado = cursor.fetchone()
            
            if resultado:
                ventas_por_zona[zona_code] = {
                    'ventas': float(resultado['ventas_anteriores']),
                    'fecha': resultado['fecha_ultima'].strftime('%Y-%m-%d'),
                    'clientes': int(resultado['clientes_anteriores'])
                }
                print(f"🔍 Zona {zona_code}: Última venta ₱{resultado['ventas_anteriores']:,.0f} en {resultado['fecha_ultima']}")
            else:
                ventas_por_zona[zona_code] = {
                    'ventas': 0.0,
                    'fecha': None,
                    'clientes': 0
                }
                print(f"⚠️ Zona {zona_code}: No se encontró venta anterior")
        
        return ventas_por_zona
            
    except Exception as e:
        print(f"⚠️ Error obteniendo ventas por zona: {e}")
        return {}


def obtener_ventas_por_zonas_rango(connection, fecha_inicio: str, fecha_fin: str, filtro_vendedor: str = "") -> dict:
    """Helper: retorna un diccionario {zone_code: ventas} con la sumatoria de invoice_amount
    para cada zona entre fecha_inicio y fecha_fin (inclusive).
    - connection: conexión abierta a la base de datos (psycopg2 connection)
    - fecha_inicio / fecha_fin: strings 'YYYY-MM-DD'
    - filtro_vendedor: cadena SQL adicional como " AND r.user_id = X" (opcional)
    """
    ventas_por_zona = {}
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        consulta = f"""
        SELECT COALESCE(rzd.zone_code, 'unknown') as zone_code,
               COALESCE(SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END), 0) as ventas
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
        WHERE r.day >= %s AND r.day <= %s
        {filtro_vendedor}
        AND rzd.zone_code IS NOT NULL
        GROUP BY rzd.zone_code
        """

        cursor.execute(consulta, (fecha_inicio, fecha_fin))
        rows = cursor.fetchall()
        for row in rows:
            ventas_por_zona[row['zone_code']] = float(row['ventas'] or 0)

        return ventas_por_zona
    except Exception as e:
        print(f"⚠️ Error en obtener_ventas_por_zonas_rango: {e}")
        return {}


def fetch_events_for_route_details(connection, rd_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    """Devuelve un mapping { route_detail_id: {'start': event_row or None, 'end': event_row or None} }
    donde 'start' es el primer evento tipo 1 y 'end' es el primer evento tipo 2 para ese route_detail_id.
    """
    if not rd_ids:
        return {}
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        # Traer eventos tipo 1 y 2 para los route_detail_ids dados
        query = """
        SELECT route_detail_id, event_type_id, event_date, latitude, longitude, comments, distance_event_customer
        FROM public.event
        WHERE route_detail_id = ANY(%s)
          AND event_type_id IN (1,2)
        ORDER BY route_detail_id, event_type_id, event_date ASC
        """
        cursor.execute(query, (rd_ids,))
        rows = cursor.fetchall()

        mapping: Dict[int, Dict[str, Any]] = {}
        for r in rows:
            rid = int(r['route_detail_id'])
            if rid not in mapping:
                mapping[rid] = {'start': None, 'end': None}
            if r['event_type_id'] == 1 and mapping[rid]['start'] is None:
                mapping[rid]['start'] = r
            if r['event_type_id'] == 2 and mapping[rid]['end'] is None:
                mapping[rid]['end'] = r

        return mapping
    except Exception as e:
        print(f"⚠️ Error fetch_events_for_route_details: {e}")
        return {}

def calcular_fechas_comparacion(fecha_inicio: str, fecha_fin: str) -> dict:
    """Calcula fechas de comparación inteligentes según el rango seleccionado"""
    from datetime import datetime, timedelta
    
    inicio = datetime.strptime(fecha_inicio, '%Y-%m-%d')
    fin = datetime.strptime(fecha_fin, '%Y-%m-%d')
    dias_diferencia = (fin - inicio).days
    
    if dias_diferencia == 0:  # Un solo día
        # Comparar con el mismo día de la semana pasada
        comp_inicio = inicio - timedelta(days=7)
        comp_fin = comp_inicio
    else:  # Rango de días
        # Comparar con el mismo rango de la semana anterior
        comp_inicio = inicio - timedelta(days=7)
        comp_fin = fin - timedelta(days=7)
    
    return {
        'comp_inicio': comp_inicio.strftime('%Y-%m-%d'),
        'comp_fin': comp_fin.strftime('%Y-%m-%d'),
        'tipo_comparacion': 'semana_anterior'
    }

def obtener_kpis_cliente(subject_code: str, connection, fecha_actual: str, filtro_vendedor: str = "") -> dict:
    """Calcula KPIs avanzados para un cliente específico"""
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        
        # Obtener historial del cliente (últimos 3 meses)
        query_historial = f"""
        SELECT 
            r.day,
            rd.invoice_amount,
            rd.order_amount,
            rd.visit_sequence,
            ROW_NUMBER() OVER (ORDER BY r.day DESC) as visita_orden
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        WHERE rd.subject_code = %s
          AND r.day >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
          AND rd.visit_sequence IS NOT NULL
        {filtro_vendedor}
        ORDER BY r.day DESC
        LIMIT 10
        """
        
        cursor.execute(query_historial, (subject_code,))
        historial = cursor.fetchall()
        
        if not historial:
            return {
                'venta_anterior': 0,
                'promedio_cliente': 0,
                'vs_promedio': 0,
                'vs_anterior': 0,
                'visitas_mes': 0,
                'tendencia': 'sin_datos'
            }
        
        # Calcular estadísticas
        # historial está ordenado por r.day DESC (más reciente primero)
        ventas_all = [float(h['invoice_amount'] or 0) for h in historial]
        venta_actual = ventas_all[0] if ventas_all else 0

        # Venta anterior: buscar la próxima venta NO CERO en el historial (la última facturación)
        venta_anterior = 0
        for v in ventas_all[1:]:
            if v > 0:
                venta_anterior = v
                break

        # Promedio del cliente: promediar sólo las visitas que tuvieron ventas (>0)
        ventas_positivas = [v for v in ventas_all if v > 0]
        promedio_cliente = sum(ventas_positivas) / len(ventas_positivas) if ventas_positivas else 0
        visitas_mes = len(historial)
        
        # Comparaciones
        vs_anterior = 0
        if venta_anterior > 0:
            vs_anterior = ((venta_actual - venta_anterior) / venta_anterior) * 100
        
        vs_promedio = 0
        if promedio_cliente > 0:
            vs_promedio = ((venta_actual - promedio_cliente) / promedio_cliente) * 100
        
        # Determinar tendencia usando las últimas 3 ventas reales (no-cero) si existen
        if len(ventas_positivas) >= 3:
            ultimas_3 = ventas_positivas[:3]
            if ultimas_3[0] > ultimas_3[1] > ultimas_3[2]:
                tendencia = 'creciente'
            elif ultimas_3[0] < ultimas_3[1] < ultimas_3[2]:
                tendencia = 'decreciente'
            else:
                tendencia = 'estable'
        else:
            tendencia = 'pocos_datos'
        
        return {
            'venta_anterior': round(venta_anterior, 2),
            'promedio_cliente': round(promedio_cliente, 2),
            'vs_promedio': round(vs_promedio, 2),
            'vs_anterior': round(vs_anterior, 2),
            'visitas_mes': visitas_mes,
            'tendencia': tendencia
        }
        
    except Exception as e:
        print(f"⚠️ Error calculando KPIs para cliente {subject_code}: {e}")
        return {
            'venta_anterior': 0,
            'promedio_cliente': 0,
            'vs_promedio': 0,
            'vs_anterior': 0,
            'visitas_mes': 0,
            'tendencia': 'error'
        }

@app.get("/mapa/rutas")
def get_mapa_rutas(
    periodo: str = "dia",  # dia, semana, mes, año
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    vendedor_id: Optional[int] = None,
    vendedor_ids: Optional[List[int]] = Query(None),
    dia_semana: Optional[str] = None,  # lunes, martes, miercoles, jueves, viernes, sabado, domingo
    compact: bool = False  # si True devuelve versión reducida (menos campos) para disminuir payload
):
    """Datos de rutas reales desde PostgreSQL para visualización en mapa con filtros"""
    try:
        # Construir filtros de fecha según el período - USANDO CAMPO 'day' NO 'creation_date'
        if fecha_inicio and fecha_fin:
            condicion_fecha = f"r.day >= '{fecha_inicio}' AND r.day <= '{fecha_fin}'"
        elif periodo == "dia":
            condicion_fecha = "r.day = CURRENT_DATE"
        elif periodo == "semana":
            condicion_fecha = "r.day >= CURRENT_DATE - INTERVAL '7 days' AND r.day <= CURRENT_DATE"
        elif periodo == "mes":
            condicion_fecha = "r.day >= DATE_TRUNC('month', CURRENT_DATE) AND r.day < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'"
        elif periodo == "año":
            condicion_fecha = "r.day >= DATE_TRUNC('year', CURRENT_DATE) AND r.day < DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year'"
        else:
            # Por defecto últimos 30 días
            condicion_fecha = "r.day >= CURRENT_DATE - INTERVAL '30 days' AND r.day <= CURRENT_DATE"
        
        # Filtro por vendedor específico - se acepta un único `vendedor_id` o múltiples `vendedor_ids`
        filtro_vendedor = ""
        if vendedor_ids:
            # FastAPI valida que los elementos sean ints; construir lista segura
            ids_list = ",".join(str(int(x)) for x in vendedor_ids)
            filtro_vendedor = f" AND r.user_id IN ({ids_list})"
        elif vendedor_id:
            filtro_vendedor = f" AND r.user_id = {vendedor_id}"
        
        # Filtro por día de la semana específico - USANDO CAMPO 'day'
        filtro_dia_semana = ""
        if dia_semana:
            dias_map = {
                "lunes": 1, "martes": 2, "miercoles": 3, "jueves": 4,
                "viernes": 5, "sabado": 6, "domingo": 0
            }
            if dia_semana.lower() in dias_map:
                dia_numero = dias_map[dia_semana.lower()]
                filtro_dia_semana = f" AND EXTRACT(DOW FROM r.day) = {dia_numero}"
        
        # Calcular fechas de comparación inteligentes
        fechas_comp = None
        if fecha_inicio and fecha_fin:
            fechas_comp = calcular_fechas_comparacion(fecha_inicio, fecha_fin)
            condicion_fecha_comp = f"r.day >= '{fechas_comp['comp_inicio']}' AND r.day <= '{fechas_comp['comp_fin']}'"
        elif periodo == "dia":
            # Para hoy, comparar con el mismo día de la semana pasada
            hoy = datetime.now().date()
            comp_fecha = hoy - timedelta(days=7)
            fechas_comp = {
                'comp_inicio': comp_fecha.strftime('%Y-%m-%d'),
                'comp_fin': comp_fecha.strftime('%Y-%m-%d'),
                'tipo_comparacion': 'mismo_dia_semana_anterior'
            }
            condicion_fecha_comp = f"r.day = '{fechas_comp['comp_inicio']}'"
        else:
            condicion_fecha_comp = None
        
        print(f"🎯 FILTROS APLICADOS:")
        print(f"   - Período: {periodo}")
        print(f"   - Condición fecha: {condicion_fecha}")
        print(f"   - Filtro vendedor: {filtro_vendedor}")
        print(f"   - Filtro día semana: {filtro_dia_semana}")
        print(f"   - Vendedor ID seleccionado: {vendedor_id}")
        if fechas_comp:
            print(f"   - Comparación: {fechas_comp['comp_inicio']} a {fechas_comp['comp_fin']} ({fechas_comp['tipo_comparacion']})")
        
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        
        # Consulta principal de rutas con información de zona usando tabla intermedia - USANDO CAMPO 'day'
        query = f"""
        SELECT 
            r.id AS route_id,
            r.day as fecha_ruta,
            r.creation_date,
            r.user_id,
            r.group_id,
            r.route_distance,
            r.status,
            rd.id AS route_detail_id,
            rd.subject_name,
            rd.subject_code,
            rd.latitude,
            rd.longitude,
            rd.invoice_amount,
            rd.invoice_quantity,
            rd.order_amount,
            rd.order_quantity,
            rd.receipt_amount,
            rd.receipt_quantity,
            rd.visit_positive,
            rd.sequence,
            rd.visit_sequence,
            v.full_name as vendedor_nombre,
            rzd.zone_code,
            rzd.zone_name,
            rzd.zone_color
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        LEFT JOIN public.v_users v ON v.id = r.user_id
        LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
    WHERE {condicion_fecha}{filtro_vendedor}{filtro_dia_semana}
    -- Nota: removimos el filtro por rd.latitude/rd.longitude para permitir
    -- devolver route_detail que no tengan coordenadas en rd cuando existan
    -- eventos asociados con coordenadas reales (event_start/event_end).
    -- Esto permite que la UI use las coordenadas del evento como fuente
    -- primaria para mostrar la ruta y los pasos de visita.
        ORDER BY r.day DESC, rd.visit_sequence NULLS LAST
        """
        
        print(f"📊 Ejecutando consulta de rutas: {query}")
        
        try:
            cursor.execute(query)
            print(f"✅ Consulta de rutas ejecutada correctamente")
        except Exception as query_error:
            print(f"❌ Error ejecutando consulta de rutas: {query_error}")
            cursor.close()
            connection.close()
            raise HTTPException(status_code=500, detail=f"Error en consulta de rutas: {str(query_error)}")
        
        rutas_dict = {}

        rows = cursor.fetchall()
        print(f"📊 Obtenidas {len(rows)} filas de la consulta de rutas")
        
        if len(rows) == 0:
            print("⚠️ No se encontraron filas en la consulta")
            cursor.close()
            connection.close()
            return {
                "rutas": [],
                "zonas": [],
                "estadisticas_mapa": {
                    "total_clientes_planificados": 0,
                    "total_clientes_visitados": 0,
                    "clientes_no_visitados": 0,
                    "visitas_no_planificadas": 0,
                    "ventas_totales": 0,
                    "distancia_total_planificada": 0,
                    "distancia_total_real": 0,
                    "zonas_activas": 0,
                    "km_recorridos": 0
                }
            }
        
        # Preparar mapeo de eventos por route_detail (batch)
        route_detail_ids = [r['route_detail_id'] for r in rows if r and r.get('route_detail_id')]
        eventos_por_rd = fetch_events_for_route_details(connection, route_detail_ids)

        for i, row in enumerate(rows):
            if not row:
                print(f"⚠️ Fila {i} es None o vacía")
                continue
            
            print(f"🔍 Procesando fila {i}: tipo={type(row)}")
            print(f"🔍 Route ID: {row.get('route_id', 'N/A')}, Vendedor: {row.get('user_id', 'N/A')}")
                
            try:
                # Acceso por nombre de campo (RealDictRow)
                route_id = row['route_id']
                fecha_ruta = row['fecha_ruta']  # r.day
                creation_date = row['creation_date']
                user_id = row['user_id']
                group_id = row['group_id']
                route_distance = row['route_distance']
                status = row['status']
                
                # Información del cliente/punto de ruta
                route_detail_id = row['route_detail_id']
                subject_name = row['subject_name']
                subject_code = row['subject_code']
                latitude = row['latitude']
                longitude = row['longitude']
                invoice_amount = row['invoice_amount'] or 0
                invoice_quantity = row['invoice_quantity'] or 0
                order_amount = row['order_amount'] or 0
                order_quantity = row['order_quantity'] or 0
                receipt_amount = row['receipt_amount'] or 0
                receipt_quantity = row['receipt_quantity'] or 0
                visit_positive = row['visit_positive']
                sequence = row['sequence']
                visit_sequence = row['visit_sequence']
                vendedor_nombre = row['vendedor_nombre'] or f"Vendedor {user_id}"
                
                # Información de zona desde tabla intermedia
                zona_code = row['zone_code']
                zona_name = row['zone_name']
                zona_color = row['zone_color']
                
                # Buscar eventos asociados (prefiere coordenadas de event_start si existen)
                eventos = eventos_por_rd.get(route_detail_id, {})
                event_start = eventos.get('start') if eventos else None
                event_end = eventos.get('end') if eventos else None

                # Si el evento tiene coordenadas válidas, usar event_start; sino, fallback a rd.latitude/rd.longitude
                lat = None
                lng = None
                # Prioridad solicitada: event_start -> rd.latitude/rd.longitude
                def _valid_coord(v):
                    try:
                        if v is None:
                            return False
                        fv = float(str(v).replace(',', '.'))
                        # Rechazar valores 0.0 como inválidos (según petición)
                        return abs(fv) > 0.000001
                    except Exception:
                        return False

                if event_start and _valid_coord(event_start.get('latitude')) and _valid_coord(event_start.get('longitude')):
                    try:
                        lat = float(str(event_start['latitude']).replace(',', '.'))
                        lng = float(str(event_start['longitude']).replace(',', '.'))
                        print(f"ℹ️ Usando coordenadas de event_start para RD {route_detail_id}: {lat}, {lng}")
                    except Exception:
                        lat = None
                        lng = None
                else:
                    # Fallback a coordenadas en route_detail si existen
                    try:
                        if latitude is not None and longitude is not None:
                            lat_tmp = float(str(latitude).replace(',', '.'))
                            lng_tmp = float(str(longitude).replace(',', '.'))
                            # Aceptar lat/lng de rd si no son 0
                            if abs(lat_tmp) > 0.000001 and abs(lng_tmp) > 0.000001:
                                lat = lat_tmp
                                lng = lng_tmp
                                print(f"ℹ️ Usando coordenadas de route_detail para RD {route_detail_id}: {lat}, {lng}")
                    except Exception:
                        lat = None
                        lng = None

                # Validar rango paraguay si existe lat/lng
                if lat is None or lng is None:
                    print(f"⚠️ Coordenadas no disponibles para cliente {subject_name} (RD {route_detail_id}) - eventos: start={bool(event_start)}, end={bool(event_end)}")
                    # Continuar sin agregar el cliente si no hay coordenadas de ninguna fuente
                    continue
                if not (-28 <= lat <= -19 and -63 <= lng <= -54):
                    print(f"⚠️ Coordenadas fuera de rango para Paraguay: {lat}, {lng} para cliente {subject_name} (RD {route_detail_id})")
                    continue
                
                # Crear ruta si no existe
                if route_id not in rutas_dict:
                    # Obtener día de la semana desde el campo 'day' en lugar de 'creation_date'
                    dia_semana_num = fecha_ruta.weekday()  # 0=lunes, 6=domingo
                    dia_semana_nombre = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"][dia_semana_num]
                    
                    # Mapeo de colores por día de la semana
                    dia_colores = {
                        "lunes": "#ef4444",     # Rojo
                        "martes": "#f97316",    # Naranja
                        "miercoles": "#eab308", # Amarillo
                        "jueves": "#22c55e",    # Verde
                        "viernes": "#3b82f6",   # Azul
                        "sabado": "#8b5cf6",    # Violeta
                        "domingo": "#ec4899"    # Rosa
                    }
                    
                    rutas_dict[route_id] = {
                        "route_id": route_id,
                        "vendedor_id": user_id,
                        "vendedor": vendedor_nombre,
                        "fecha": fecha_ruta.strftime('%Y-%m-%d'),  # Usar fecha_ruta (day)
                        "dia_semana": dia_semana_nombre,
                        "color": dia_colores.get(dia_semana_nombre, '#6b7280'),
                        "status": status,
                        "distancia_planificada": route_distance or 0,
                        "distancia_real": route_distance or 0,
                        "zona_code": zona_code,
                        "zona_name": zona_name,
                        "zona_color": zona_color,
                        "clientes": [],
                        "ruta_linea": [],
                        "secuencia_pasos": [],
                        "total_puntos_ruta": 0,
                        "clientes_visitados_validos": 0
                    }
                
                # Determinar estado del cliente
                visitado = visit_sequence is not None
                planificado = sequence and sequence < 1000
                
                if visitado:
                    if not planificado:
                        estado = "visita_no_planificada"
                    elif visit_positive and invoice_amount > 0:
                        estado = "visitado_exitoso"
                    elif visit_positive:
                        estado = "visitado_sin_venta"
                    else:
                        estado = "visitado_sin_venta"
                else:
                    estado = "no_visitado"
            
                # Obtener KPIs avanzados del cliente si fue visitado
                kpis_cliente = {}
                if visitado and subject_code:
                    kpis_cliente = obtener_kpis_cliente(subject_code, connection, str(fecha_ruta), filtro_vendedor)
            
                cliente = {
                    "cliente_id": route_detail_id,
                    "codigo": subject_code,
                    "nombre": subject_name,
                    "latitud": lat,
                    "longitud": lng,
                    "sequence": sequence,
                    "visit_sequence": visit_sequence,
                    "visitado": visitado,
                    "planificado": planificado,
                    "visita_positiva": bool(visit_positive) if visit_positive is not None else False,
                    "ventas": float(invoice_amount),
                    "pedidos": float(order_amount),
                    "recibos": float(receipt_amount),
                    "estado": estado,
                    "kpis": kpis_cliente  # Nuevos KPIs avanzados
                }
                # Adjuntar datos de evento al cliente para uso en frontend
                if event_start:
                    cliente['event_begin'] = {
                        'event_date': event_start.get('event_date'),
                        'latitude': event_start.get('latitude'),
                        'longitude': event_start.get('longitude'),
                        'comments': event_start.get('comments'),
                        'distance_event_customer': event_start.get('distance_event_customer')
                    }
                if event_end:
                    cliente['event_end'] = {
                        'event_date': event_end.get('event_date'),
                        'latitude': event_end.get('latitude'),
                        'longitude': event_end.get('longitude'),
                        'comments': event_end.get('comments'),
                        'distance_event_customer': event_end.get('distance_event_customer')
                    }

                rutas_dict[route_id]["clientes"].append(cliente)

                # CORREGIDO: Solo agregar coordenadas a ruta_linea si el cliente FUE VISITADO
                # Esto evita que aparezcan líneas hacia clientes no visitados
                if lat is not None and lng is not None:
                    rutas_dict[route_id]["total_puntos_ruta"] += 1
                    
                    # Solo agregar a ruta_linea si el cliente fue VISITADO
                    if visitado:
                        rutas_dict[route_id]["ruta_linea"].append([lng, lat])
                        rutas_dict[route_id]["clientes_visitados_validos"] += 1

                    # CORREGIDO: Solo crear paso para reproducción si el cliente fue VISITADO
                    # Esto evita que aparezcan pasos hacia clientes no visitados en el reproductor
                    if visitado:
                        paso = {
                            "paso_numero": len(rutas_dict[route_id]["secuencia_pasos"]) + 1,
                            "cliente_id": route_detail_id,
                            "codigo": subject_code,
                            "nombre": subject_name,
                            # incluir coordenadas preferentes (event_start preferido) en el paso
                            "coordenadas": [lng, lat],
                            "event_begin": (event_start and {
                                'event_date': event_start.get('event_date'),
                                'latitude': event_start.get('latitude'),
                                'longitude': event_start.get('longitude'),
                                'comments': event_start.get('comments')
                            }) or None,
                            "event_end": (event_end and {
                                'event_date': event_end.get('event_date'),
                                'latitude': event_end.get('latitude'),
                                'longitude': event_end.get('longitude'),
                                'comments': event_end.get('comments')
                            }) or None,
                            "visit_sequence": visit_sequence,
                            "ventas": float(invoice_amount),
                            "pedidos": float(order_amount),
                            "recibos": float(receipt_amount),
                            "estado": estado,
                            "es_planificado": planificado,
                            "distancia_desde_anterior": 0.0,  # Se calculará después
                            "tiempo_estimado_minutos": 0  # Se calculará después
                        }
                        rutas_dict[route_id]["secuencia_pasos"].append(paso)
            
            except (IndexError, TypeError, ValueError) as e:
                print(f"⚠️ Error procesando fila {i}: {e}")
                print(f"⚠️ Contenido de la fila: {row}")
                continue
        
        # Ordenar secuencia_pasos por visit_sequence y actualizar paso_numero
        for ruta in rutas_dict.values():
            if ruta["secuencia_pasos"]:
                # Ordenar por visit_sequence
                ruta["secuencia_pasos"].sort(key=lambda x: x["visit_sequence"] or 0)
                
                # Actualizar paso_numero y calcular distancias
                distancia_total = 0.0
                tiempo_total = 0
                
                for i, paso in enumerate(ruta["secuencia_pasos"]):
                    paso["paso_numero"] = i + 1
                    
                    # Calcular distancia desde el paso anterior (aproximada)
                    if i > 0:
                        paso_anterior = ruta["secuencia_pasos"][i-1]
                        lat1, lng1 = paso_anterior["coordenadas"][1], paso_anterior["coordenadas"][0]
                        lat2, lng2 = paso["coordenadas"][1], paso["coordenadas"][0]
                        
                        # Fórmula de distancia euclidiana aproximada (en km)
                        lat_diff = lat2 - lat1
                        lng_diff = lng2 - lng1
                        distancia_km = math.sqrt(lat_diff**2 + lng_diff**2) * 111.32  # 1 grado ≈ 111.32 km
                        
                        paso["distancia_desde_anterior"] = round(distancia_km, 2)
                        distancia_total += distancia_km
                        
                        # Tiempo estimado: 5 minutos por visita + tiempo de viaje (40 km/h promedio)
                        tiempo_viaje = (distancia_km / 40) * 60  # minutos
                        paso["tiempo_estimado_minutos"] = int(5 + tiempo_viaje)
                        tiempo_total += paso["tiempo_estimado_minutos"]
                    else:
                        paso["distancia_desde_anterior"] = 0.0
                        paso["tiempo_estimado_minutos"] = 5  # Tiempo base para el primer cliente
                        tiempo_total += 5
                    
                # Reconstruir ruta_linea en el orden correcto
                ruta["ruta_linea"] = [paso["coordenadas"] for paso in ruta["secuencia_pasos"]]
                
                # Agregar estadísticas totales a la ruta
                ruta["distancia_total_estimada"] = round(distancia_total, 2)
                ruta["tiempo_total_estimado"] = tiempo_total
                
                print(f"🔄 Ruta {ruta['route_id']}: {len(ruta['secuencia_pasos'])} pasos ordenados por visit_sequence")
        
        rutas_list = list(rutas_dict.values())
        print(f"📊 Procesadas {len(rutas_list)} rutas con {sum(r['total_puntos_ruta'] for r in rutas_list)} puntos totales")
        
        # CONSULTA DE ZONAS ALTERNATIVA - Primero intentamos con route_zone_detail, si no funciona usamos group_id
        zonas_query = f"""
        SELECT DISTINCT
            z.id as zona_id,
            z.group_id,
            z.name as nombre,
            z.color,
            z.coordinates,
            COUNT(DISTINCT r.id) as total_rutas,
            COALESCE(SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END), 0) as total_ventas,
            COUNT(DISTINCT CASE WHEN rd.visit_sequence IS NOT NULL THEN rd.id END) as total_clientes_visitados
        FROM zone z
        INNER JOIN route_zone_detail rzd ON z.id::text = rzd.zone_code
        INNER JOIN route r ON r.id = rzd.route_id
        INNER JOIN route_detail rd ON rd.route_id = r.id
        WHERE z.coordinates IS NOT NULL 
        AND z.coordinates != ''
        AND {condicion_fecha}{filtro_vendedor}{filtro_dia_semana}
        GROUP BY z.id, z.group_id, z.name, z.color, z.coordinates
        HAVING COUNT(DISTINCT r.id) > 0
        ORDER BY z.name
        """
        
        print(f"🗺️ PRIMERA CONSULTA DE ZONAS (con route_zone_detail):")
        print(f"🗺️ {zonas_query}")
        
        try:
            cursor.execute(zonas_query)
            print(f"✅ Primera consulta de zonas ejecutada correctamente")
            zonas_rows = cursor.fetchall()
            print(f"📍 Encontradas {len(zonas_rows)} zonas con route_zone_detail")
        except Exception as zona_error:
            print(f"❌ Error ejecutando primera consulta de zonas: {zona_error}")
            zonas_rows = []

        # Si no encontramos zonas con route_zone_detail, intentamos con group_id directo
        if len(zonas_rows) == 0:
            print(f"🔄 Intentando consulta alternativa usando group_id...")
            
            # Primero veamos qué group_ids tenemos en las rutas procesadas
            group_ids_encontrados = set()
            for ruta in rutas_list:
                if hasattr(ruta, 'group_id') and ruta.get('group_id'):
                    group_ids_encontrados.add(ruta['group_id'])
            print(f"🔍 Group IDs encontrados en rutas: {list(group_ids_encontrados)}")
            
            zonas_query_alt = f"""
            SELECT DISTINCT
                z.id as zona_id,
                z.group_id,
                z.name as nombre,
                z.color,
                z.coordinates,
                COUNT(DISTINCT r.id) as total_rutas,
                COALESCE(SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END), 0) as total_ventas,
                COUNT(DISTINCT CASE WHEN rd.visit_sequence IS NOT NULL THEN rd.id END) as total_clientes_visitados
            FROM zone z
            INNER JOIN route r ON r.group_id = z.group_id
            INNER JOIN route_detail rd ON rd.route_id = r.id
            WHERE z.coordinates IS NOT NULL 
            AND z.coordinates != ''
            AND {condicion_fecha}{filtro_vendedor}{filtro_dia_semana}
            GROUP BY z.id, z.group_id, z.name, z.color, z.coordinates
            HAVING COUNT(DISTINCT r.id) > 0
            ORDER BY z.name
            """
            
            print(f"🗺️ CONSULTA ALTERNATIVA DE ZONAS (con group_id):")
            print(f"🗺️ {zonas_query_alt}")
            
            try:
                cursor.execute(zonas_query_alt)
                print(f"✅ Consulta alternativa de zonas ejecutada correctamente")
                zonas_rows = cursor.fetchall()
                print(f"📍 Encontradas {len(zonas_rows)} zonas con group_id")
            except Exception as zona_error:
                print(f"❌ Error ejecutando consulta alternativa de zonas: {zona_error}")
                zonas_rows = []
        
        # TERCERA ESTRATEGIA: Si aún no hay zonas, mostrar todas las zonas disponibles (para debug)
        if len(zonas_rows) == 0:
            print(f"🔍 TERCERA ESTRATEGIA - Verificando todas las zonas disponibles:")
            zonas_debug_query = """
            SELECT DISTINCT
                z.id as zona_id,
                z.group_id,
                z.name as nombre,
                z.color,
                CASE 
                    WHEN z.coordinates IS NULL THEN 'NULL'
                    WHEN z.coordinates = '' THEN 'EMPTY'
                    ELSE 'HAS_COORDS'
                END as coord_status,
                SUBSTRING(z.coordinates, 1, 50) as coord_sample
            FROM zone z
            ORDER BY z.group_id
            LIMIT 10
            """
            
            try:
                cursor.execute(zonas_debug_query)
                debug_zones = cursor.fetchall()
                print(f"🔍 Zonas disponibles en la base de datos:")
                for zone in debug_zones:
                    print(f"   - Zona {zone['zona_id']}: Group {zone['group_id']}, Nombre: {zone['nombre']}, Coords: {zone['coord_status']}")
            except Exception as debug_error:
                print(f"❌ Error en consulta de debug: {debug_error}")
                
            # También verificar si hay registros en route_zone_detail
            route_zone_debug_query = """
            SELECT COUNT(*) as total_records,
                   COUNT(DISTINCT zone_code) as unique_zones,
                   COUNT(DISTINCT route_id) as unique_routes
            FROM route_zone_detail
            """
            
            try:
                cursor.execute(route_zone_debug_query)
                debug_rzd = cursor.fetchone()
                print(f"🔍 Tabla route_zone_detail: {debug_rzd['total_records']} registros, {debug_rzd['unique_zones']} zonas, {debug_rzd['unique_routes']} rutas")
            except Exception as debug_error:
                print(f"❌ Error verificando route_zone_detail: {debug_error}")
        
        # ESTRATEGIA HÍBRIDA: Intentar obtener coordenadas reales, si no crear zonas artificiales
        # Esto garantiza que las zonas correspondan exactamente a las fechas y vendedores seleccionados
        print(f"🏗️ ESTRATEGIA HÍBRIDA - Coordenadas reales si existen, artificiales si no...")
        print(f"🗓️ Filtros aplicados - Período: {periodo}, Vendedor: {vendedor_id}, Fechas: {fecha_inicio} a {fecha_fin}")
        
        # Recopilar información de zonas desde las rutas procesadas (ya filtradas por fecha/vendedor)
        zonas_desde_rutas = {}
        zone_codes_filtrados = set()
        fechas_procesadas = set()
        
        for ruta in rutas_list:
            zona_code = ruta.get('zona_code')
            zona_name = ruta.get('zona_name') 
            zona_color = ruta.get('zona_color')
            fecha_ruta = ruta.get('fecha')
            
            # Capturar fecha para debugging
            if fecha_ruta:
                fechas_procesadas.add(fecha_ruta)
            
            if zona_code and zona_name:  # Solo si tenemos código y nombre de zona
                zone_codes_filtrados.add(zona_code)
                
                if zona_code not in zonas_desde_rutas:
                    zonas_desde_rutas[zona_code] = {
                        'zona_id': f"auto_{zona_code}",
                        'zona_code': zona_code,
                        'group_id': ruta.get('group_id', 0),
                        'nombre': zona_name,
                        'color': f"#{zona_color}" if zona_color and not zona_color.startswith('#') else zona_color or '#666666',
                        'coordinates': None,  # Se intentará obtener de BD
                        'total_rutas': 0,
                        'total_ventas': 0,
                        'total_clientes_visitados': 0,
                        'clientes_coords': []  # Para crear zona artificial si no hay coordenadas reales
                    }
                
                # Acumular estadísticas
                zona_info = zonas_desde_rutas[zona_code]
                zona_info['total_rutas'] += 1
                
                # Agregar coordenadas de clientes para posible zona artificial
                for cliente in ruta.get('clientes', []):
                    if cliente.get('visitado') and cliente.get('latitud') and cliente.get('longitud'):
                        zona_info['total_clientes_visitados'] += 1
                        zona_info['total_ventas'] += cliente.get('ventas', 0)
                        zona_info['clientes_coords'].append([cliente['longitud'], cliente['latitud']])
            
        print(f"🔍 Zone codes encontrados en rutas filtradas: {sorted(zone_codes_filtrados)}")
        print(f"📅 Fechas procesadas: {sorted(fechas_procesadas)}")
        
        # Obtener coordenadas reales desde la tabla zone usando zone.id
        if zone_codes_filtrados:
            zone_codes_str = "', '".join(zone_codes_filtrados)
            zonas_reales_query = f"""
            SELECT DISTINCT
                z.id::text as zona_code,
                z.id as zona_id,
                z.group_id,
                z.name as nombre,
                z.color,
                z.coordinates
            FROM zone z
            WHERE z.id::text IN ('{zone_codes_str}')
            AND z.coordinates IS NOT NULL 
            AND z.coordinates != ''
            ORDER BY z.name
            """
            
            print(f"🗺️ OBTENIENDO COORDENADAS REALES desde zone usando zone.id:")
            print(f"🗺️ {zonas_reales_query}")
            
            try:
                cursor.execute(zonas_reales_query)
                zonas_reales_bd = cursor.fetchall()
                print(f"📍 Encontradas {len(zonas_reales_bd)} zonas con coordenadas reales en zone")
                
                # Actualizar con coordenadas reales donde sea posible
                for zona_bd in zonas_reales_bd:
                    zona_code = str(zona_bd['zona_code'])  # Convertir a string para comparar
                    if zona_code in zonas_desde_rutas:
                        zonas_desde_rutas[zona_code]['coordinates'] = zona_bd['coordinates']
                        # También actualizar color y nombre si vienen de la BD
                        if zona_bd['color']:
                            color = zona_bd['color']
                            if not color.startswith('#'):
                                color = f"#{color}"
                            zonas_desde_rutas[zona_code]['color'] = color
                        if zona_bd['nombre']:
                            zonas_desde_rutas[zona_code]['nombre'] = zona_bd['nombre']
                        print(f"   ✅ Zona {zona_code} usando coordenadas REALES de zone tabla ({len(zona_bd['coordinates'])} chars)")
                        
            except Exception as zona_error:
                print(f"❌ Error obteniendo coordenadas reales: {zona_error}")
        
        # Convertir a formato de zonas_rows, usando coordenadas reales o creando artificiales
        zonas_rows = []
        for zona_code, zona_info in zonas_desde_rutas.items():
            if zona_info['coordinates']:
                # Usar coordenadas reales de la base de datos
                zona_row = {
                    'zona_id': zona_info['zona_id'],
                    'group_id': zona_info['group_id'],
                    'nombre': zona_info['nombre'],
                    'color': zona_info['color'],
                    'coordinates': zona_info['coordinates'],  # Coordenadas reales
                    'total_rutas': zona_info['total_rutas'],
                    'total_ventas': zona_info['total_ventas'],
                    'total_clientes_visitados': zona_info['total_clientes_visitados']
                }
                print(f"   🗺️ Zona {zona_code} usa coordenadas REALES ({len(zona_info['coordinates'])} chars)")
                
            elif zona_info['clientes_coords']:
                # Crear zona artificial si no hay coordenadas reales pero sí clientes
                coords = zona_info['clientes_coords']
                centro_lng = sum(coord[0] for coord in coords) / len(coords)
                centro_lat = sum(coord[1] for coord in coords) / len(coords)
                
                # Crear un polígono simple alrededor del centro (cuadrado de ~1km)
                radio = 0.01  # Aproximadamente 1km
                polygon_coords = [
                    [centro_lng - radio, centro_lat - radio],  # SW
                    [centro_lng + radio, centro_lat - radio],  # SE  
                    [centro_lng + radio, centro_lat + radio],  # NE
                    [centro_lng - radio, centro_lat + radio],  # NW
                    [centro_lng - radio, centro_lat - radio]   # Cerrar polígono
                ]
                
                zona_row = {
                    'zona_id': zona_info['zona_id'],
                    'group_id': zona_info['group_id'],
                    'nombre': zona_info['nombre'],
                    'color': zona_info['color'],
                    'coordinates': ' '.join([f"{coord[1]},{coord[0]}" for coord in polygon_coords]),  # formato "lat,lng lat,lng"
                    'total_rutas': zona_info['total_rutas'],
                    'total_ventas': zona_info['total_ventas'], 
                    'total_clientes_visitados': zona_info['total_clientes_visitados']
                }
                print(f"   🔶 Zona {zona_code} usa polígono ARTIFICIAL (no se encontraron coordenadas reales)")
            else:
                print(f"   ❌ Zona {zona_code} descartada: sin coordenadas reales ni clientes visitados")
                continue
                
            zonas_rows.append(zona_row)
        
        print(f"🏗️ Generadas {len(zonas_rows)} zonas (reales + artificiales) para visualización")
        
        zonas_result = []
        
        print(f"🔍 Procesando {len(zonas_rows)} zonas encontradas...")
        
        for i, zona_row in enumerate(zonas_rows):
            try:
                print(f"🔍 Procesando zona {i+1}: ID={zona_row.get('zona_id', 'N/A')}, Nombre={zona_row.get('nombre', 'N/A')}")
                
                # Parsear coordenadas - usando nombres de campo
                coordinates_str = zona_row['coordinates']
                print(f"🔍 Coordenadas string: '{coordinates_str}' (len={len(coordinates_str) if coordinates_str else 0})")
                
                if coordinates_str and coordinates_str.strip():
                    # Las coordenadas pueden estar en formato: 
                    # 1. "-25.123,-57.456 -25.124,-57.457 ..." (con coma)
                    # 2. "-25.123 -57.456 -25.124 -57.457 ..." (separado por espacios)
                    coordinate_tokens = coordinates_str.strip().split()
                    coordinates = []
                    
                    if any(',' in token for token in coordinate_tokens):
                        # Formato con comas: "lat,lng lat,lng"
                        for pair in coordinate_tokens:
                            if ',' in pair:
                                try:
                                    lat_str, lng_str = pair.split(',')
                                    lat = float(lat_str.replace(',', '.'))
                                    lng = float(lng_str.replace(',', '.'))
                                    coordinates.append([lng, lat])  # GeoJSON usa [lng, lat]
                                except (ValueError, IndexError) as e:
                                    print(f"⚠️ Error parseando coordenada '{pair}': {e}")
                                    continue
                    else:
                        # Formato separado por espacios: "lat lng lat lng"
                        # Agrupar de a pares
                        for i in range(0, len(coordinate_tokens) - 1, 2):
                            try:
                                lat_str = coordinate_tokens[i]
                                lng_str = coordinate_tokens[i + 1]
                                lat = float(lat_str.replace(',', '.'))
                                lng = float(lng_str.replace(',', '.'))
                                coordinates.append([lng, lat])  # GeoJSON usa [lng, lat]
                            except (ValueError, IndexError) as e:
                                print(f"⚠️ Error parseando coordenadas '{lat_str} {lng_str}': {e}")
                                continue
                    
                    print(f"🔍 Coordenadas parseadas: {len(coordinates)} puntos")
                    
                    if len(coordinates) >= 3:  # Mínimo 3 puntos para un polígono
                        # Asegurar que el polígono esté cerrado
                        if coordinates[0] != coordinates[-1]:
                            coordinates.append(coordinates[0])
                        
                        # Calcular centro del polígono
                        centro_lng = sum(coord[0] for coord in coordinates) / len(coordinates)
                        centro_lat = sum(coord[1] for coord in coordinates) / len(coordinates)
                        
                        # Asegurar que el color tenga el prefijo #
                        color = zona_row['color']
                        if color and not color.startswith('#'):
                            color = f"#{color}"
                        elif not color:
                            color = "#666666"  # Color por defecto
                        
                        # Calcular KPIs comparativos para la zona
                        ventas_actuales = float(zona_row['total_ventas']) if zona_row['total_ventas'] else 0
                        clientes_actuales = zona_row['total_clientes_visitados'] if zona_row['total_clientes_visitados'] else 0
                        
                        zona_data = {
                            "zona_id": zona_row['zona_id'],
                            "group_id": zona_row['group_id'],
                            "nombre": zona_row['nombre'],
                            "color": color,
                            "coordinates": [coordinates],  # Array de polígonos
                            "centro_lng": centro_lng,
                            "centro_lat": centro_lat,
                            "total_rutas": zona_row['total_rutas'],
                            "total_ventas": ventas_actuales,
                            "total_clientes_visitados": clientes_actuales,
                            "kpis": {
                                "ventas_actuales": ventas_actuales,
                                "clientes_actuales": clientes_actuales,
                                "promedio_venta_cliente": round(ventas_actuales / clientes_actuales, 2) if clientes_actuales > 0 else 0,
                                "ventas_periodo_anterior": 0,  # Se calculará después
                                "crecimiento_porcentual": 0,  # Se calculará después
                                "rendimiento_vs_promedio": "promedio",  # Se calculará después
                                "ranking_zona": 0  # Se calculará después
                            }
                        }
                        
                        print(f"✅ Zona procesada exitosamente: {zona_data['nombre']}")
                        zonas_result.append(zona_data)
                    else:
                        print(f"❌ Zona {zona_row.get('nombre', 'N/A')} descartada: insuficientes coordenadas ({len(coordinates)} < 3)")
                else:
                    print(f"❌ Zona {zona_row.get('nombre', 'N/A')} descartada: coordenadas vacías o nulas")
                        
            except Exception as e:
                print(f"⚠️ Error procesando zona {zona_row['zona_id'] if 'zona_id' in zona_row else 'desconocida'}: {e}")
                continue
        
        print(f"🗺️ Zonas procesadas con filtros aplicados: {len(zonas_result)} zonas")
        
        # Calcular KPIs comparativos y colores de rendimiento
        if len(zonas_result) > 0:
            print(f"📊 Calculando KPIs comparativos...")
            
            # Calcular promedio de facturación entre todas las zonas
            total_ventas_todas = sum(z['total_ventas'] for z in zonas_result)
            promedio_ventas = total_ventas_todas / len(zonas_result) if len(zonas_result) > 0 else 0
            
            # Ordenar zonas por ventas para ranking
            zonas_ordenadas = sorted(zonas_result, key=lambda x: x['total_ventas'], reverse=True)
            
            # Inicializar variables de fechas
            fecha_real_inicio = None
            fecha_real_fin = None
            
            # Determinar fechas reales del período actual
            if fecha_inicio and fecha_fin:
                fecha_real_inicio = fecha_inicio
                fecha_real_fin = fecha_fin
                print(f"🗓️ Usando fechas proporcionadas: {fecha_inicio} a {fecha_fin}")
            else:
                # Calcular fechas basado en el período
                hoy = datetime.now()
                print(f"🗓️ Calculando fechas para período: {periodo}")
                
                if periodo == "dia":
                    fecha_real_inicio = hoy.strftime('%Y-%m-%d')
                    fecha_real_fin = hoy.strftime('%Y-%m-%d')
                elif periodo == "semana":
                    inicio_semana = hoy - timedelta(days=7)
                    fecha_real_inicio = inicio_semana.strftime('%Y-%m-%d')
                    fecha_real_fin = hoy.strftime('%Y-%m-%d')
                elif periodo == "mes":
                    inicio_mes = hoy.replace(day=1)
                    fecha_real_inicio = inicio_mes.strftime('%Y-%m-%d')
                    fecha_real_fin = hoy.strftime('%Y-%m-%d')
                elif periodo == "ano":
                    inicio_ano = hoy.replace(month=1, day=1)
                    fecha_real_inicio = inicio_ano.strftime('%Y-%m-%d')
                    fecha_real_fin = hoy.strftime('%Y-%m-%d')
                else:
                    # Por defecto últimos 30 días
                    inicio_30_dias = hoy - timedelta(days=30)
                    fecha_real_inicio = inicio_30_dias.strftime('%Y-%m-%d')
                    fecha_real_fin = hoy.strftime('%Y-%m-%d')
                
                print(f"🗓️ Fechas calculadas: {fecha_real_inicio} a {fecha_real_fin}")
            
            # Validar que las fechas no sean None antes de strptime
            if fecha_real_inicio is None or fecha_real_fin is None:
                print(f"⚠️ Error: fechas None - inicio: {fecha_real_inicio}, fin: {fecha_real_fin}")
                # Usar fechas por defecto
                hoy = datetime.now()
                fecha_real_inicio = (hoy - timedelta(days=7)).strftime('%Y-%m-%d')
                fecha_real_fin = hoy.strftime('%Y-%m-%d')
            
            # Calcular período anterior (mismo rango de fechas pero período anterior)
            inicio_dt = datetime.strptime(fecha_real_inicio, '%Y-%m-%d')
            fin_dt = datetime.strptime(fecha_real_fin, '%Y-%m-%d')
            diferencia_dias = (fin_dt - inicio_dt).days + 1
            
            # Calcular fechas del período anterior usando lógica inteligente
            if periodo == "dia" or diferencia_dias == 1:
                # Para día específico, primero intentamos comparar con el mismo día de la semana pasada
                # y luego, por zona, si no hay ventas en esa fecha, usamos la última fecha con datos de esa zona
                inicio_dt_single = inicio_dt
                comp_fecha_dt = inicio_dt_single - timedelta(days=7)
                comp_fecha = comp_fecha_dt.strftime('%Y-%m-%d')
                fecha_anterior_inicio = comp_fecha
                fecha_anterior_fin = comp_fecha
                print(f"🔍 Día específico: intentaremos comparar con el mismo día de la semana pasada: {comp_fecha}")
            elif periodo == "semana" or diferencia_dias <= 7:
                # Para semana, comparar con la semana anterior
                if fechas_comp:
                    fecha_anterior_inicio = fechas_comp['comp_inicio']
                    fecha_anterior_fin = fechas_comp['comp_fin']
                else:
                    fecha_anterior_inicio = (inicio_dt - timedelta(days=7)).strftime('%Y-%m-%d')
                    fecha_anterior_fin = (fin_dt - timedelta(days=7)).strftime('%Y-%m-%d')
            else:
                # Para períodos más largos, usar comparación inteligente o fallback
                if fechas_comp:
                    fecha_anterior_inicio = fechas_comp['comp_inicio']
                    fecha_anterior_fin = fechas_comp['comp_fin']
                else:
                    fecha_anterior_inicio = (inicio_dt - timedelta(days=diferencia_dias)).strftime('%Y-%m-%d')
                    fecha_anterior_fin = (inicio_dt - timedelta(days=1)).strftime('%Y-%m-%d')
            
            print(f"📈 Período actual: {fecha_real_inicio} a {fecha_real_fin}")
            print(f"📉 Período anterior: {fecha_anterior_inicio} a {fecha_anterior_fin}")
            if fechas_comp:
                print(f"🧠 Comparación inteligente: {fechas_comp['tipo_comparacion']}")
            
            # Obtener ventas del período anterior para comparación (LÓGICA MEJORADA POR ZONA)
            ventas_periodo_anterior = {}
            try:
                # Usar helper reutilizable para obtener ventas por zona entre fechas
                if diferencia_dias == 1:
                    # Fecha única: fecha_anterior_inicio == fecha_anterior_fin
                    ventas_periodo_anterior = obtener_ventas_por_zonas_rango(connection, fecha_anterior_inicio, fecha_anterior_fin, filtro_vendedor)

                    # Para zonas sin datos en la fecha de comparación, usar fallback a la última venta conocida por zona
                    ventas_anteriores_zonas = obtener_ventas_anteriores_por_zona(fecha_real_inicio, connection)
                    falta_zonas = []
                    for zona in zonas_ordenadas:
                        zona_id = zona['zona_id'].replace('auto_', '')
                        if ventas_periodo_anterior.get(zona_id, 0) == 0:
                            fallback = ventas_anteriores_zonas.get(zona_id, {})
                            ventas_periodo_anterior[zona_id] = float(fallback.get('ventas', 0)) if fallback else 0
                            if ventas_periodo_anterior[zona_id] > 0:
                                falta_zonas.append(zona_id)

                    if falta_zonas:
                        print(f"⚠️ Zonas sin ventas en {fecha_anterior_inicio} que usaron fallback a última venta: {falta_zonas}")
                    else:
                        print(f"✅ Todas las zonas tienen datos en la fecha de comparación {fecha_anterior_inicio} o tienen fallback vacío")
                else:
                    # Rango de fechas: usar el helper directamente
                    ventas_periodo_anterior = obtener_ventas_por_zonas_rango(connection, fecha_anterior_inicio, fecha_anterior_fin, filtro_vendedor)

                    print(f"📊 Obtenidas ventas de {len(ventas_periodo_anterior)} zonas del período anterior (rango de fechas)")

                    # Calcular promedios mensuales por zona (últimos 3 meses)
                    promedios_mensuales = {}
                    consulta_promedios = f"""
                    SELECT 
                        rzd.zone_code,
                        COALESCE(AVG(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE NULL END), 0) as promedio_mensual,
                        COUNT(DISTINCT r.day) as dias_activos,
                        COUNT(DISTINCT rd.subject_code) as clientes_unicos
                    FROM public.route r
                    JOIN public.route_detail rd ON rd.route_id = r.id
                    LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
                    WHERE r.day >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 months'
                      AND r.day < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                    {filtro_vendedor}
                    AND rzd.zone_code IS NOT NULL
                    GROUP BY rzd.zone_code
                    """

                    cursor.execute(consulta_promedios)
                    rows_promedios = cursor.fetchall()
                
                for row in rows_promedios:
                    promedios_mensuales[row['zone_code']] = {
                        'promedio_mensual': float(row['promedio_mensual']) if row['promedio_mensual'] else 0,
                        'dias_activos': int(row['dias_activos']) if row['dias_activos'] else 0,
                        'clientes_unicos': int(row['clientes_unicos']) if row['clientes_unicos'] else 0
                    }
                    
                print(f"📊 Calculados promedios mensuales de {len(promedios_mensuales)} zonas")
                
            except Exception as e:
                print(f"⚠️ Error obteniendo ventas período anterior: {e}")
                promedios_mensuales = {}
            
            # Actualizar KPIs de cada zona
            for i, zona in enumerate(zonas_ordenadas):
                zona_id = zona['zona_id'].replace('auto_', '')  # Obtener ID limpio
                
                # Ventas período anterior
                ventas_anterior = ventas_periodo_anterior.get(zona_id, 0)
                
                # Datos del promedio mensual
                datos_promedio = promedios_mensuales.get(zona_id, {})
                promedio_mensual = datos_promedio.get('promedio_mensual', 0)
                dias_activos = datos_promedio.get('dias_activos', 0)
                clientes_unicos_mes = datos_promedio.get('clientes_unicos', 0)
                
                # Calcular crecimiento porcentual
                if ventas_anterior > 0:
                    crecimiento = ((zona['total_ventas'] - ventas_anterior) / ventas_anterior) * 100
                else:
                    crecimiento = 100 if zona['total_ventas'] > 0 else 0
                
                # Comparar con promedio mensual
                vs_promedio_mensual = 0
                if promedio_mensual > 0:
                    vs_promedio_mensual = ((zona['total_ventas'] - promedio_mensual) / promedio_mensual) * 100
                
                # Determinar rendimiento vs promedio general
                if zona['total_ventas'] > promedio_ventas * 1.2:  # 20% por encima
                    rendimiento = "excelente"
                    color_rendimiento = "#22c55e"  # Verde
                elif zona['total_ventas'] > promedio_ventas * 0.8:  # Entre 80% y 120%
                    rendimiento = "promedio"
                    color_rendimiento = "#eab308"  # Amarillo
                else:
                    rendimiento = "bajo"
                    color_rendimiento = "#ef4444"  # Rojo
                
                # Actualizar KPIs con datos avanzados
                zona['kpis'].update({
                    "ventas_periodo_anterior": ventas_anterior,
                    "crecimiento_porcentual": round(crecimiento, 2),
                    "rendimiento_vs_promedio": rendimiento,
                    "ranking_zona": i + 1,  # Posición en ranking
                    "promedio_general": round(promedio_ventas, 2),
                    "color_rendimiento": color_rendimiento,
                    "promedio_mensual": round(promedio_mensual, 2),
                    "vs_promedio_mensual": round(vs_promedio_mensual, 2),
                    "dias_activos_mes": dias_activos,
                    "clientes_unicos_mes": clientes_unicos_mes,
                    "eficiencia_diaria": round(zona['total_ventas'] / max(dias_activos, 1), 2)
                })
                
                # Opcional: Cambiar color de la zona según rendimiento
                # zona['color'] = color_rendimiento
                
                print(f"   📊 Zona {zona['nombre']}: ${zona['total_ventas']:,.0f} (anterior: ${ventas_anterior:,.0f}, {crecimiento:+.1f}%, {rendimiento})")
        
        if vendedor_id:
            print(f"👤 Mostrando SOLO zonas donde trabajó el vendedor ID: {vendedor_id}")
        else:
            print(f"🌍 Mostrando zonas para TODOS los vendedores en el período")
        
        # Calcular estadísticas
        total_clientes = sum(len(r["clientes"]) for r in rutas_list)
        total_visitados = sum(len([c for c in r["clientes"] if c["visitado"]]) for r in rutas_list)
        total_no_visitados = sum(len([c for c in r["clientes"] if not c["visitado"]]) for r in rutas_list)
        visitas_no_planificadas = sum(len([c for c in r["clientes"] if c["estado"] == "visita_no_planificada"]) for r in rutas_list)
        ventas_totales = sum(sum(c["ventas"] for c in r["clientes"]) for r in rutas_list)
        
        cursor.close()
        connection.close()
        
        # Si el cliente solicitó una versión compacta, devolver menos campos para reducir el tamaño
        if compact:
            compact_rutas = []
            for r in rutas_list:
                compact_clients = []
                for c in r.get('clientes', []):
                    compact_clients.append({
                        'cliente_id': c.get('cliente_id'),
                        'codigo': c.get('codigo'),
                        'nombre': c.get('nombre'),
                        'latitud': c.get('latitud'),
                        'longitud': c.get('longitud'),
                        'visitado': c.get('visitado'),
                        'ventas': c.get('ventas')
                    })

                compact_rutas.append({
                    'route_id': r.get('route_id'),
                    'vendedor_id': r.get('vendedor_id'),
                    'vendedor': r.get('vendedor'),
                    'fecha': r.get('fecha'),
                    'dia_semana': r.get('dia_semana'),
                    'color': r.get('color'),
                    'status': r.get('status'),
                    'zona_code': r.get('zona_code'),
                    'zona_name': r.get('zona_name'),
                    'ruta_linea': r.get('ruta_linea'),
                    'clientes': compact_clients,
                    'total_puntos_ruta': r.get('total_puntos_ruta')
                })

            compact_zonas = []
            for z in zonas_result:
                compact_zonas.append({
                    'zona_id': z.get('zona_id'),
                    'nombre': z.get('nombre'),
                    'color': z.get('color'),
                    'centro_lng': z.get('centro_lng'),
                    'centro_lat': z.get('centro_lat'),
                    'total_ventas': z.get('total_ventas')
                })

            estadisticas_compact = {
                'total_clientes_planificados': total_clientes - visitas_no_planificadas,
                'total_clientes_visitados': total_visitados,
                'ventas_totales': ventas_totales,
                'zonas_activas': len(compact_zonas)
            }

            return {
                'rutas': compact_rutas,
                'zonas': compact_zonas,
                'estadisticas_mapa': estadisticas_compact
            }

        # Versión completa por defecto
        return {
            "rutas": rutas_list,
            "zonas": zonas_result,
            "estadisticas_mapa": {
                "total_clientes_planificados": total_clientes - visitas_no_planificadas,
                "total_clientes_visitados": total_visitados,
                "clientes_no_visitados": total_no_visitados,
                "visitas_no_planificadas": visitas_no_planificadas,
                "ventas_totales": ventas_totales,
                "distancia_total_planificada": sum(r["distancia_planificada"] for r in rutas_list),
                "distancia_total_real": sum(r["distancia_real"] for r in rutas_list),
                "zonas_activas": len(zonas_result),
                "km_recorridos": sum(r["distancia_real"] for r in rutas_list)
            }
        }
        
    except Exception as e:
        print(f"Error en get_mapa_rutas: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo datos de rutas: {str(e)}")


@app.get("/route_details_with_events")
def route_details_with_events(
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    vendedor_id: Optional[int] = None,
    limit: int = 1000
):
    """Devuelve una lista de route_detail enriquecida con el primer evento tipo 1 (inicio)
    y el primer evento tipo 2 (fin/observación) asociados, para el rango de fechas dado.
    Parámetros:
    - fecha_inicio, fecha_fin: strings 'YYYY-MM-DD' (si no se proveen, se usan últimos 30 días)
    - vendedor_id: opcional para filtrar por vendedor
    - limit: cantidad máxima de filas a devolver
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)

        # Construir condición de fechas sobre r.day
        if fecha_inicio and fecha_fin:
            where_fecha = "r.day >= %s AND r.day <= %s"
            params = [fecha_inicio, fecha_fin]
        else:
            # últimos 30 días
            where_fecha = "r.day >= CURRENT_DATE - INTERVAL '30 days' AND r.day <= CURRENT_DATE"
            params = []

        filtro_vendedor = ""
        if vendedor_id:
            filtro_vendedor = " AND r.user_id = %s"
            params.append(vendedor_id)

        query = f"""
        SELECT r.id as route_id, r.day as fecha_ruta, r.user_id, r.group_id,
               rd.id as route_detail_id, rd.subject_code, rd.subject_name, rd.sequence, rd.visit_sequence,
               rd.latitude, rd.longitude, rd.invoice_amount, rd.order_amount, rd.receipt_amount
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        WHERE {where_fecha} {filtro_vendedor}
        ORDER BY r.day DESC, rd.visit_sequence NULLS LAST
        LIMIT %s
        """

        params.append(limit)
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        rd_ids = [r['route_detail_id'] for r in rows if r and r.get('route_detail_id')]
        eventos = fetch_events_for_route_details(connection, rd_ids)

        resultado = []
        for r in rows:
            rdid = r['route_detail_id']
            evt = eventos.get(rdid, {})
            item = dict(r)
            item['event_start'] = evt.get('start') if evt else None
            item['event_end'] = evt.get('end') if evt else None
            resultado.append(item)

        cursor.close()
        connection.close()
        return { 'count': len(resultado), 'rows': resultado }
    except Exception as e:
        print(f"Error en route_details_with_events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/events/{event_id}/ventas")
def ventas_por_evento(event_id: int):
    """Devuelve las líneas de factura (invoice_detail) asociadas a las invoice
    vinculadas al `event` indicado. Filtra solo invoices con `type = 16`.
    Si no existen invoice_detail para el evento, devuelve los totales
    agregados guardados en `route_detail.invoice_amount` como fallback.
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)

        sql = """
        SELECT
          r.id AS route_id,
          rd.id AS route_detail_id,
          rd.subject_code,
          rd.subject_name,
          e.id AS event_id,
          e.event_date,
          i.id AS invoice_id,
          i."number" AS invoice_number,
          i.creation_date AS invoice_date,
          COALESCE(i.gross_total, i.net_total, i.vat_total, 0) AS invoice_total,
          i.currency_code,
          idt.id AS invoice_detail_id,
          idt.product_code,
          idt.product_name,
          idt.quantity,
          idt.unit_price,
          idt.net_amount,
          idt.vat_amount,
          COALESCE(idt.net_amount, (idt.quantity * idt.unit_price)) AS line_total,
          idt.row_number
        FROM public.event e
        JOIN public.invoice i ON i.event_id = e.id
        JOIN public.invoice_detail idt ON idt.invoice_id = i.id
        LEFT JOIN public.route_detail rd ON rd.id = e.route_detail_id
        LEFT JOIN public.route r ON r.id = rd.route_id
                WHERE e.id = %s
                    -- i.type is stored as text/varchar in your schema, compare as string
                    AND i.type::text = '16'
        ORDER BY i.creation_date ASC, idt.row_number ASC
        """

        cursor.execute(sql, (event_id,))
        rows = cursor.fetchall()

        ventas = [dict(r) for r in rows] if rows else []

        # Si no encontramos filas con el filtro de tipo (i.type = 16), intentar sin filtro
        if not ventas:
            alt_sql = sql.replace("AND i.type::text = '16'", "")
            cursor.execute(alt_sql, (event_id,))
            rows2 = cursor.fetchall()
            ventas = [dict(r) for r in rows2] if rows2 else []

        if ventas:
            # Calcular totales por suma de line_total
            total_line = 0.0
            for v in ventas:
                lt = v.get('line_total')
                if lt is None:
                    qty = v.get('quantity') or 0
                    up = v.get('unit_price') or 0
                    lt = qty * up
                try:
                    total_line += float(lt)
                except Exception:
                    pass

            cursor.close()
            connection.close()
            return {
                'event_id': event_id,
                'count': len(ventas),
                'ventas': ventas,
                'totales': {
                    'line_total_sum': round(total_line, 2)
                }
            }

        # Si no hay invoice_detail / invoice asociada, devolver fallback usando route_detail.invoice_amount
        fallback_sql = """
        SELECT e.route_detail_id, rd.invoice_amount, rd.order_amount, rd.subject_code, rd.subject_name, r.id AS route_id
        FROM public.event e
        JOIN public.route_detail rd ON rd.id = e.route_detail_id
        JOIN public.route r ON r.id = rd.route_id
        WHERE e.id = %s
        LIMIT 1
        """
        cursor.execute(fallback_sql, (event_id,))
        rd_row = cursor.fetchone()
        cursor.close()
        connection.close()

        if rd_row:
            return {
                'event_id': event_id,
                'count': 0,
                'ventas': [],
                'ventas_aggregadas': {
                    'invoice_amount': float(rd_row.get('invoice_amount') or 0),
                    'order_amount': float(rd_row.get('order_amount') or 0)
                },
                'route_detail': rd_row
            }

        return {
            'event_id': event_id,
            'count': 0,
            'ventas': [],
            'mensaje': 'No se encontraron invoice ni invoice_detail asociados al evento.'
        }

    except Exception as e:
        print(f"Error en ventas_por_evento: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/route_detail/{route_detail_id}/ventas")
def ventas_por_route_detail(
    route_detail_id: int,
    only_event_type: Optional[int] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
):
    """Devuelve todos los eventos asociados al `route_detail_id` con sus
    facturas e invoice_detail (líneas). Si no se encuentran facturas/lineas,
    devuelve totales agregados desde `route_detail`.

    Se pueden pasar `fecha_inicio` y `fecha_fin` (YYYY-MM-DD) para filtrar
    los eventos por su `event_date` (inclusive).
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)

        # Construir dinámicamente la consulta y parámetros
        where_clauses = ["e.route_detail_id = %s"]
        params = [route_detail_id]

        if only_event_type is not None:
            where_clauses.append("e.event_type_id = %s")
            params.append(only_event_type)

        # Filtrar por rango de fechas si se proporcionan
        if fecha_inicio:
            where_clauses.append("e.event_date::date >= %s")
            params.append(fecha_inicio)
        if fecha_fin:
            where_clauses.append("e.event_date::date <= %s")
            params.append(fecha_fin)

        where_sql = " AND ".join(where_clauses)

        sql_all = f"""
        SELECT
          e.id AS event_id,
          e.event_date,
          e.comments AS comments,
          e.event_type_id,
          i.id AS invoice_id,
          i."number" AS invoice_number,
          i.creation_date AS invoice_date,
          COALESCE(i.gross_total, i.net_total, i.vat_total, 0) AS invoice_total,
          i.currency_code,
          idt.id AS invoice_detail_id,
          idt.product_code,
          idt.product_name,
          idt.quantity,
          idt.unit_price,
          idt.net_amount,
          idt.vat_amount,
          COALESCE(idt.net_amount, (idt.quantity * idt.unit_price)) AS line_total,
          idt.row_number
        FROM public.event e
        LEFT JOIN public.invoice i ON i.event_id = e.id
        LEFT JOIN public.invoice_detail idt ON idt.invoice_id = i.id
        WHERE {where_sql}
        ORDER BY e.event_date ASC, i.creation_date ASC, idt.row_number ASC
        """

        cursor.execute(sql_all, tuple(params))
        rows = cursor.fetchall()
        # If caller requested a specific event type, and no rows found, return empty events (no aggregated fallback)
        if not rows:
            if only_event_type is not None:
                cursor.close()
                connection.close()
                return {'route_detail_id': route_detail_id, 'events': [], 'count': 0, 'ventas': [], 'mensaje': f'No se encontraron eventos del tipo {only_event_type} con líneas de venta.'}

            # fallback: no events with invoice details — return aggregated route_detail (legacy behavior)
            fallback_sql = """
            SELECT rd.id AS route_detail_id, rd.invoice_amount, rd.order_amount, rd.subject_code, rd.subject_name, r.id AS route_id
            FROM public.route_detail rd
            JOIN public.route r ON r.id = rd.route_id
            WHERE rd.id = %s
            LIMIT 1
            """
            cursor.execute(fallback_sql, (route_detail_id,))
            rd_row = cursor.fetchone()
            cursor.close()
            connection.close()
            if rd_row:
                return {
                    'route_detail_id': route_detail_id,
                    'events': [],
                    'count': 0,
                    'ventas_aggregadas': {
                        'invoice_amount': float(rd_row.get('invoice_amount') or 0),
                        'order_amount': float(rd_row.get('order_amount') or 0)
                    }
                }
            return {'route_detail_id': route_detail_id, 'events': [], 'count': 0, 'ventas': [], 'mensaje': 'No se encontraron eventos ni ventas'}

        # Agrupar por evento -> factura -> lineas
        eventos_map = {}
        for r in rows:
            ev_id = r.get('event_id')
            if ev_id is None:
                # evento sin id? ignorar
                continue
            if ev_id not in eventos_map:
                eventos_map[ev_id] = {
                        'event_id': ev_id,
                        'event_date': r.get('event_date'),
                        'comments': r.get('comments'),
                        'event_type_id': r.get('event_type_id'),
                        'invoices': {}
                    }
            ev = eventos_map[ev_id]
            inv_id = r.get('invoice_id')
            if inv_id is None:
                # evento sin factura, seguir
                continue
            if inv_id not in ev['invoices']:
                ev['invoices'][inv_id] = {
                    'invoice_id': inv_id,
                    'invoice_number': r.get('invoice_number'),
                    'invoice_date': r.get('invoice_date'),
                    'invoice_total': r.get('invoice_total'),
                    'currency_code': r.get('currency_code'),
                    'lines': []
                }
            inv = ev['invoices'][inv_id]
            if r.get('invoice_detail_id'):
                inv['lines'].append({
                    'invoice_detail_id': r.get('invoice_detail_id'),
                    'product_code': r.get('product_code'),
                    'product_name': r.get('product_name'),
                    'quantity': float(r.get('quantity') or 0),
                    'unit_price': float(r.get('unit_price') or 0),
                    'net_amount': float(r.get('net_amount') or 0),
                    'vat_amount': float(r.get('vat_amount') or 0),
                    'line_total': float(r.get('line_total') or 0),
                    'row_number': r.get('row_number')
                })

        # Convertir map a lista ordenada
        eventos_list = []
        for ev_id, ev in eventos_map.items():
            invoices_list = []
            for inv_id, inv in ev['invoices'].items():
                invoices_list.append(inv)
            # Ordenar invoices por invoice_date
            invoices_list.sort(key=lambda x: x.get('invoice_date') or '')
            ev['invoices'] = invoices_list
            eventos_list.append(ev)

        eventos_list.sort(key=lambda x: x.get('event_date') or '')

        cursor.close()
        connection.close()
        # Calcular conteo total de lineas encontradas
        total_lines = sum(len(inv['lines']) for ev in eventos_list for inv in ev['invoices'])
        return {
            'route_detail_id': route_detail_id,
            'events': eventos_list,
            'count': total_lines
        }
    except Exception as e:
        print(f"Error en ventas_por_route_detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ventas_por_zona_comparar")
def ventas_por_zona_comparar(
    periodo: str = "dia",
    fecha: Optional[str] = None,
    vendedor_id: Optional[int] = None
):
    """Endpoint que devuelve las ventas por zona en el período solicitado y las compara
    con el mismo período de la semana anterior. Retorna también los totales agregados
    entre todas las zonas.

    - periodo: 'dia' (por defecto), 'semana', 'mes' o 'rango' (si se provee fecha como inicio-fin,
      en este endpoint 'fecha' se interpreta como fecha única para 'dia').
    - fecha: string YYYY-MM-DD (opcional, por defecto hoy para 'dia').
    - vendedor_id: opcional filtro por vendedor.
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)

        # Fecha actual a consultar
        hoy = datetime.now().date()
        if periodo == "dia":
            fecha_actual = fecha if fecha else hoy.strftime('%Y-%m-%d')
            # fecha de comparación: mismo día de la semana pasada
            fecha_comp = (datetime.strptime(fecha_actual, '%Y-%m-%d') - timedelta(days=7)).strftime('%Y-%m-%d')
            where_actual = f"r.day = '{fecha_actual}'"
            where_comp = f"r.day = '{fecha_comp}'"
        elif periodo == "semana":
            # semana: últimos 7 días (incluye hoy)
            fin = hoy
            inicio = hoy - timedelta(days=6)
            fecha_actual = f"{inicio.strftime('%Y-%m-%d')}|{fin.strftime('%Y-%m-%d')}"
            inicio_comp = inicio - timedelta(days=7)
            fin_comp = fin - timedelta(days=7)
            where_actual = f"r.day >= '{inicio.strftime('%Y-%m-%d')}' AND r.day <= '{fin.strftime('%Y-%m-%d')}'"
            where_comp = f"r.day >= '{inicio_comp.strftime('%Y-%m-%d')}' AND r.day <= '{fin_comp.strftime('%Y-%m-%d')}'"
        else:
            # Por defecto tratamos como día único
            fecha_actual = fecha if fecha else hoy.strftime('%Y-%m-%d')
            fecha_comp = (datetime.strptime(fecha_actual, '%Y-%m-%d') - timedelta(days=7)).strftime('%Y-%m-%d')
            where_actual = f"r.day = '{fecha_actual}'"
            where_comp = f"r.day = '{fecha_comp}'"

        filtro_vendedor = f" AND r.user_id = {vendedor_id}" if vendedor_id else ""

        # Obtener ventas actuales por zona
        consulta_actual = f"""
        SELECT COALESCE(rzd.zone_code, 'unknown') as zone_code,
               COALESCE(SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END), 0) as ventas_actuales
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
        WHERE {where_actual}
        {filtro_vendedor}
        AND rzd.zone_code IS NOT NULL
        GROUP BY rzd.zone_code
        """

        cursor.execute(consulta_actual)
        rows_actual = cursor.fetchall()

        ventas_actuales_por_zona = {row['zone_code']: float(row['ventas_actuales'] or 0) for row in rows_actual}

        # Obtener ventas periodo de comparación por zona
        consulta_comp = f"""
        SELECT COALESCE(rzd.zone_code, 'unknown') as zone_code,
               COALESCE(SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END), 0) as ventas_comp
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
        WHERE {where_comp}
        {filtro_vendedor}
        AND rzd.zone_code IS NOT NULL
        GROUP BY rzd.zone_code
        """

        cursor.execute(consulta_comp)
        rows_comp = cursor.fetchall()
        ventas_comp_por_zona = {row['zone_code']: float(row['ventas_comp'] or 0) for row in rows_comp}

        # Para zonas que no aparecen en la fecha de comparación, usar fallback: última venta conocida por zona
        ventas_anteriores_fallback = obtener_ventas_anteriores_por_zona(fecha_actual, connection)

        # Construir unión de zonas
        zonas_union = set(list(ventas_actuales_por_zona.keys()) + list(ventas_comp_por_zona.keys()) + list(ventas_anteriores_fallback.keys()))

        ventas_por_zona = []
        total_actual = 0.0
        total_comp = 0.0

        for z in sorted(zonas_union):
            v_actual = ventas_actuales_por_zona.get(z, 0.0)
            v_comp = ventas_comp_por_zona.get(z, None)

            # Si v_comp es None o 0, intentar fallback con última venta conocida
            if (v_comp is None or v_comp == 0) and z in ventas_anteriores_fallback:
                v_comp = float(ventas_anteriores_fallback[z].get('ventas', 0))

            v_comp = float(v_comp or 0.0)

            crecimiento = None
            if v_comp > 0:
                crecimiento = ((v_actual - v_comp) / v_comp) * 100
            else:
                crecimiento = 100.0 if v_actual > 0 else 0.0

            ventas_por_zona.append({
                "zone_code": z,
                "ventas_actuales": round(v_actual, 2),
                "ventas_periodo_anterior": round(v_comp, 2),
                "crecimiento_porcentual": round(crecimiento, 2)
            })

            total_actual += v_actual
            total_comp += v_comp

        # Totales agregados entre todas las zonas
        crecimiento_total = None
        if total_comp > 0:
            crecimiento_total = ((total_actual - total_comp) / total_comp) * 100
        else:
            crecimiento_total = 100.0 if total_actual > 0 else 0.0

        cursor.close()
        connection.close()

        return {
            "periodo": periodo,
            "fecha_consulta": fecha_actual,
            "fecha_comparacion": fecha_comp if 'fecha_comp' in locals() else None,
            "ventas_por_zona": ventas_por_zona,
            "total_ventas_actuales": round(total_actual, 2),
            "total_ventas_periodo_anterior": round(total_comp, 2),
            "crecimiento_total_porcentual": round(crecimiento_total, 2)
        }

    except Exception as e:
        print(f"Error en ventas_por_zona_comparar: {e}")
        raise HTTPException(status_code=500, detail=f"Error calculando ventas por zona: {str(e)}")

# Otros endpoints con datos dummy por ahora
@app.get("/kpis")
def get_kpis():
    """KPIs básicos del dashboard"""
    return {
        "ventas_mes": 125000.0,
        "clientes_visitados": 87,
        "rutas_completadas": 23,
        "cumplimiento_rutas": 0.92
    }


@app.get("/vendedores")
def get_vendedores():
    """Devuelve la lista de vendedores (id, full_name) desde la vista/table public.v_users"""
    try:
        rows = execute_query("SELECT id, full_name FROM public.v_users ORDER BY full_name")
        return {"count": len(rows), "vendedores": rows}
    except Exception as e:
        print(f"Error en get_vendedores: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/ventas_por_dia") 
def get_ventas_por_dia():
    """Ventas por día para gráfico"""
    return [
        {"fecha": "2025-09-12", "ventas": 15000},
        {"fecha": "2025-09-13", "ventas": 18000},
        {"fecha": "2025-09-14", "ventas": 12000},
        {"fecha": "2025-09-15", "ventas": 22000},
        {"fecha": "2025-09-16", "ventas": 19000},
        {"fecha": "2025-09-17", "ventas": 25000},
        {"fecha": "2025-09-18", "ventas": 14000}
    ]

@app.get("/clientes/visitados")
def get_clientes_visitados(
    periodo: str = "semana",
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    vendedor_id: Optional[int] = None
):
    """Lista de clientes visitados con filtros de período"""
    try:
        # Construir filtros de fecha
        if fecha_inicio and fecha_fin:
            # Convertir fechas a rangos completos (inicio del día a fin del día)
            condicion_fecha = f"r.creation_date >= '{fecha_inicio} 00:00:00' AND r.creation_date <= '{fecha_fin} 23:59:59'"
        elif periodo == "dia":
            condicion_fecha = "r.creation_date >= CURRENT_DATE AND r.creation_date < CURRENT_DATE + INTERVAL '1 day'"
        elif periodo == "semana":
            condicion_fecha = "r.creation_date >= CURRENT_DATE - INTERVAL '7 days' AND r.creation_date < CURRENT_DATE + INTERVAL '1 day'"
        elif periodo == "mes":
            condicion_fecha = "r.creation_date >= DATE_TRUNC('month', CURRENT_DATE) AND r.creation_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'"
        elif periodo == "año":
            condicion_fecha = "r.creation_date >= DATE_TRUNC('year', CURRENT_DATE) AND r.creation_date < DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year'"
        else:
            condicion_fecha = "r.creation_date >= CURRENT_DATE - INTERVAL '30 days' AND r.creation_date < CURRENT_DATE + INTERVAL '1 day'"
        
        filtro_vendedor = f"AND r.user_id = {vendedor_id}" if vendedor_id else ""
        
        query_clientes = f"""
        SELECT DISTINCT
            rd.subject_code as codigo,
            rd.subject_name as nombre,
            v.full_name as vendedor,
            r.user_id as vendedor_id,
            r.creation_date::date as fecha_visita,
            r.creation_date,
            rd.visit_sequence,
            rd.visit_positive,
            rd.invoice_amount as ventas,
            rd.latitude,
            rd.longitude,
            CASE 
                WHEN rd.visit_sequence IS NULL THEN 'No visitado'
                WHEN rd.sequence >= 1000 THEN 'Visita no planificada'
                WHEN rd.visit_positive AND rd.invoice_amount > 0 THEN 'Visita exitosa'
                WHEN rd.visit_positive AND rd.invoice_amount = 0 THEN 'Visita sin venta'
                ELSE 'Visitado sin resultado'
            END as estado_visita
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        LEFT JOIN public.v_users v ON v.id = r.user_id
        WHERE {condicion_fecha}
          {filtro_vendedor}
          AND rd.visit_sequence IS NOT NULL
          AND rd.latitude IS NOT NULL 
          AND rd.longitude IS NOT NULL
        ORDER BY r.creation_date DESC, rd.visit_sequence
        LIMIT 500
        """
        
        resultados = execute_query(query_clientes)
        
        # Procesar resultados
        clientes = []
        for row in resultados:
            cliente = {
                "codigo": row['codigo'],
                "nombre": row['nombre'],
                "vendedor": row['vendedor'] or f"Vendedor {row['vendedor_id']}",
                "vendedor_id": row['vendedor_id'],
                "fecha_visita": str(row['fecha_visita']),
                "visit_sequence": row['visit_sequence'],
                "visit_positive": bool(row['visit_positive']),
                "ventas": float(row['ventas'] or 0),
                "latitud": float(row['latitude']),
                "longitud": float(row['longitude']),
                "estado_visita": row['estado_visita']
            }
            clientes.append(cliente)
        
        return {
            "clientes": clientes,
            "total_clientes": len(clientes),
            "filtros_aplicados": {
                "periodo": periodo,
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "vendedor_id": vendedor_id
            }
        }

    except Exception as e:
        print(f"Error en get_clientes_visitados: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo clientes visitados: {str(e)}")

    def _calcular_rango_por_defecto_ultimos_meses(meses: int = 3):
        """Devuelve (fecha_inicio, fecha_fin) en formato YYYY-MM-DD para los últimos `meses` meses"""
        hoy = datetime.utcnow().date()
        primer_dia_inicio = (hoy.replace(day=1) - timedelta(days=1)).replace(day=1)
        # Si meses==1 sería primer día del mes actual; con 3 meses, retrocedemos adecuadamente
        inicio = (hoy - timedelta(days=meses * 30)).replace(day=1)
        fin = hoy
        return inicio.strftime('%Y-%m-%d'), fin.strftime('%Y-%m-%d')

    @app.get("/clientes_no_visitados")
    def get_clientes_no_visitados(fecha_inicio: str = None, fecha_fin: str = None, vendedor_id: int = None):
        """Devuelve clientes que estuvieron planificados en el período pero no fueron visitados (o sin ventas).

        Parámetros:
        - fecha_inicio, fecha_fin: rango (YYYY-MM-DD). Si no se provee, usa últimos 3 meses.
        - vendedor_id: opcional para filtrar por vendedor
        """
        try:
            if not fecha_inicio or not fecha_fin:
                fecha_inicio, fecha_fin = _calcular_rango_por_defecto_ultimos_meses(3)

            connection = get_db_connection()
            cursor = connection.cursor(cursor_factory=RealDictCursor)

            filtro_vendedor = ""
            params = [fecha_inicio, fecha_fin]
            if vendedor_id:
                filtro_vendedor = "AND r.user_id = %s"
                params.append(vendedor_id)

            # Query: encontrar clientes planificados en el rango pero sin visit_sequence o sin ventas reales
            consulta = f"""
            SELECT
                rd.subject_code as codigo,
                rd.subject_name as nombre,
                rd.latitude,
                rd.longitude,
                MIN(r.day) as primera_planificacion,
                MAX(CASE WHEN rd.visit_sequence IS NOT NULL THEN r.day ELSE NULL END) as ultima_visita,
                SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN 1 ELSE 0 END) as visitas_con_venta,
                COUNT(*) as veces_planificado
            FROM public.route r
            JOIN public.route_detail rd ON rd.route_id = r.id
            LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
            WHERE r.day >= %s AND r.day <= %s
            {filtro_vendedor}
            GROUP BY rd.subject_code, rd.subject_name, rd.latitude, rd.longitude
            HAVING SUM(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 ELSE 0 END) = 0
               OR SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN 1 ELSE 0 END) = 0
            ORDER BY veces_planificado DESC
            LIMIT 2000
            """

            # Ejecutar con parámetros
            cursor.execute(consulta, tuple(params))
            rows = cursor.fetchall()

            resultado = []
            for r in rows:
                # Convertir coordenadas y normalizar
                lat = None
                lng = None
                try:
                    if r['latitude'] is not None and r['longitude'] is not None:
                        lat = float(str(r['latitude']).replace(',', '.'))
                        lng = float(str(r['longitude']).replace(',', '.'))
                except Exception:
                    lat = None
                    lng = None

                resultado.append({
                    'codigo': r['codigo'],
                    'nombre': r['nombre'],
                    'latitud': lat,
                    'longitud': lng,
                    'primera_planificacion': r['primera_planificacion'].strftime('%Y-%m-%d') if r['primera_planificacion'] else None,
                    'ultima_visita': r['ultima_visita'].strftime('%Y-%m-%d') if r['ultima_visita'] else None,
                    'visitas_con_venta': int(r['visitas_con_venta']) if r['visitas_con_venta'] is not None else 0,
                    'veces_planificado': int(r['veces_planificado']) if r['veces_planificado'] is not None else 0
                })

            cursor.close()
            connection.close()

            return {
                'fecha_inicio': fecha_inicio,
                'fecha_fin': fecha_fin,
                'count': len(resultado),
                'clientes': resultado
            }

        except Exception as e:
            print(f"Error en get_clientes_no_visitados: {e}")
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/vendedores")
def get_vendedores():
    """Lista de vendedores disponibles para filtros"""
    try:
        query = """
        SELECT DISTINCT 
            v.id,
            v.full_name as nombre,
            COUNT(DISTINCT r.id) as total_rutas
        FROM public.v_users v
        LEFT JOIN public.route r ON r.user_id = v.id AND r.creation_date >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY v.id, v.full_name
        ORDER BY v.full_name
        """

        resultados = execute_query(query)
        return [{"id": row['id'], "nombre": row['nombre'], "total_rutas": row['total_rutas']} for row in resultados]

    except Exception as e:
        print(f"Error en get_vendedores: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo vendedores: {str(e)}")


@app.get("/vendedores/ultima_ubicacion")
def get_vendedores_ultima_ubicacion(limit: Optional[int] = None, hours: int = 48):
    """Devuelve la última ubicación conocida por vendedor desde la tabla `tracking`.

    - Retorna una fila por `user_id` con la última `tracking_date` dentro de las últimas `hours` horas.
    - Parámetro opcional `limit` para devolver solo los primeros N registros (útil para debug).
    - Parámetro opcional `hours` para ajustar el umbral (por defecto 48).
    """
    try:
        connection = get_db_connection()
        cursor = connection.cursor(cursor_factory=RealDictCursor)

        # Usamos un INTERVAL dinámico basado en `hours` para filtrar registros recientes
        sql = f"""
        SELECT DISTINCT ON (t.user_id)
            t.user_id,
            v.full_name as user_full_name,
            t.latitude,
            t.longitude,
            t.location_time_millis,
            t.tracking_date,
            t.batery_level as battery_level,
            t.altitude,
            t.horizontal_accuracy,
            t.vertical_accuracy
        FROM public.tracking t
        LEFT JOIN public.v_users v ON v.id = t.user_id
        WHERE t.latitude IS NOT NULL
          AND t.longitude IS NOT NULL
          AND t.tracking_date >= NOW() - INTERVAL '{hours} hours'
        ORDER BY t.user_id, t.tracking_date DESC, t.location_time_millis DESC
        """

        if limit and isinstance(limit, int) and limit > 0:
            sql += f" LIMIT {int(limit)}"

        cursor.execute(sql)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            try:
                lat = float(r['latitude']) if r.get('latitude') is not None else None
                lng = float(r['longitude']) if r.get('longitude') is not None else None
            except Exception:
                lat = None
                lng = None

            tracking_date = r.get('tracking_date')
            if hasattr(tracking_date, 'strftime'):
                tracking_date = tracking_date.strftime('%Y-%m-%d %H:%M:%S')

            result.append({
                'user_id': r.get('user_id'),
                'user_full_name': r.get('user_full_name') or None,
                'latitude': lat,
                'longitude': lng,
                'location_time_millis': r.get('location_time_millis'),
                'tracking_date': tracking_date,
                'battery_level': float(r.get('battery_level')) if r.get('battery_level') is not None else None,
                'altitude': float(r.get('altitude')) if r.get('altitude') is not None else None,
                'horizontal_accuracy': float(r.get('horizontal_accuracy')) if r.get('horizontal_accuracy') is not None else None,
                'vertical_accuracy': float(r.get('vertical_accuracy')) if r.get('vertical_accuracy') is not None else None
            })

        cursor.close()
        connection.close()

        return {'count': len(result), 'rows': result}

    except Exception as e:
        print(f"Error en get_vendedores_ultima_ubicacion: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo última ubicación de vendedores: {str(e)}")

@app.get("/zonas")
def get_zonas():
    """Obtener zonas geográficas para visualización en mapa"""
    try:
        # Consulta para obtener zonas con estadísticas
        query_zonas = """
        SELECT DISTINCT
            r.group_id as zona_id,
            COUNT(DISTINCT r.id) as total_rutas,
            COUNT(DISTINCT rd.id) as total_clientes,
            COUNT(DISTINCT CASE WHEN rd.visit_sequence IS NOT NULL THEN rd.id END) as clientes_visitados,
            SUM(rd.invoice_amount) as ventas_totales,
            AVG(rd.latitude) as centro_lat,
            AVG(rd.longitude) as centro_lng
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        WHERE r.creation_date >= CURRENT_DATE - INTERVAL '30 days'
          AND r.group_id IS NOT NULL
          AND rd.latitude IS NOT NULL 
          AND rd.longitude IS NOT NULL
        GROUP BY r.group_id
        HAVING COUNT(DISTINCT r.id) > 0
        ORDER BY r.group_id
        """
        
        resultados = execute_query(query_zonas)
        
        zonas = []
        for row in resultados:
            zona = {
                "zona_id": row['zona_id'],
                "nombre": f"Zona {row['zona_id']}",
                "total_rutas": row['total_rutas'],
                "total_clientes": row['total_clientes'],
                "clientes_visitados": row['clientes_visitados'] or 0,
                "ventas_totales": float(row['ventas_totales'] or 0),
                "centro_lat": float(row['centro_lat'] or 0),
                "centro_lng": float(row['centro_lng'] or 0),
                "color": f"hsl({(row['zona_id'] * 137) % 360}, 70%, 50%)"  # Color único por zona
            }
            zonas.append(zona)
        
        return {
            "zonas": zonas,
            "total_zonas": len(zonas)
        }
        
    except Exception as e:
        print(f"Error en get_zonas: {e}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo zonas: {str(e)}")

@app.get("/clientes")
def get_clientes():
    """Lista de clientes para tabla (dummy data para compatibilidad)"""
    return [
        {"id": 1, "codigo": "CLI001", "nombre": "Cliente A", "ciudad": "Buenos Aires", "ventas_mes": 5000},
        {"id": 2, "codigo": "CLI002", "nombre": "Cliente B", "ciudad": "Córdoba", "ventas_mes": 3200},
        {"id": 3, "codigo": "CLI003", "nombre": "Cliente C", "ciudad": "Rosario", "ventas_mes": 4800},
        {"id": 4, "codigo": "CLI004", "nombre": "Cliente D", "ciudad": "La Plata", "ventas_mes": 2100}
    ]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)