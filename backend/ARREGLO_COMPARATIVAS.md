# ARREGLO PARA APLICAR AL main.py PRINCIPAL

# 1. Agregar esta función después de la línea 98:

def buscar_ultimo_dia_con_datos(fecha_actual: str, connection) -> str:
    """Busca el último día con datos disponible antes de la fecha actual"""
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT r.day
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        WHERE r.day < %s AND rd.visit_sequence IS NOT NULL
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
            fecha_dt = datetime.strptime(fecha_actual, '%Y-%m-%d')
            return (fecha_dt - timedelta(days=7)).strftime('%Y-%m-%d')
            
    except Exception as e:
        print(f"⚠️ Error buscando último día con datos: {e}")
        fecha_dt = datetime.strptime(fecha_actual, '%Y-%m-%d')
        return (fecha_dt - timedelta(days=7)).strftime('%Y-%m-%d')

# 2. Reemplazar la lógica de cálculo de fechas anteriores (alrededor de línea 1020):

# CAMBIAR ESTO:
if periodo == "dia" or diferencia_dias == 1:
    fecha_anterior_inicio = (inicio_dt - timedelta(days=1)).strftime('%Y-%m-%d')
    fecha_anterior_fin = (fin_dt - timedelta(days=1)).strftime('%Y-%m-%d')

# POR ESTO:
if periodo == "dia" or diferencia_dias == 1:
    fecha_anterior_inicio = buscar_ultimo_dia_con_datos(fecha_real_inicio, connection)
    fecha_anterior_fin = fecha_anterior_inicio
    print(f"🔍 Día específico: Comparando con último día con datos: {fecha_anterior_inicio}")

# 3. RESULTADO ESPERADO:
# - Las comparativas ya no aparecerán como 0
# - Se encontrará automáticamente el último día con datos
# - Los crecimientos se calcularán correctamente