# Contribuir a OpenRoute

¡Gracias por interesarte en OpenRoute! Este proyecto es la candidatura del equipo al [Hackathon "IA Responsable y Abierta en Industria" Mayo'26](https://digital.gob.es) (SEDIA + AESIA + EDIH Aragón) y se publica bajo licencia [Apache 2.0](LICENSE) para que cualquiera pueda usarlo, extenderlo y mejorarlo.

## Código de conducta

Este proyecto sigue el [Contributor Covenant](CODE_OF_CONDUCT.md). Al participar, te comprometes a mantener un entorno respetuoso e inclusivo.

## Estructura del proyecto

OpenRoute tiene **dos componentes complementarios e integrados por HTTP**:

- **Microservicio de optimización (raíz del repo)** — Python + FastAPI + Google OR-Tools. Resuelve el VRP con restricciones de tiempo y capacidad, genera explicaciones XAI sobre las decisiones de ruta. Se levanta con `uvicorn app.main:app --port 8000` y expone `/health`, `/optimize`, `/baseline`, `/compare`, `/optimize-csv`.
- **Frontend conversacional (`web/`)** — Next.js 14 + Ollama (LLM local) + Leaflet. Un chatbot en español que actúa como centro de comandos: consulta pedidos, sugiere rutas optimizadas, asigna furgonetas y reorganiza ante averías. Delega al microservicio Python a través del tool `optimize_with_ortools` cuando el caso lo requiere.

Ambos componentes pueden ejecutarse de forma independiente (el motor sirve a cualquier cliente HTTP; el frontend funciona con OSRM TSP si el microservicio no está) o juntos con `docker compose up --build`.

Detalle técnico: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Cómo contribuir

### Reportar bugs o sugerir mejoras

1. Busca primero en los [issues abiertos](../../issues) si tu problema ya está reportado.
2. Si no, abre un nuevo issue con:
   - **Título claro**: qué pasa y dónde (especifica si afecta al backend Python o al frontend `web/`).
   - **Pasos para reproducir** (si es un bug).
   - **Comportamiento esperado vs. real**.
   - **Entorno**: SO, versión de Python / Node, versión de Ollama si aplica, navegador.
   - Capturas o logs si aplica.

Etiquetas útiles:
- `bug` — algo no funciona
- `enhancement` — propuesta de mejora
- `area:backend` — afecta a la parte Python
- `area:web` — afecta al frontend Next.js
- `good first issue` — buena para empezar
- `help wanted` — necesitamos ayuda
- `question` — duda de uso o arquitectura

### Enviar un Pull Request

1. Haz fork del repositorio.
2. Crea una rama descriptiva: `git checkout -b feat/mi-mejora` o `fix/bug-xyz`.
3. Asegúrate de que los componentes que tocas siguen funcionando:
   - **Motor Python**: `OPENROUTE_DISABLE_OSRM=1 python -m unittest src/test_optimizer.py` (24 tests, ~40s, sin red).
   - **Frontend web**: `cd web && npm run lint && npx tsc --noEmit && npm run build`.
   - **Integración Docker**: `docker compose up --build -d` y comprobar que `docker compose ps` muestra los 3 servicios como `(healthy)`.
4. Haz commits pequeños y descriptivos siguiendo [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(web): añadir tool de listado de incidencias al chatbot`
   - `fix(optimizer): corregir capacidad por vehículo en restricción VRP`
   - `docs: ampliar guía de arranque del frontend`
   - `refactor(web): extraer cliente OSRM a su propio módulo`
   - `chore: actualizar dependencias`
   - `test(optimizer): añadir suite de pruebas unitarias para data_processor`
5. Abre un PR contra `main` describiendo:
   - Qué problema resuelve.
   - Cómo lo has resuelto.
   - Qué componente afecta (backend / web / ambos).
   - Cómo lo has probado.
   - Capturas si afecta a la UI.

### Estilo de código

**Backend Python**:
- PEP 8 / `ruff` para linting.
- Type hints en funciones públicas.
- Docstrings en módulos y funciones complejas.

**Frontend Next.js (`web/`)**:
- TypeScript estricto. Evita `any`; usa tipos concretos o `unknown` + narrowing.
- Comentarios solo donde aporten contexto que el código no transmite por sí solo.
- No introduzcas abstracciones especulativas. Si dudas, escribe la forma directa.
- Validación de inputs con `zod` en los endpoints de API.

**Común**:
- La UI y los prompts del chatbot están en **español**. Mantén ese idioma para textos visibles.
- Los comentarios y commits pueden ser en español o inglés.

### Áreas donde nos vendría bien ayuda

- 🧪 **Tests del frontend**: Vitest para `web/src/lib/`, Playwright para los flujos críticos (login → chat → asignar ruta → marcar entregada). El motor Python ya tiene 24 tests en `src/test_optimizer.py`.
- 🐳 **Imágenes Docker publicadas**: hoy `docker-compose.yml` construye localmente. Publicar `openroute/optimizer` y `openroute/web` en GHCR ahorraría 5-10 min al jurado.
- 🌍 **Internacionalización**: extraer strings de UI y system prompt a un sistema i18n.
- ♿ **Accesibilidad**: auditoría WCAG 2.2 AA de los componentes principales.
- 🔐 **Auth de producción**: integración con OAuth (Google, Microsoft) además del JWT local; rate limiting en `/api/auth/login`.
- 📊 **Ficha técnica del conductor**: KPIs históricos (rutas, tiempos, tasa de entrega).
- 🗄️ **Campo `priority` en Prisma `Order`**: hoy todos los pedidos llegan al solver con prioridad 2 (TODO marcado en `web/src/lib/python-optimizer.ts`). Es la pieza que activa la heurística de prioridad del motor desde el frontend.

## Setup de desarrollo

Ver [README.md](README.md) para los pasos de instalación de cada componente. Resumen rápido para desarrollo local (la opción Docker está documentada en el README como recomendada para evaluación):

```bash
# Motor Python (FastAPI + OR-Tools) — terminal 1
python -m venv .venv
source .venv/bin/activate            # macOS / Linux
.venv\Scripts\activate               # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend Next.js + Ollama — terminal 2
ollama pull llama3.2:1b              # modelo activo por defecto
cd web
cp .env.example .env
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

## Licencia

Al enviar un PR, aceptas que tu contribución se publique bajo la misma licencia [Apache 2.0](LICENSE) del proyecto.

## Contacto

- Issues y discusiones técnicas → [GitHub Issues](../../issues)
- Hackathon → [comunidad.ia.os@digital.gob.es](mailto:comunidad.ia.os@digital.gob.es)
