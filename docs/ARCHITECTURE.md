# Arquitectura de OpenRoute

OpenRoute combina **dos componentes complementarios e integrados por HTTP** para ofrecer una solución de optimización logística accesible para PYMEs:

```
┌──────────────────────────────────────────────────────────────┐
│            MICROSERVICIO DE OPTIMIZACIÓN (raíz)              │
│  FastAPI (:8000) · pandas · OR-Tools (CVRPTW) · OSRM /table  │
│  CSV/JSON in → rutas con restricciones → métricas + XAI      │
└──────────────────────────────────────────────────────────────┘
                              ↕ HTTP (/compare, /optimize-csv)
┌──────────────────────────────────────────────────────────────┐
│              FRONTEND CONVERSACIONAL (web/)                  │
│  Next.js 14 · Prisma+SQLite · Leaflet · OSRM · Ollama LLM    │
│  Chatbot en español como centro de comandos                  │
└──────────────────────────────────────────────────────────────┘
```

Ambos componentes pueden ejecutarse de forma **independiente** (el motor Python aporta valor sólo con CSV + curl) o **integrados** (el chatbot del frontend delega VRP complejos vía el tool `optimize_with_ortools`, y la pantalla `/import` permite subir CSVs sin tocar la DB del frontend).

---

## Componente 1: Microservicio de optimización (Python)

**Carpeta**: raíz del repo (`app/main.py` para FastAPI, `src/` para la lógica, `data/` con dataset de ejemplo).

**Stack**:
- **FastAPI + uvicorn** — microservicio HTTP en `:8000` con endpoints `/health`, `/optimize`, `/baseline`, `/compare` y `/optimize-csv`.
- **pandas / NumPy** — limpieza y validación de pedidos, construcción de matrices.
- **Google OR-Tools** — solver CVRPTW con time windows, capacidades, prioridades y DISJUNCTIONS para diferir pedidos infactibles.
- **OSRM `/table`** — matriz real de distancias por callejero; fallback automático a Haversine × factor urbano si OSRM no responde (cliente en `src/osrm_client.py`).
- **Ollama** — generación de informes XAI en lenguaje natural (`src/ai_assistant.py`); mismo modelo y endpoint que usa el chatbot del frontend.

**Flujo**:
1. El cliente (frontend Next.js o `curl`) envía pedidos + vehículos al endpoint que corresponda.
2. `data_processor.py` valida, recorta por bbox configurable y construye matrices OSRM/Haversine.
3. `optimizer.py` resuelve el VRP con OR-Tools (o cae a heurística marcando `used_fallback=true`).
4. `metrics.py` simula un baseline manual realista (zona + urgencia de ventana) y devuelve el cuadro de ahorros.
5. `ai_assistant.py` opcionalmente explica por qué el solver agrupó ciertas paradas.
6. El response sale como JSON con plan + baseline + ahorros + pedidos diferidos.

**Fortalezas**: VRP serio con restricciones reales, matriz real por calles, baseline humano honesto (no caricaturizado), pedidos infactibles reportados explícitamente, todo cubierto por 22 tests en `src/test_optimizer.py`.

---

## Componente 2: Frontend conversacional (web/)

**Carpeta**: `web/`.

**Filosofía**: **el LLM es la UI principal**, no un chatbot añadido. Cualquier acción (CRUD pedidos, optimizar, asignar conductor, reportar incidencias) se puede iniciar con lenguaje natural. La UI tradicional existe como visualización, no como obstáculo.

### Diagrama de componentes (web/)

