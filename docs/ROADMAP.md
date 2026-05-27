# Hoja de ruta de OpenRoute

Lo que existe hoy (entrega del hackathon Mayo'26) cubre dos componentes complementarios e integrados por HTTP:
- **Microservicio Python (FastAPI)**: motor de optimización VRP con OR-Tools, matriz real OSRM y explicaciones XAI vía Ollama local.
- **Frontend `web/` (Next.js)**: chatbot LLM local como centro de comandos con mapa Leaflet, importador de CSV y auto-gestión de averías.

Esta hoja de ruta describe lo que viene **después** del hackathon.

## Estado actual (mayo 2026 — entrega del hackathon)

### Motor de optimización (raíz: `app/`, `src/`)
- ✅ Carga de CSV con validación y bbox configurable (env var + argumento)
- ✅ Solver VRP con OR-Tools y restricciones (tiempo, capacidad, prioridades)
- ✅ DISJUNCTIONS en OR-Tools para diferir pedidos infactibles sin caer al fallback completo
- ✅ Matriz de distancias real con OSRM `/table` + fallback automático a Haversine
- ✅ Simulador baseline manual realista (zona + urgencia de ventana) en `metrics.py`
- ✅ Asistente IA explicativo (XAI) de las decisiones del solver (`ai_assistant.py`)
- ✅ Microservicio FastAPI con endpoints `/health`, `/optimize`, `/baseline`, `/compare`, `/optimize-csv`
- ✅ 24 tests unitarios cubriendo schema, restricciones duras, OSRM fallback, bbox y serialización JSON

### Frontend web/
- ✅ Login con JWT + roles ADMIN/DRIVER
- ✅ Tabla de pedidos con filtros, búsqueda y CRUD (geocoding en vivo)
- ✅ Chatbot LLM con 14 tools y parser tolerante de fallos del modelo
- ✅ Tool `optimize_with_ortools` que delega al microservicio Python (CVRPTW industrial)
- ✅ Pantalla `/import` con dropzone para CSVs sin tocar la DB, análisis combinado entre archivos
- ✅ Optimización VRP simple vía OSRM `/trip` con 3 opciones por sector
- ✅ Asignación de rutas a conductor + furgoneta
- ✅ Mapa Leaflet con polyline real por calles y marcadores numerados
- ✅ Panel lateral con paradas en orden + acción "marcar entregada"
- ✅ Auto-gestión de averías: el chatbot reoptimiza rutas y difiere pedidos al día siguiente
- ✅ Sistema de incidencias con auditoría

### Operativa y entrega
- ✅ Licencia Apache 2.0, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`
- ✅ Autoevaluación HRIA (esqueleto firmado) en [`docs/HRIA.md`](HRIA.md)
- ✅ CI con GitHub Actions: lint + typecheck + build del frontend en cada PR
- ✅ Docker + `docker-compose.yml` orquestando optimizer + ollama + web con un solo comando

---

## Corto plazo (1-2 meses) — Producción mínima viable

Objetivo: pasar de prototipo hackathon a piloto desplegable en una PYME real (TRL7).

### Calidad y CI
- [ ] **Tests del frontend**: Vitest para `lib/`, Playwright para flujos críticos.
- [ ] **Ampliar suite del motor** con casos de equidad geográfica y datasets reales medidos.
- [ ] **CI también para Python**: ejecutar `python -m unittest src/test_optimizer.py` en cada PR.

### Despliegue en producción
- [ ] Imágenes Docker publicadas en GHCR para que el cliente no rebuilde.
- [ ] Guía de deploy en VPS pequeño (Hetzner, DigitalOcean).
- [ ] OSRM auto-hospedado opcional (compose perfil) para datasets >100 puntos sin chunkear.

### Persistencia robusta
- [ ] **Migración SQLite → PostgreSQL** en producción (sólo cambio de `DATABASE_URL`).
- [ ] Migrations versionadas en CI.

### Seguridad
- [ ] `bcrypt rounds` a 12.
- [ ] Rate limiting en `/api/auth/login` (5 intentos / 15 min).
- [ ] Rotación periódica del `JWT_SECRET`.

### UX
- [ ] Manejo de errores más explícito en UI (toasts cuando OSRM falla).
- [ ] Estado de carga del chat con porcentaje de progreso del tool calling.
- [ ] Configuración del depósito por entidad (hoy hardcoded en `web/.env`).

---

## Medio plazo (3-6 meses) — Diferenciación

- [ ] **Ficha técnica del conductor**
  - Pantalla con KPIs históricos: rutas hechas, % entregas con éxito, tiempo medio por parada, kilómetros, valoración.
  - Reporte mensual exportable a PDF (útil para nóminas y RRHH).
- [ ] **Asignación automática de furgonetas**
  - Algoritmo que empareja conductor + furgoneta + ruta considerando capacidades y disponibilidad.
- [ ] **App móvil del conductor (PWA)**
  - Mismo `/routes/[id]` pensado para móvil.
  - Marcar entregada con foto + firma del cliente.
  - Notificaciones push de cambios de ruta.
- [ ] **Notificaciones al cliente**
  - SMS o email cuando se asigna ETA y cuando el conductor está a X paradas.
  - Webhook configurable por entidad.
- [ ] **Vista de despachador en tiempo real**
  - Mapa con la posición actual de todas las furgonetas (WebSocket).
  - Alertas si una ruta va con >20 min de retraso.

---

## Largo plazo (6-12 meses) — Plataforma multi-tenant

- [ ] **Multi-tenancy**
  - Una instancia sirve a varias empresas con datos aislados.
  - Modelo `Organization` y filtros por tenant en todos los queries.
- [ ] **Integración con sistemas existentes de PYMEs**
  - Importar pedidos desde Excel/CSV (ya disponible en el backend Python — falta integrar en el frontend).
  - Webhook API para que ERPs y e-commerce inyecten pedidos automáticamente.
  - Conectores para los más comunes: WooCommerce, Shopify, Holded.
- [ ] **Internacionalización**
  - Extraer textos a `next-intl`.
  - Idiomas: ES, EN, CA, GA, EU mínimo.
- [ ] **Modelos de LLM alternativos**
  - Adapter pattern en `lib/ollama-client.ts` para soportar OpenAI / Anthropic / Mistral además de Ollama local.
  - Permitir al admin elegir el modelo desde la UI.
- [ ] **Auditoría y cumplimiento**
  - Log de acciones del chatbot exportable (ya está la base en `ChatMessage`).
  - Cumplimiento RGPD: derecho al olvido, exportación de datos personales del cliente.
  - Evaluación HRIA periódica (UN) y publicada.

---

## Mejoras transversales que aceptamos siempre

- 🧪 Más tests, siempre.
- ♿ Accesibilidad: auditoría WCAG 2.2 AA de las pantallas.
- 📚 Documentación: tutoriales paso a paso, screencast del flujo completo.
- 🔍 Observabilidad: traces de OpenTelemetry en los tool calls del chatbot.
- 🎨 Polish visual: animaciones, dark mode, mejor responsive.

## Cómo proponer cambios al roadmap

Abre un issue con la etiqueta `roadmap` describiendo el cambio y por qué encaja en la visión del proyecto. Si quieres trabajar en algo concreto, mejor: abre un PR. Ver [CONTRIBUTING.md](../CONTRIBUTING.md).
