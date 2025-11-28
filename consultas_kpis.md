# 📊 CONSULTAS SQL PARA KPIs DE RUTAS

## 🚛 KPIs OPERATIVOS

### 1. Cumplimiento de Rutas (Clientes visitados vs planificados)
```sql
-- Cumplimiento general
SELECT 
    COUNT(CASE WHEN rd.sequence IS NOT NULL THEN 1 END) as clientes_planificados,
    COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) as clientes_visitados,
    ROUND(
        (COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) * 100.0 / 
         COUNT(CASE WHEN rd.sequence IS NOT NULL THEN 1 END)), 2
    ) as porcentaje_cumplimiento
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
WHERE r.creation_date >= DATE '2025-07-01'
  AND r.creation_date < NOW();

-- Cumplimiento por vendedor
SELECT 
    r.user_id,
    v.full_name as vendedor,
    COUNT(CASE WHEN rd.sequence IS NOT NULL THEN 1 END) as clientes_planificados,
    COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) as clientes_visitados,
    ROUND(
        (COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) * 100.0 / 
         COUNT(CASE WHEN rd.sequence IS NOT NULL THEN 1 END)), 2
    ) as porcentaje_cumplimiento
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
JOIN public.v_users v ON v.id = r.user_id
WHERE r.creation_date >= DATE '2025-07-01'
GROUP BY r.user_id, v.full_name
ORDER BY porcentaje_cumplimiento DESC;
```

### 2. Clientes No Visitados
```sql
-- Clientes planificados pero no visitados
SELECT 
    r.user_id,
    v.full_name as vendedor,
    r.creation_date,
    rd.subject_name,
    rd.subject_code,
    rd.sequence,
    'No visitado' as estado
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
JOIN public.v_users v ON v.id = r.user_id
WHERE rd.sequence IS NOT NULL 
  AND rd.visit_sequence IS NULL
  AND r.creation_date >= DATE '2025-07-01'
ORDER BY r.creation_date DESC, rd.sequence;
```

### 3. Visitas No Planificadas (sequence >= 1000)
```sql
-- Visitas fuera de plan
SELECT 
    r.user_id,
    v.full_name as vendedor,
    r.creation_date,
    rd.subject_name,
    rd.subject_code,
    rd.sequence,
    rd.visit_sequence,
    'Visita no planificada' as estado
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
JOIN public.v_users v ON v.id = r.user_id
WHERE rd.sequence >= 1000
  AND r.creation_date >= DATE '2025-07-01'
ORDER BY r.creation_date DESC, rd.visit_sequence;
```

### 4. Eficiencia de Visitas (% visitas positivas)
```sql
-- Efectividad por vendedor
SELECT 
    r.user_id,
    v.full_name as vendedor,
    COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) as total_visitas,
    COUNT(CASE WHEN rd.visit_positive = true THEN 1 END) as visitas_positivas,
    ROUND(
        (COUNT(CASE WHEN rd.visit_positive = true THEN 1 END) * 100.0 / 
         COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END)), 2
    ) as porcentaje_efectividad
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
JOIN public.v_users v ON v.id = r.user_id
WHERE r.creation_date >= DATE '2025-07-01'
  AND rd.visit_sequence IS NOT NULL
GROUP BY r.user_id, v.full_name
ORDER BY porcentaje_efectividad DESC;
```

## 💰 KPIs COMERCIALES

### 5. Ventas por Vendedor
```sql
-- Rendimiento comercial por vendedor
SELECT 
    r.user_id,
    v.full_name as vendedor,
    COUNT(DISTINCT r.id) as rutas_realizadas,
    COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) as clientes_visitados,
    SUM(rd.invoice_amount) as ventas_totales,
    SUM(rd.order_amount) as pedidos_totales,
    ROUND(AVG(rd.invoice_amount), 2) as venta_promedio_por_cliente,
    ROUND(
        (SUM(rd.invoice_amount) * 100.0 / NULLIF(SUM(rd.order_amount), 0)), 2
    ) as conversion_pedido_factura
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
JOIN public.v_users v ON v.id = r.user_id
WHERE r.creation_date >= DATE '2025-07-01'
  AND rd.visit_sequence IS NOT NULL
GROUP BY r.user_id, v.full_name
ORDER BY ventas_totales DESC;
```