```
┌──────────────────────────────────────────────────────────────┐
│                       NAVEGADOR                              │
│  /login   /orders   /chat   /routes   /routes/[id]           │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼─────────────────────────────────────┐
│                    NEXT.JS (App Router, :3000)               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  Server Comps  │  │  API Routes    │  │   Middleware   │  │
│  │  (tabla, mapa) │  │  (CRUD + chat) │  │   (JWT)        │  │
│  └────────┬───────┘  └────┬──────┬────┘  └────────────────┘  │
│           │               │      │                            │
│  ┌────────▼───────────────▼──┐  ┌▼───────────────────────┐   │
│  │     Prisma (SQLite)       │  │   lib/chat/runner.ts   │   │
│  │     dev.db                │  │   Tool-calling loop    │   │
│  └───────────────────────────┘  └────┬───────────────────┘   │
│                                       │                       │
│                    ┌──────────────────▼─────────┐             │
│                    │  TOOL HANDLERS (13 tools)  │             │
│                    │  → list_orders             │             │
│                    │  → suggest_routes          │             │
│                    │  → assign_route            │             │
│                    │  → reschedule_route ⭐     │             │
│                    │  → ...                     │             │
│                    └────┬──────────┬────────┬───┘             │
└─────────────────────────┼──────────┼────────┼─────────────────┘
                          │          │        │
              ┌───────────▼──┐  ┌────▼────┐  ┌▼──────────────┐
              │ OLLAMA       │  │ OSRM    │  │ NOMINATIM     │
              │ llama3.1:8b  │  │ /trip   │  │ /search       │
              │ :11434       │  │ /route  │  │ (geocoding)   │
              └──────────────┘  └─────────┘  └───────────────┘
```

### Decisiones de diseño

**Next.js 14 App Router + microservicio Python en paralelo**: la lógica conversacional, persistencia y mapa viven en `web/`; el VRP industrial vive en `app/` + `src/`. Se hablan por HTTP, lo que mantiene cada componente desplegable y auditable por separado. El tool `optimize_with_ortools` del chatbot y la pantalla `/import` son los dos puntos de integración hoy.

**SQLite + Prisma 6**: cero configuración para demo. La migración a PostgreSQL es solo un cambio de `DATABASE_URL` (Prisma soporta ambos).

**Ollama + llama3.1:8b en lugar de API en la nube**:
- **Privacidad**: los datos de pedidos no salen de la máquina del usuario.
- **Coste**: cero por consulta una vez descargado el modelo (~5GB).
- **Tool calling nativo**: llama3.1:8b soporta function calling sin trucos.
- **Trade-off conocido**: ocasionalmente emite los tool calls como JSON en texto en lugar de usar el campo `tool_calls`. Solucionado con `lib/chat/parse-tool-calls.ts` (parser tolerante).

**Leaflet + OSRM público**: gratis, sin API key, sin lock-in. OSRM `/trip` resuelve TSP simple - suficiente para 10-15 paradas. Para casos VRP con time windows estrictas, el roadmap contempla delegar al backend Python con OR-Tools.

### Estructura de carpetas (web/)

