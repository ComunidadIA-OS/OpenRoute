# Arquitectura

OpenRoute es una app de Electron con tres capas y un núcleo sin dependencias de plataforma.

```
┌──────────────────────── renderer (React) ────────────────────────┐
│ Chat · Mapa (MapLibre) · Pedidos · Flota · Ajustes               │
└───────────────▲──────────────────────────────┬───────────────────┘
                │ estado completo              │ window.openroute.*
                │ y eventos del chat           ▼ (preload, contextBridge)
┌────────────────────────── main (Node) ───────────────────────────┐
│ ipc.ts → planner.ts → core/solver.ts, core/baseline.ts           │
│        → ai/agent.ts → ai/providers.ts → Claude, OpenAI, Gemini… │
│        → services/routing.ts (OSRM) · services/geocode.ts (OSM)  │
│        → store.ts (JSON local + claves cifradas) · export.ts     │
└──────────────────────────────────────────────────────────────────┘
```

## Núcleo (`src/core`)

TypeScript puro: tipos, horas, distancias, motor de rutas, plan manual, importación de CSV y Excel, y enlaces de Google Maps. No importa nada de Electron ni del navegador, así que se prueba con Vitest y se podría reutilizar en un servidor.

## Proceso principal (`src/main`)

- **`store.ts`**: el estado vive en `openroute.json` dentro de la carpeta de datos del usuario (`%APPDATA%/OpenRoute` en Windows). Se guarda con un pequeño retardo y escritura atómica. Las claves de API se cifran con `safeStorage` y nunca viajan a la interfaz: la interfaz solo sabe si hay clave o no.
- **`planner.ts`**: geocodifica lo que falte, pide la matriz a OSRM (en bloques de 100 puntos), resuelve, calcula el plan manual de referencia y trae los trazados por calles. También mueve pedidos a mano.
- **`ai/providers.ts`**: crea el modelo con el [AI SDK](https://ai-sdk.dev) según el proveedor elegido y pide la lista de modelos a cada proveedor.
- **`ai/agent.ts`**: el agente planificador. Usa `streamText` con herramientas y un máximo de 10 pasos. Las herramientas leen y cambian el estado de la app; el texto y las llamadas se envían a la interfaz en tiempo real.
- **`export.ts`**: hojas de ruta en PDF (una página por vehículo, con `printToPDF`) y el plan en CSV.
- **`index.ts`**: la ventana y el protocolo `app://`. La interfaz no se carga con `file://`, para que los workers del mapa funcionen y la CSP tenga un origen propio.

## Interfaz (`src/renderer`)

React 19, Tailwind 4 y Zustand. El proceso principal manda el estado completo tras cada cambio (es pequeño) y los fragmentos del chat como eventos. El mapa usa MapLibre con el estilo oscuro de OpenFreeMap, retocado con los colores de la marca.

## Seguridad

- `contextIsolation` activado, sin `nodeIntegration` y con una CSP estricta: los scripts solo pueden venir de la propia app.
- La interfaz no puede abrir URLs que no sean `https://`, y los enlaces externos se abren en el navegador.
- Las claves se cifran en disco y solo salen hacia el proveedor de IA elegido.

## Agente: herramientas

| Herramienta | Qué hace |
|---|---|
| `get_overview` | Depósito, flota, pedidos por prioridad y resumen del plan |
| `list_orders` | Pedidos filtrados (todos, sin asignar, con retraso, prioridad alta, por vehículo) |
| `plan_routes` | Calcula el plan con el motor |
| `move_order` | Mueve un pedido a otro vehículo o posición y avisa de retrasos o sobrecarga |
| `set_vehicle` | Disponibilidad, jornada o capacidad de un vehículo |
| `add_order` / `remove_order` | Añade (geocodificando) o quita pedidos |
| `get_route` | Paradas con hora de llegada y enlaces de Google Maps |

El agente no puede aprobar planes: esa decisión es siempre de la persona.
