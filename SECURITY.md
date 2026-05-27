# Política de seguridad

OpenRoute trata datos operativos de PYMEs (direcciones de clientes, pedidos, rutas, conductores). Tomamos en serio cualquier vulnerabilidad que comprometa esa información o el funcionamiento del sistema.

Este documento describe **cómo reportar vulnerabilidades de forma responsable** y los compromisos que asumimos al recibirlas.

## Versiones soportadas

| Versión | Soportada |
| ------- | --------- |
| `main`  | ✅ Recibe parches de seguridad. |
| Ramas `feat/*`, `fix/*` | ❌ No mantenidas tras su merge a `main`. |

OpenRoute aún no tiene releases versionadas en GitHub; el hackathon entrega el estado de `main`. Cuando publiquemos `v1.0.0` (ver [ROADMAP.md](docs/ROADMAP.md)) esta tabla se actualizará.

## Cómo reportar una vulnerabilidad

**Por favor, NO abras un issue público** para problemas de seguridad. Los issues son indexables y pueden ser explotados antes de que tengamos un parche.

Reporta usando uno de estos canales privados:

1. **GitHub Security Advisories** (preferido) — pestaña *Security → Report a vulnerability* en el repositorio. Permite coordinar la divulgación de forma privada.
2. **Email** — escribe a cualquiera del equipo:
   - Juan David Morales — `juandmg020407@gmail.com`
   - Samuel Parra — `parrasamuel453@gmail.com`
   - Giulian Peterlecean — `giulian.peterlecean@gmail.com`

Incluye en tu reporte, en la medida de lo posible:

- Una descripción del problema y su impacto potencial.
- Pasos para reproducirlo (PoC, payload, request o commit que lo introdujo).
- Versión / commit afectado.
- Sistema operativo y configuración relevante.
- Tu identidad de contacto si quieres ser acreditado en el aviso.

## Compromiso

Al recibir un reporte responsable:

- **En 72 horas**: confirmaremos recepción.
- **En 7 días**: tendremos una primera evaluación (severidad, alcance, plan de remediación).
- **Antes de divulgar**: coordinaremos contigo la fecha de publicación del parche y del aviso.
- **Crédito**: si lo deseas, incluiremos tu nombre o alias en el aviso público y en el `CHANGELOG.md`.

## Alcance

Cosas que SÍ consideramos vulnerabilidades de OpenRoute:

- Escalado de privilegios entre roles `DRIVER` y `ADMIN`.
- Bypass del JWT o de la cookie `httpOnly`.
- Inyección SQL / NoSQL en endpoints o tools del chatbot.
- XSS o injection en la UI (incluido el chat, donde el LLM puede generar markdown).
- Server-side request forgery a través de los proxies OSRM / Nominatim.
- Exposición no intencionada de datos de clientes (direcciones, teléfonos) entre tenants una vez tengamos multi-tenant.
- Vulnerabilidades en los handlers de tools del chatbot que permitan ejecutar acciones no autorizadas (e.g. `mark_stop_delivered` sobre rutas ajenas).

Cosas que **NO** consideramos vulnerabilidades por sí solas:

- Contraseñas demo (`admin/admin123`, `juan/juan123`, etc.) publicadas en el `README.md` — están a propósito para la demo y el `README` lo advierte expresamente.
- Ausencia de HTTPS en `localhost` (la guía de despliegue ya recomienda HTTPS en producción).
- `JWT_SECRET` dummy del workflow CI — solo se usa para que el build pase, nunca se inyecta en producción.

## Prácticas de seguridad por diseño

Lo que OpenRoute ya hace y queremos mantener:

- **Privacidad por diseño**: el LLM corre 100% local con Ollama. Los datos de los clientes no salen de la máquina del usuario.
- **Auditoría**: cada turno del chatbot queda persistido en `ChatMessage` con `toolCalls` y `toolName`. Reproducible y trazable.
- **Validación en bordes**: todos los endpoints del frontend usan `zod` y todos los endpoints del backend Python usan Pydantic.
- **Open source**: la criptografía y autenticación se apoyan en librerías auditadas (`bcryptjs`, `jsonwebtoken`).

Aún por mejorar antes de producción (ver [ROADMAP.md](docs/ROADMAP.md)):

- Subir `bcrypt rounds` de 8 a 12+.
- Rate limiting en `/api/auth/login`.
- Rotación regular de `JWT_SECRET`.
- Multi-tenant + aislamiento de datos por organización.

## Coordinación con upstream

Si la vulnerabilidad está en una de nuestras dependencias (Next.js, FastAPI, OR-Tools, Prisma, Ollama, …), te ayudaremos a reportarla en su tracker correspondiente y mantendremos el contacto hasta que el parche esté disponible para nuestros usuarios.

---

Gracias por mantener OpenRoute seguro para las PYMEs que lo usen.