### 6. Tendencia de Ventas Semanal
```sql
-- Ventas por semana
SELECT 
    DATE_TRUNC('week', r.creation_date) as semana,
    SUM(rd.invoice_amount) as ventas,
    COUNT(DISTINCT r.user_id) as vendedores_activos,
    COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) as clientes_visitados
FROM public.route r
JOIN public.route_detail rd ON rd.route_id = r.id
WHERE r.creation_date >= DATE '2025-07-01'
GROUP BY DATE_TRUNC('week', r.creation_date)
ORDER BY semana DESC;
```

### 7. Cobertura de Clientes
```sql
-- Cobertura de clientes únicos por vendedor
SELECT 
    su.user_id,
    v.full_name as vendedor,
    COUNT(DISTINCT s.id) as clientes_asignados,
    COUNT(DISTINCT CASE WHEN rd.visit_sequence IS NOT NULL THEN s.id END) as clientes_visitados_unicos,
    ROUND(
        (COUNT(DISTINCT CASE WHEN rd.visit_sequence IS NOT NULL THEN s.id END) * 100.0 / 
         COUNT(DISTINCT s.id)), 2
    ) as porcentaje_cobertura
FROM subject s
INNER JOIN subject_user su ON s.id = su.subject_id
INNER JOIN v_users v ON v.id = su.user_id
LEFT JOIN route_detail rd ON rd.subject_code = s.code
LEFT JOIN route r ON r.id = rd.route_id AND r.user_id = su.user_id
WHERE r.creation_date >= DATE '2025-07-01' OR r.creation_date IS NULL
GROUP BY su.user_id, v.full_name
ORDER BY porcentaje_cobertura DESC;
```

## 🏆 RANKINGS

### 8. Ranking General de Vendedores
```sql
-- Ranking completo de vendedores
WITH vendedor_stats AS (
    SELECT 
        r.user_id,
        v.full_name as vendedor,
        -- KPIs Operativos
        COUNT(CASE WHEN rd.sequence IS NOT NULL THEN 1 END) as clientes_planificados,
        COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) as clientes_visitados,
        ROUND((COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END) * 100.0 / 
               COUNT(CASE WHEN rd.sequence IS NOT NULL THEN 1 END)), 2) as cumplimiento,
        COUNT(CASE WHEN rd.visit_positive = true THEN 1 END) as visitas_positivas,
        ROUND((COUNT(CASE WHEN rd.visit_positive = true THEN 1 END) * 100.0 / 
               COUNT(CASE WHEN rd.visit_sequence IS NOT NULL THEN 1 END)), 2) as efectividad,
        -- KPIs Comerciales
        SUM(rd.invoice_amount) as ventas_totales,
        ROUND(AVG(CASE WHEN rd.visit_sequence IS NOT NULL THEN rd.invoice_amount END), 2) as venta_promedio
    FROM public.route r
    JOIN public.route_detail rd ON rd.route_id = r.id
    JOIN public.v_users v ON v.id = r.user_id
    WHERE r.creation_date >= DATE '2025-07-01'
    GROUP BY r.user_id, v.full_name
)
SELECT 
    ROW_NUMBER() OVER (ORDER BY ventas_totales DESC) as ranking_ventas,
    ROW_NUMBER() OVER (ORDER BY cumplimiento DESC) as ranking_cumplimiento,
    ROW_NUMBER() OVER (ORDER BY efectividad DESC) as ranking_efectividad,
    vendedor,
    ventas_totales,
    cumplimiento,
    efectividad,
    clientes_visitados,
    venta_promedio
FROM vendedor_stats
ORDER BY ventas_totales DESC;
```

## 📝 NOTAS DE IMPLEMENTACIÓN

1. **Filtros de fecha**: Todas las consultas usan `r.creation_date >= DATE '2025-07-01'` - ajustar según necesidad
2. **Visitas no planificadas**: Se detectan con `rd.sequence >= 1000`
3. **Clientes no visitados**: `rd.sequence IS NOT NULL AND rd.visit_sequence IS NULL`
4. **Métricas calculadas**: Los porcentajes se calculan en tiempo real
5. **Performance**: Para grandes volúmenes, considerar vistas materializadas o tablas agregadas