```
web/
├── prisma/
│   ├── schema.prisma             ← Modelo de datos canónico
│   ├── seed.ts                   ← Inserta 47 pedidos + usuarios demo
│   └── seed-data.ts              ← Direcciones reales pre-geocodificadas
├── public/
│   └── logo.svg
└── src/
    ├── app/
    │   ├── api/                  ← Endpoints REST
    │   │   ├── auth/             ← login, logout, me
    │   │   ├── chat/             ← POST: ejecuta el runner del chatbot
    │   │   ├── optimize/         ← POST: devuelve 3 opciones de ruta
    │   │   ├── orders/           ← CRUD pedidos
    │   │   ├── routes/           ← CRUD rutas + marcar paradas
    │   │   ├── incidents/        ← Registrar averías/incidencias
    │   │   ├── users/            ← Listar conductores
    │   │   └── vehicles/
    │   ├── (dashboard)/          ← Grupo con sidebar + auth guard
    │   │   ├── orders/page.tsx   ← Tabla de pedidos
    │   │   ├── chat/page.tsx     ← Centro de comandos LLM
    │   │   └── routes/
    │   │       ├── page.tsx      ← Lista de rutas
    │   │       └── [id]/page.tsx ← Mapa Leaflet + panel
    │   ├── login/page.tsx
    │   ├── layout.tsx
    │   ├── icon.svg              ← Favicon (Next.js auto)
    │   └── globals.css           ← Tailwind + estilos Leaflet markers
    ├── components/
    │   ├── chat/                 ← ChatWindow, MessageBubble
    │   ├── map/RouteMap.tsx      ← Leaflet (client-only, dynamic import)
    │   ├── orders/               ← OrdersTable, OrderFormDialog, Badge
    │   ├── routes/RouteDetailClient.tsx
    │   ├── shared/Sidebar.tsx
    │   └── ui/                   ← shadcn/ui primitives
    ├── lib/
    │   ├── prisma.ts             ← Cliente singleton
    │   ├── auth.ts               ← JWT, cookies, sesión
    │   ├── ollama-client.ts      ← Wrapper sobre /api/chat de Ollama
    │   ├── osrm.ts               ← /route + /trip con caché en memoria
    │   ├── nominatim.ts          ← Geocoding con caché en DB
    │   ├── optimize.ts           ← suggestRoutes() + rescheduleRoute()
    │   ├── format.ts             ← Helpers de formato es-ES
    │   └── chat/
    │       ├── tools.ts          ← Definición JSONSchema de 13 tools
    │       ├── tool-handlers.ts  ← Implementación de cada tool
    │       ├── runner.ts         ← Loop tool-calling (máx 5 iter)
    │       ├── parse-tool-calls.ts ← Parser tolerante de tool calls inline
    │       └── system-prompt.ts  ← Prompt en español con reglas
    └── middleware.ts             ← Protege rutas privadas
```

### Modelo de datos (web/prisma/schema.prisma)

- **User** (id, username, passwordHash, fullName, role, vehicleId?)
- **Vehicle** (plate, capacityKg, capacityVol, available)
- **Customer** (name, phone, email)
- **Order** — entidad central. Estado: `PENDING | DISPATCHED | IN_TRANSIT | DELIVERED | FAILED | RESCHEDULED`. Coords `lat/lng` se cachean para no re-geocodificar.
- **Route** — una ruta planificada. Guarda `polyline` (formato polyline6 de OSRM) ya decodificado para evitar re-llamar a OSRM al refrescar la página.
- **RouteStop** — paradas en orden con `sequence`, `etaPlanned`, `status`.
- **Incident** — averías y otros eventos.
- **ChatSession + ChatMessage** — auditoría completa de cada turno. Permite reproducir conversaciones y debuggear el LLM.
- **GeocodeCache** — caché persistente de Nominatim para no exceder el rate limit (1 req/s).

### Flujo de la demo "wow": auto-gestión de averías

**Conductor escribe en el chat:** *"Mi furgo se ha averiado, 60 minutos"*

1. `POST /api/chat` recibe el mensaje. Crea/recupera `ChatSession` del usuario.
2. `lib/chat/runner.ts` carga el historial y lo manda a Ollama con la lista de `tools`.
3. Ollama responde con `tool_calls: [{ name: "reschedule_route", arguments: { routeCode, delayMinutes: 60 }}]`.
4. El runner ejecuta el handler `reschedule_route`:
   - Carga las paradas pendientes de la ruta desde Prisma.
   - Llama a `lib/optimize.rescheduleRoute()`.
   - Calcula la nueva posición de partida (última parada entregada o depósito) + delay.
   - Pide a OSRM `/trip` un nuevo orden óptimo.
   - Para cada parada, calcula ETA acumulada. Si ETA supera `windowEnd`, la marca como diferida a mañana.
   - Persiste: `RouteStop.sequence`/`etaPlanned` actualizados, Orders diferidas → `RESCHEDULED` + nueva fecha, polyline actualizada, `Incident` de tipo `VEHICLE_BREAKDOWN`.
5. El handler devuelve un resumen compacto. El runner lo añade como mensaje `tool`.
6. Ollama recibe el resultado, redacta una respuesta natural: *"Ruta RT-... reoptimizada. Estas son las nuevas paradas..."*.
7. La UI muestra la respuesta + un atajo a `/routes/[id]` con la nueva polyline.

