# Human Rights Impact Assessment (HRIA) — OpenRoute

> **Estado**: borrador en revisión por el equipo. La autoevaluación completa, generada con la herramienta del Programa de las Naciones Unidas para el Desarrollo (PNUD) disponible en <https://hria.eu/#use-cases>, se incorpora a este documento como anexo antes del **29 de mayo de 2026 a las 23:59** (entregable 4 del reglamento del hackathon).
>
> Este documento responde al apartado **12. Uso de inteligencia artificial** y al **entregable 4 del apartado 9.2** de los [términos y condiciones del hackathon](../README.md#hackathon).

---

## 1. Resumen ejecutivo

OpenRoute es un sistema de optimización de rutas logísticas para PYMEs que combina:

- Un **microservicio Python** (FastAPI + Google OR-Tools) que resuelve un VRP con time windows y capacidades reales.
- Un **frontend conversacional Next.js** con un **LLM local (Ollama + `llama3.2:3b`)** como copiloto del despachador.

La herramienta del PNUD se aplica al sistema completo, no a cada componente por separado. La evaluación se centra en:

- El uso de IA generativa (LLM) como interfaz operativa.
- El uso de IA de decisión (OR-Tools) para asignar pedidos a conductores.
- El tratamiento de datos personales y operativos de PYMEs, clientes finales y trabajadores (conductores).

## 2. Caso de uso evaluado

| Aspecto | Descripción |
|---|---|
| **Sector** | Logística de última milla (PYME). |
| **Dominio del sistema** | Asistente al despachador para planificar rutas, asignar conductores, gestionar averías y comunicar cambios al cliente. |
| **Decisiones automatizadas** | Orden óptimo de paradas, asignación pedido↔vehículo, diferimiento de pedidos infactibles, reasignación tras una avería. |
| **Decisión final** | Humana. Todo plan generado por OR-Tools o sugerido por el LLM **requiere aprobación explícita del despachador** antes de ejecutarse en el frontend. |
| **Datos tratados** | Direcciones de clientes, ventanas horarias, peso de los pedidos, prioridad, identidad del conductor, matrícula del vehículo. **Sin datos especialmente protegidos** (ni salud, ni biometría, ni orientación, ni convicciones). |
| **Audiencia afectada** | Empleados del despacho (despachador, conductores) y clientes finales que reciben la entrega. |
| **Tipo de riesgo predominante** | Operacional y de transparencia, no fundamental. |

## 3. Dimensiones evaluadas con la herramienta HRIA del PNUD

La herramienta del PNUD evalúa el impacto del sistema sobre los siguientes derechos humanos. A continuación, anticipamos cómo OpenRoute se posiciona en cada uno (la puntuación numérica final saldrá de la herramienta y se anexará a este documento):

### 3.1 Privacidad y protección de datos (Art. 12 DUDH, RGPD)

- **Riesgo**: bajo. El LLM corre **100% local con Ollama**; los datos de pedidos no se envían a servidores de terceros.
- **Mitigaciones aplicadas**:
  - Almacenamiento en SQLite local (Prisma), migrable a Postgres del cliente.
  - Caché OSRM/Nominatim local; las direcciones se geocodifican una vez y se cachean.
  - JWT en cookie `httpOnly` con `sameSite=lax`.
- **Pendiente para producción**: rotación de `JWT_SECRET`, multi-tenant con aislamiento de datos por organización, política de retención.

### 3.2 No discriminación e igualdad (Art. 7 DUDH, AI Act art. 5 y 6)

- **Riesgo**: medio. El motor OR-Tools optimiza por coste/distancia/CO₂; podría sistemáticamente perjudicar barrios periféricos si la matriz de distancias los penaliza.
- **Mitigaciones aplicadas**:
  - Prioridad del pedido (1–3) influye en el score y permite al despachador imponer "atender primero esta zona".
  - DISJUNCTIONS de OR-Tools reportan los pedidos diferidos, evitando que se descarten en silencio.
  - La heurística baseline ordena por urgencia de ventana, no por valor económico.
- **Pendiente**: añadir un test específico de equidad geográfica sobre el dataset de demo (¿se reparten las paradas de manera proporcional al volumen de pedidos por zona?).

### 3.3 Transparencia y derecho a una explicación (AI Act art. 13, Art. 19 DUDH)

- **Riesgo**: medio. Los LLMs pueden alucinar y los solvers VRP son opacos por naturaleza.
- **Mitigaciones aplicadas**:
  - El motor devuelve siempre métricas comparables contra un **baseline manual realista** (km, €, CO₂, retrasos evitados). El usuario ve el "por qué" cuantitativo.
  - Cuando OR-Tools no encuentra solución factible, el sistema **avisa explícitamente** (`used_fallback=true`) y el system prompt obliga al chatbot a comunicarlo.
  - El módulo `src/ai_assistant.py` genera informes XAI en lenguaje natural sobre las decisiones del solver.
  - **Auditoría completa**: cada turno del chatbot queda persistido (`ChatSession` + `ChatMessage` con `toolCalls`). Reproducibilidad asegurada.
- **Pendiente**: exponer el informe XAI también en la UI del frontend, no solo en la consola del backend.

### 3.4 Trabajo digno (Art. 23 DUDH)

- **Riesgo**: medio. La asignación automática de rutas puede degradar las condiciones del conductor (jornadas más largas, presión por ETAs ajustadas).
- **Mitigaciones aplicadas**:
  - Las **horas de inicio/fin de jornada** son un parámetro duro del vehículo (`hora_inicio`, `hora_fin`); OR-Tools no asigna trabajo fuera de esas horas.
  - La capacidad en kg también es un límite duro; no se carga al conductor por encima de lo legal.
  - El conductor puede **reportar incidencias y averías** desde el chat; el sistema reoptimiza sin penalizarle por la incidencia.
- **Pendiente**: incluir tiempo de descanso obligatorio (>4h conducción → 30 min) como restricción del solver.

### 3.5 Seguridad personal (Art. 3 DUDH)

- **Riesgo**: bajo. El sistema **no genera rutas en tiempo real ni dicta cómo conducir**, sólo el orden de paradas.
- **Mitigaciones aplicadas**:
  - Distancias y tiempos por OSRM real, no por línea recta — la ETA es realista y no presiona al conductor a saltarse normas.

### 3.6 Acceso a un recurso efectivo (Art. 8 DUDH)

- **Riesgo**: bajo (sistema de soporte, decisión final humana).
- **Mitigaciones aplicadas**:
  - Toda acción modificable por el chatbot (asignar ruta, marcar entregada, reprogramar) queda registrada en la base de datos con `userId` y timestamp.
  - El cliente final puede reclamar al despachador, que tiene auditoría completa de la asignación.

## 4. Cumplimiento normativo de referencia

- **Reglamento (UE) 2024/1689 (AI Act)** — OpenRoute encaja en *riesgo limitado / mínimo*: es un sistema de soporte a la decisión humana en logística, no listado entre los usos de alto riesgo del Anexo III.
- **Reglamento (UE) 2016/679 (RGPD)** — base de tratamiento: interés legítimo de la PYME para gestionar entregas; pendiente añadir política de privacidad y registro de actividades de tratamiento al desplegar.
- **Directiva (UE) 2019/1937 (whistleblowing)** — fuera del alcance del MVP.

## 5. Roadmap de mejoras priorizadas tras la HRIA

Las mejoras que la herramienta del PNUD recomiende se incorporarán a [`docs/ROADMAP.md`](ROADMAP.md) en la sección "Corto plazo". Las que ya tenemos en mente:

1. **Test de equidad geográfica** sobre el dataset de demo: ningún barrio del bbox queda sistemáticamente postergado.
2. **Descansos obligatorios** del conductor como restricción dura del solver.
3. **Informe XAI visible en la UI** del frontend, no solo en logs del backend.
4. **Política de privacidad** explícita al instalar OpenRoute en una PYME.
5. **Multi-tenant** con aislamiento de datos por organización.
6. **Retención**: los `ChatMessage` con datos personales se anonimizan tras N días configurables.

## 6. Anexos

- **A. Resultado completo de la herramienta HRIA del PNUD** (https://hria.eu/#use-cases) — pendiente de adjuntar antes del 29-may-2026 23:59.
- **B. Referencias normativas** — DUDH 1948, RGPD, AI Act, Ley 15/2022.
- **C. Contacto del equipo** — ver [README.md](../README.md#contacto).

---

*Última actualización del borrador: 2026-05-27. Versión final con el resultado de la herramienta del PNUD se incorporará antes del 29-may-2026 23:59 (entregable 4 del reglamento).*
