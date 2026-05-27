# Changelog

Todos los cambios relevantes de OpenRoute se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y la numeración respeta [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Añadido

- **Despliegue con Docker**: `Dockerfile` para el microservicio FastAPI, `web/Dockerfile` multi-stage para Next.js con `output: standalone`, `docker-compose.yml` que orquesta los 4 servicios (optimizer + ollama + ollama-pull + web) con healthchecks y dependencias. `docker compose up --build` arranca todo desde cero.
- **`docker-entrypoint.sh`** del frontend: aplica migraciones Prisma y siembra usuarios demo en el primer arranque; preserva la DB en siguientes reinicios.
- **`.dockerignore`** en raíz y `web/` para mantener el build context pequeño.
- **Pre-sembrado de 2 rutas** en `prisma/seed.ts` para que la demo arranque con `/routes` poblado y el mapa Leaflet renderice polyline real sin pasar por el chat.
- **Botón "Importar al sistema"** en `/import` que persiste los pedidos del CSV en Prisma vía nuevo endpoint `POST /api/orders/import`, cerrando el flujo CSV → /orders → /chat sin tocar a mano la DB.

### Cambiado

- **Modelo LLM por defecto** pasa de `llama3.1:8b` (4.9 GB, lento en CPU sin GPU) a `llama3.2:3b` (2 GB, fiable). El `ollama-pull` deja `llama3.2:1b` descargado como alternativa rápida si el operador quiere experimentar, pero no es el activo (alucina datos y no respeta el protocolo de tool calling).
- **Parser tolerante de tool calls** ampliado para cubrir 7 esquemas distintos (los modelos pequeños no respetan el protocolo de Ollama y emiten variantes que el parser ahora reconoce sin perder la respuesta natural al usuario).
- **System prompt** del chatbot añade bloques de **invocación de herramientas** (usar siempre tool_calls estructurado) y **prohibido inventar datos** (responder vacío cuando no hay, no fabricar rutas/pedidos).

Trabajo en curso fuera del hito del hackathon. Ver [`docs/ROADMAP.md`](docs/ROADMAP.md).

## [0.2.0] — 2026-05-27 · Entrega del Hackathon IA Responsable y Abierta en Industria

Entrega oficial al hackathon Mayo'26 organizado por SEDIA + AESIA, con la colaboración del EDIH de Aragón (ITA + Universidad de Zaragoza). TRL objetivo: 5 (validación de componente en entorno relevante).

### Añadido

- **Microservicio FastAPI** (`app/main.py`) que expone el motor de optimización VRP por HTTP. Endpoints: `/health`, `/optimize`, `/baseline`, `/compare`, `/optimize-csv`.
- **Tool `optimize_with_ortools`** en el chatbot del frontend: delega al backend Python para resolver CVRPTW con time windows y capacidades reales, y devuelve el plan + baseline + ahorros + pedidos diferidos.
- **Pantalla `/import`** en el frontend: dropzone para subir uno o varios CSVs y obtener el plan optimizado sin tocar la base de datos. Incluye análisis combinado entre archivos (consolidación de turnos/clientes/días).
- **Cliente OSRM `/table`** (`src/osrm_client.py`) para construir la matriz de distancias usando callejero real, con fallback automático a Haversine × factor urbano si OSRM no responde. Selector `auto | OSRM | Haversine` en `/import`.
- **Bounding box configurable** (`OPENROUTE_BBOX`, argumento `bbox=` y selector en `/import`): por defecto Alicante/Elche, pero cualquier pyme puede operar en su propia zona o sin restricción geográfica sin cambiar código.
- **DISJUNCTIONS en OR-Tools** para tolerar datasets infactibles: el solver entrega lo que cabe y reporta los pedidos diferidos en lugar de fallar y caer a la heurística.
- **Baseline manual realista** en `metrics.py`: el simulador del plan humano agrupa por zona y ordena por urgencia de ventana, en lugar de un `idx % num_vehicles` artificialmente malo. El ahorro medido refleja el valor real del software.
- **Aviso de fallback en el chatbot**: cuando OR-Tools cae a la heurística por restricciones imposibles, el tool devuelve `used_fallback=true` y el system prompt obliga al modelo a avisarlo explícitamente. IA responsable.
- **Suite de tests** del motor (`src/test_optimizer.py`): 22 tests cubriendo schema, capacidad, ventanas horarias, OSRM fallback, bbox, y end-to-end con 30 segundos de presupuesto del solver.
- **CI con GitHub Actions** (`.github/workflows/web-ci.yml`): lint + typecheck + build del frontend Next.js en cada PR.
- **Cliente Ollama propio en Python** (`src/ai_assistant.py`) usando el mismo modelo `llama3.1:8b` que el chatbot del frontend — sistema con un único LLM open source.
- **Atajo `start.ps1`** en la raíz para arrancar FastAPI + Next.js en Windows.
- **CODE_OF_CONDUCT.md** (Contributor Covenant) y **CONTRIBUTING.md**.
- **SECURITY.md** con política de divulgación responsable.

### Cambiado

- **Stack del backend reescrito** de Streamlit a FastAPI: el componente Python deja de ser una UI monolítica y se convierte en un microservicio HTTP reutilizable por cualquier cliente (no solo el frontend).
- **Capacidades de la flota** ampliadas en `data/vehiculos_config.json` para que el dataset por defecto sea factible. Jornada operativa extendida a 06:00–20:00.
- **Validación de pedidos** en `data_processor.py`: descarta silenciosamente los que estén fuera del bbox configurado en lugar de fallar duro; reporta la cuenta para que la UI muestre "X pedidos descartados".

### Corregido

- **Tipado TypeScript** del proxy `/api/optimize-csv` y `python-optimizer.ts` alineado con el response real del backend.
- **Hardening del frontend** previo a la demo: fallback del XAI, auth endurecida y wiring correcto de la flota.

### Seguridad

- JWT en cookie `httpOnly` con `sameSite=lax`.
- Validación de entrada con `zod` en todos los endpoints del frontend y con Pydantic en el backend.
- Documentadas las contraseñas demo (`admin/admin123`, …) como tales — deben rotarse antes de cualquier despliegue real.

---

## Notas sobre versiones anteriores

El repo nace con el hackathon, sin releases previas. Los commits anteriores a este changelog reflejan el desarrollo iterativo del MVP y se pueden ver con `git log --oneline`.
