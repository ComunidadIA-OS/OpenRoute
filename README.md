# Entorno de Desarrollo Avanzado - Ciencia de Datos e IA

## Perfil del Usuario
- **Estudiante:** 2º Año de Grado en Ciencia de Datos e Inteligencia Artificial (UMH).
- **Enfoque Principal:** Modelado predictivo, Machine Learning, Estadística Computacional y Estructuras de Datos.

## Especificaciones del Sistema
- **Hardware:** Apple Silicon (Chip M5) con 24 GB de RAM unificada.
- **Sistema Operativo:** macOS (Rendimiento optimizado para arquitectura ARM64).

## Rutas Estrictas de Entorno
- **Python Executable:** `/Users/samuelparraechague/.pyenv/versions/3.12.9/bin/python`
- **R Environment:** Configurado vía Homebrew (última versión estable).
- **Java JDK:** OpenJDK alojado en `/opt/homebrew/opt/openjdk`.

## Estructura de Trabajo
1. `~/Developer/1_UMH/` -> Proyectos, prácticas, scripts y entregables académicos de la universidad.
2. `~/Developer/2_Projects/` -> Desarrollo de utilidades, herramientas propias y automatizaciones.
3. `~/Developer/3_Workspace_Cloudecode/skills/` -> Scripts modulares reutilizables y funciones core.

---

# 🚀 OpenRoutePyME - Backend, Algoritmo y Datos

Esta sección contiene la guía de integración del motor logístico diseñado y programado por **Samuel Parra** para que **Giulian Peterlecean** pueda acoplarlo directamente al panel de visualización Streamlit.

## 📁 Arquitectura de Archivos Core
- `data/pedidos_ejemplo.csv`: Dataset estático de 30 entregas simuladas distribuidas en Elche y Alicante.
- `data/vehiculos_config.json`: Configuración de capacidades de flota y tipos de vehículos (Diésel/Eléctrico).
- `src/data_processor.py`: Carga y limpieza de datos, y cálculo de matrices de distancia/tiempo (Haversine/Manhattan).
- `src/optimizer.py`: Resolvedores duales. Implementa una **Heurística Propia** académica de Clustering + Vecino Más Cercano Ponderado y el resolvedor industrial **Google OR-Tools** (CVRPTW).
- `src/metrics.py`: Simulación de reparto manual (baseline de control) y cálculo de métricas financieras (€) y ecológicas (CO2).
- `src/ai_assistant.py`: Generador de informes y explicaciones en lenguaje natural mediante IA de Gemini o motor de reglas local.

## 🔌 Guía de Integración Rápida para Streamlit (Giulian)

### 1. Cargar Datos y Generar Matriz Geográfica
```python
from src.data_processor import DataProcessor

processor = DataProcessor()

# Cargar archivos estándar
orders_df = processor.load_orders("data/pedidos_ejemplo.csv")
vehicles_df = processor.load_vehicles("data/vehiculos_config.json")

# Agregar parada manual ingresada desde la interfaz
orders_df = processor.add_manual_order(
    orders_df, 
    id_pedido="PED-MAN", cliente="Clínica Elche", 
    direccion="Avenida Libertad 10", lat=38.2650, lon=-0.7020, 
    prioridad=3, peso_kg=45.0, franja_inicio="10:00", franja_fin="14:00"
)

# Generar matrices a partir del depósito de flota (índice 0)
depot_lat = vehicles_df.loc[0, 'deposito_lat']
depot_lon = vehicles_df.loc[0, 'deposito_lon']
dist_matrix, time_matrix = processor.build_distance_matrix(depot_lat, depot_lon, orders_df)
```

### 2. Ejecutar la Optimización y el Plan Manual (Baseline)
```python
from src.optimizer import RouteOptimizerFactory
from src.metrics import MetricsEngine

# Simular Plan Manual (para comparación de ahorro)
metrics = MetricsEngine()
manual_res = metrics.simulate_manual_baseline(orders_df, vehicles_df, dist_matrix, time_matrix)

# Resolver usando el Motor Seleccionado (Heurística o OR-Tools)
# mode = "ortools" o "heuristic"
optimizer = RouteOptimizerFactory.get_optimizer(mode="heuristic")
optimized_res = optimizer.optimize(orders_df, vehicles_df, dist_matrix, time_matrix)

# Obtener Cuadro de Ahorros Comparativos
savings = metrics.compare_plans(manual_res, optimized_res)
```

### 3. Generar el Informe Explicativo de IA
```python
from src.ai_assistant import AIAssistant

# Genera el reporte. Si no hay API key de Gemini, usa el motor de reglas local sin fallar.
ai = AIAssistant(api_key=None) 
report_markdown = ai.generate_explanation(optimized_res, savings)
```

## 🧪 Pruebas y Validación
Para verificar que todo el motor funciona de manera óptima localmente, ejecuta:
```bash
# Ejecutar suite de pruebas unitarias matematicas
python src/test_optimizer.py

# Ejecutar test de extremo a extremo con reporte comparativo en pantalla
python src/test_run.py
```

