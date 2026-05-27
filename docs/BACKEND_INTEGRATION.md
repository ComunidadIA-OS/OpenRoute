# Guía de integración del backend OpenRoute

Este documento describe cómo consumir el **motor logístico de OpenRoute**
(`src/optimizer.py`, `src/data_processor.py`, `src/metrics.py`,
`src/ai_assistant.py`) desde otra aplicación: panel Streamlit del gestor de
flota, microservicio FastAPI para el frontend conversacional, o cualquier
otro componente Python.

> Diseño y autoría del motor: **Samuel Parra**. Guía dirigida en su origen
> a **Giulian Peterlecean** (Streamlit) y posteriormente extendida para la
> integración con el frontend Next.js.

---

## 📁 Arquitectura de archivos core

- `data/pedidos_ejemplo.csv` — Dataset estático de 30 entregas simuladas
  distribuidas en Elche y Alicante.
- `data/vehiculos_config.json` — Configuración de capacidades de flota y
  tipos de vehículos (Diésel/Eléctrico/Apoyo).
- `src/data_processor.py` — Carga y limpieza de datos, y cálculo de
  matrices de distancia/tiempo. Por defecto consulta **OSRM `/table`**
  para obtener tiempos y distancias reales por calle; si OSRM no
  responde (sin red, rate-limit, servicio caído) cae a una matriz
  Haversine × 1.3 como fallback determinista. El llamador puede
  forzar uno u otro vía `use_osrm=True|False`.
- `src/osrm_client.py` — Cliente `/table` con caché en memoria por
  hash de coordenadas. Mismo patrón que el cliente TS de
  `web/src/lib/osrm.ts`. Se desactiva globalmente con la env var
  `OPENROUTE_DISABLE_OSRM=1` (útil en CI sin red).
- `src/optimizer.py` — Resolvedores duales con patrón Strategy:
  - **Heurística Propia**: clustering geográfico + Vecino Más Cercano
    Ponderado por prioridad.
  - **Google OR-Tools**: solver industrial CVRPTW (Capacitated VRP +
    Time Windows). Cae a la heurística si OR-Tools no encuentra
    solución factible.
- `src/metrics.py` — Simulación de reparto manual (baseline) con tres
  heurísticas reales del conductor humano, y cálculo de métricas
  financieras (€) y ecológicas (CO2).
- `src/ai_assistant.py` — Generador de informes y explicaciones en
  lenguaje natural mediante **Ollama local** (LLM open source) o motor
  de plantillas heurísticas locales como fallback.

---

## 🔌 Integración en 3 pasos

### 1. Cargar datos y generar matriz geográfica

```python
from src.data_processor import DataProcessor

processor = DataProcessor()

# Cargar archivos estándar
orders_df = processor.load_orders("data/pedidos_ejemplo.csv")
vehicles_df = processor.load_vehicles("data/vehiculos_config.json")

# Agregar parada manual ingresada desde una interfaz
orders_df = processor.add_manual_order(
    orders_df,
    id_pedido="PED-MAN",
    cliente="Clínica Elche",
    direccion="Avenida Libertad 10",
    lat=38.2650,
    lon=-0.7020,
    prioridad=3,
    peso_kg=45.0,
    franja_inicio="10:00",
    franja_fin="14:00",
)

# Generar matrices a partir del depósito de flota (índice 0)
depot_lat = vehicles_df.loc[0, 'deposito_lat']
depot_lon = vehicles_df.loc[0, 'deposito_lon']
dist_matrix, time_matrix = processor.build_distance_matrix(
    depot_lat, depot_lon, orders_df
)
```

### 2. Ejecutar la optimización y el plan manual (baseline)

```python
from src.optimizer import RouteOptimizerFactory
from src.metrics import MetricsEngine

# Simular plan manual (baseline de comparación)
metrics = MetricsEngine()
manual_res = metrics.simulate_manual_baseline(
    orders_df, vehicles_df, dist_matrix, time_matrix
)

# Resolver con el motor seleccionado: "ortools" o "heuristic"
optimizer = RouteOptimizerFactory.get_optimizer(mode="heuristic")
optimized_res = optimizer.optimize(
    orders_df, vehicles_df, dist_matrix, time_matrix
)

# Obtener el cuadro de ahorros comparativos
savings = metrics.compare_plans(manual_res, optimized_res)
```

### 3. Generar el informe explicativo en lenguaje natural

El asistente IA usa **Ollama local** (`llama3.1:8b`) por defecto. Si Ollama
no está disponible, cae automáticamente al motor de plantillas
heurísticas locales sin necesidad de intervención del cliente.

```python
from src.ai_assistant import AIAssistant

# Configuración por defecto: localhost:11434 + llama3.1:8b
ai = AIAssistant()

# Personalización opcional vía argumentos o variables de entorno
# (OLLAMA_BASE_URL, OLLAMA_MODEL):
# ai = AIAssistant(base_url="http://otra-maquina:11434", model="qwen2.5:7b")

report_markdown = ai.generate_explanation(optimized_res, savings)
```

**Requisito**: tener Ollama instalado y el modelo descargado.

```bash
ollama pull llama3.1:8b
ollama serve   # arranca el daemon (en Windows ya arranca como servicio)
```

---

## 🧪 Pruebas y validación

```bash
# Suite de pruebas unitarias matemáticas
python src/test_optimizer.py

# Test end-to-end con reporte comparativo en pantalla
python src/test_run.py
```

---

## 📦 Esquema de salida unificado

Ambos resolvedores (`heuristic` y `ortools`) devuelven el mismo formato
JSON para que el consumidor no necesite saber qué motor lo generó:

```python
{
    'tipo_planificacion': str,         # "Heurística Propia" | "Google OR-Tools"
    'vehiculos_activos': int,
    'distancia_total_km': float,
    'tiempo_total_horas': float,
    'coste_total_euros': float,
    'co2_total_kg': float,
    'pedidos_retrasados': int,
    'incidentes_sobrecarga': int,
    'rutas': [
        {
            'id_vehiculo': str,
            'nombre_vehiculo': str,
            'distancia_km': float,
            'coste_euros': float,
            'co2_emissions_kg': float,
            'carga_total_kg': float,
            'detalle_paradas': [
                {
                    'id_pedido': str,
                    'cliente': str,
                    'prioridad': int,
                    'peso_kg': float,
                    'hora_llegada': str,    # "HH:MM"
                    'ventana': str,         # "HH:MM-HH:MM"
                    'retrasado': bool,
                },
                # ...
            ],
        },
        # ...
    ],
}
```

Cumple el contrato verificado por `test_heuristic_optimizer_stability` en
`src/test_optimizer.py`.

---

## 🔮 Próximos pasos de integración (roadmap)

- **Microservicio FastAPI**: envolver `RouteOptimizerFactory` y `AIAssistant`
  en una API HTTP que el frontend Next.js pueda consumir como tool del
  chatbot (`optimize_with_ortools`).
- **Endpoint streaming**: para optimizaciones largas, emitir progreso en
  tiempo real al frontend.
- **Persistencia de resultados**: guardar `optimized_res` en la base del
  frontend para que aparezcan en la pantalla de rutas sin tener que
  re-ejecutar.

Ver [`ROADMAP.md`](ROADMAP.md) para más detalle.
