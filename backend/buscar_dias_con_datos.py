#!/usr/bin/env python3
"""
Script para encontrar días con datos cerca de la fecha actual
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta

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
        return None

def main():
    """Función principal para encontrar días con datos"""
    
    connection = get_db_connection()
    if not connection:
        return
    
    try:
        cursor = connection.cursor(cursor_factory=RealDictCursor)
        
        # Buscar los últimos 10 días con datos
        consulta_ultimos_dias = """
        SELECT 
            r.day,
            COUNT(*) as rutas,
            COUNT(DISTINCT r.user_id) as vendedores,
            COUNT(DISTINCT rd.subject_code) as clientes_visitados,
            SUM(CASE WHEN rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END) as ventas_totales,
            EXTRACT(DOW FROM r.day) as dia_semana
        FROM public.route r
        JOIN public.route_detail rd ON rd.route_id = r.id
        WHERE rd.visit_sequence IS NOT NULL
        GROUP BY r.day
        ORDER BY r.day DESC
        LIMIT 15
        """
        
        cursor.execute(consulta_ultimos_dias)
        resultados = cursor.fetchall()
        
        print("🗓️  ÚLTIMOS DÍAS CON DATOS:")
        print("="*80)
        print(f"{'FECHA':<12} {'RUTAS':<8} {'VEND':<6} {'CLIENTES':<10} {'VENTAS':<15} {'DÍA SEMANA'}")
        print("-"*80)
        
        dias_semana = {0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado'}
        
        for row in resultados:
            fecha = row['day'].strftime('%Y-%m-%d')
            dia_sem = dias_semana.get(int(row['dia_semana']), 'Desconocido')
            ventas_formatted = f"₱{row['ventas_totales']:,.0f}" if row['ventas_totales'] else "₱0"
            
            print(f"{fecha:<12} {row['rutas']:<8} {row['vendedores']:<6} {row['clientes_visitados']:<10} {ventas_formatted:<15} {dia_sem}")
        
        # Encontrar el último día con datos (que no sea hoy)
        hoy = datetime.now().date()
        ultimo_dia_con_datos = None
        
        for row in resultados:
            if row['day'] < hoy and row['rutas'] > 0:
                ultimo_dia_con_datos = row['day']
                break
        
        if ultimo_dia_con_datos:
            print(f"\n✅ ÚLTIMO DÍA CON DATOS (para comparación): {ultimo_dia_con_datos}")
            
            # Obtener datos de ese día para comparación
            consulta_dia_comparacion = """
            SELECT 
                rzd.zone_code,
                COUNT(DISTINCT rd.subject_code) as clientes,
                SUM(CASE WHEN rd.visit_sequence IS NOT NULL AND rd.invoice_amount > 0 THEN rd.invoice_amount ELSE 0 END) as ventas
            FROM public.route r
            JOIN public.route_detail rd ON rd.route_id = r.id
            LEFT JOIN public.route_zone_detail rzd ON rzd.route_id = r.id
            WHERE r.day = %s
              AND rzd.zone_code IS NOT NULL
            GROUP BY rzd.zone_code
            ORDER BY ventas DESC
            LIMIT 5
            """
            
            cursor.execute(consulta_dia_comparacion, (ultimo_dia_con_datos,))
            zonas_comparacion = cursor.fetchall()
            
            print(f"\n📊 TOP 5 ZONAS EN {ultimo_dia_con_datos}:")
            print("-"*50)
            for zona in zonas_comparacion:
                ventas_f = f"₱{zona['ventas']:,.0f}" if zona['ventas'] else "₱0"
                print(f"  Zona {zona['zone_code']}: {zona['clientes']} clientes, {ventas_f}")
        else:
            print(f"\n❌ No se encontró ningún día anterior con datos para comparación")
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
    finally:
        connection.close()

if __name__ == "__main__":
    main()