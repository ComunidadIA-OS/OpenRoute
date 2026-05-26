# Hoja de ruta de OpenRoute

Lo que existe hoy (MVP del hackathon) cubre dos vías complementarias:
- **Backend Python**: optimización VRP con OR-Tools y explicaciones XAI vía Streamlit.
- **Frontend `web/`**: chatbot LLM local como centro de comandos con mapa Leaflet y auto-gestión de averías.

Esta hoja de ruta describe lo que viene **después** del hackathon.

## Estado actual (mayo 2026 — entrega del hackathon)

### Backend Python (raíz)
- ✅ Carga de CSV con validación
- ✅ Solver VRP con OR-Tools y restricciones (tiempo, capacidad, prioridades)
- ✅ Simulador baseline manual para comparar (en `metrics.py`)
- ✅ Asistente IA explicativo (XAI) de las decisiones del solver
- ✅ UI Streamlit con dashboard y mapa
- ✅ Suite inicial de tests unitarios

### Frontend web/
- ✅ Login con JWT + roles ADMIN/DRIVER
- ✅ Tabla de pedidos con filtros, búsqueda y CRUD (geocoding en vivo)
- ✅ Chatbot LLM con 13 tools y parser tolerante de fallos del modelo
- ✅ Optimización VRP simple vía OSRM `/trip` con 3 opciones por sector
- ✅ Asignación de rutas a conductor + furgoneta
- ✅ Mapa Leaflet con polyline real por calles y marcadores numerados
- ✅ Panel lateral con paradas en orden + acción "marcar entregada"
- ✅ Auto-gestión de averías: el chatbot reoptimiza rutas y difiere pedidos al día siguiente
- ✅ Sistema de incidencias con auditoría

---

## Corto plazo (1-2 meses) — Integración y producción mínima viable

Objetivo: pasar de prototipo hackathon (TRL5-6) a piloto desplegable en una PYME real (TRL7).

### Integración Python ↔ web/
- [ ] Exponer el optimizador Python como microservicio HTTP (FastAPI).
- [ ] Añadir tool `optimize_with_or_tools` al chatbot del frontend.
- [ ] El chatbot decide automáticamente: para ≤15 paradas usa OSRM `/trip`; para >15 paradas o time windows estrictas delega al backend Python.
- [ ] Pasar las explicaciones XAI del backend al frontend para mostrarlas al usuario.

### Calidad y CI
- [ ] **Tests automatizados frontend**: Vitest para `lib/`, Playwright para flujos críticos.
- [ ] **Tests automatizados backend**: ampliar la suite pytest existente, coverage mínimo 60%.
- [ ] **CI/CD con GitHub Actions**: lint + typecheck + tests en cada PR.

### Despliegue
- [ ] **Docker** para ambos componentes.
- [ ] `docker-compose.yml` con backend Python + frontend Next.js + Ollama + (opcional) OSRM self-hosted + Postgres.
- [ ] Documentar deploy en VPS pequeño (Hetzner, DigitalOcean).

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