### Sistema de tool calling del chatbot

15 tools definidos en `lib/chat/tools.ts`:

| Tool | Propósito |
|---|---|
| `current_time` | Hora actual ISO (los LLMs locales alucinan fechas). |
| `list_orders` | Query Prisma con filtros. |
| `get_order`, `update_order` | Lectura/escritura de pedidos individuales. |
| `list_vehicles`, `list_drivers` | Inventario. |
| `suggest_routes` | Llama a `optimize.suggestRoutes()` → devuelve 3 opciones (Centro, Playa, Completa). |
| `assign_route` | Persiste una opción como Route real, asigna conductor + furgoneta. |
| `optimize_with_ortools` | ⭐ Delega al microservicio FastAPI para resolver CVRPTW con OR-Tools. Devuelve plan + baseline + ahorros + pedidos diferidos. |
| `list_routes`, `get_route` | Lectura. |
| `mark_stop_delivered` | Actualiza estado de parada. |
| `report_incident` | Registra incidencia. |
| `reschedule_route` | Re-optimiza tras avería. |

### Seguridad (nivel demo, no producción)

- JWT firmado con `JWT_SECRET` de entorno, en cookie `httpOnly` `sameSite=lax`.
- Middleware `web/src/middleware.ts` redirige a `/login` toda petición sin sesión salvo `/api/auth/login`.
- Passwords con bcrypt (8 rounds — bajo para velocidad de seed, subir a 12+ en producción).
- Validación de inputs con `zod` en todos los endpoints.

**Para producción** habría que: rotar `JWT_SECRET`, usar HTTPS, subir `bcrypt rounds`, añadir rate limiting al endpoint de login, y considerar OAuth.

---

## Integración Python ↔ web/ (estado actual)

Ya está implementada y operativa:

1. ✅ Optimizador Python expuesto como microservicio HTTP (FastAPI en `app/main.py`, puerto 8000).
2. ✅ Tool `optimize_with_ortools` añadido al chatbot — delega al backend cuando el usuario pide planificación industrial con time windows o capacidades.
3. ✅ Pantalla `/import` para que la pyme suba sus propios CSVs sin tocar la DB del frontend (caso de uso TRL5).
4. ✅ El chatbot avisa explícitamente cuando OR-Tools cae a la heurística (`used_fallback=true`) y lista los `pedidos_diferidos` que las DISJUNCTIONS descartaron por infactibilidad — IA responsable.

OSRM `/trip` se mantiene como motor TSP rápido para ≤10 paradas; OR-Tools cubre el resto (>10 paradas, time windows estrictas, capacidades reales).

---

## Decisiones que no escalan (deuda técnica conocida)

1. **`lastSuggestions` en memoria por sesión** (`web/src/lib/chat/tool-handlers.ts`): el cache de opciones devueltas por `suggest_routes` vive en un `Map` del proceso. Si el servidor se reinicia o hay varios procesos, se pierde. Mover a Redis o a la propia DB.
2. **Prisma `Order` no tiene campo `priority`**: hoy todos los pedidos llegan al solver con urgencia media (2). El esquema ya soporta time windows y peso; pendiente añadir `priority` y propagarlo (`web/src/lib/python-optimizer.ts` lo marca como TODO).
3. **OSRM público se queda en ~100 puntos por petición**: matrices más grandes necesitan partición o auto-hospedaje OSRM. El cliente actual (`src/osrm_client.py`) detecta y propaga el error; el fallback Haversine sigue siendo válido.
4. **Sin tests E2E del frontend**: el backend Python tiene 22 tests unitarios (`src/test_optimizer.py`), pero la UI Next.js solo tiene lint + build en CI. Pendiente añadir Vitest + Playwright.
5. **Sin i18n**: textos hardcodeados en español. Si entra mercado internacional, extraer a `next-intl` o similar.

Ver más en [ROADMAP.md](ROADMAP.md).
