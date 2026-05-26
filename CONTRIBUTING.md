# Contribuir a OpenRoute

¡Gracias por interesarte en OpenRoute! Este proyecto es la candidatura del equipo al [Hackathon "IA Responsable y Abierta en Industria" Mayo'26](https://digital.gob.es) (SEDIA + AESIA + EDIH Aragón) y se publica bajo licencia [Apache 2.0](LICENSE) para que cualquiera pueda usarlo, extenderlo y mejorarlo.

## Código de conducta

Este proyecto sigue el [Contributor Covenant](CODE_OF_CONDUCT.md). Al participar, te comprometes a mantener un entorno respetuoso e inclusivo.

## Estructura del proyecto

OpenRoute tiene **dos componentes complementarios**:

- **Backend de optimización (raíz del repo)** — Python + Streamlit + Google OR-Tools. Resuelve el VRP con restricciones de tiempo y capacidad, genera explicaciones XAI sobre las decisiones de ruta.
- **Frontend conversacional (`web/`)** — Next.js 14 + Ollama (LLM local) + Leaflet. Un chatbot en español que actúa como centro de comandos: consulta pedidos, sugiere rutas optimizadas, asigna furgonetas y reorganiza ante averías.

Ambos componentes pueden ejecutarse de forma independiente o integrarse (el frontend puede llamar al optimizador Python como microservicio para casos VRP con time windows estrictas).

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
   - **Backend Python**: `pytest` (cuando los tests estén disponibles), `python optimizar_rutas.py` ejecuta sin errores.
   - **Frontend web**: `cd web && npm run lint && npm run build`.
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

- 🧪 **Tests**: cobertura para `optimizar_rutas.py` y para el `lib/chat/` del frontend.
- 🐳 **Docker**: un `docker-compose.yml` que levante backend Python + frontend Next.js + Ollama + OSRM self-hosted.
- 🔗 **Integración backend↔frontend**: añadir un tool al chatbot que llame al optimizador Python para casos con muchas paradas o restricciones complejas.
- 🌍 **Internacionalización**: extraer strings a un sistema i18n.
- ♿ **Accesibilidad**: auditoría WCAG de los componentes principales.
- 🔐 **Auth de producción**: integración con OAuth (Google, Microsoft) además del JWT local.
- 📊 **Ficha técnica del conductor**: KPIs históricos (rutas, tiempos, tasa de entrega).

## Setup de desarrollo

Ver [README.md](README.md) para los pasos de instalación de cada componente.

Resumen rápido:

```bash
# Backend Python (Streamlit + OR-Tools)
pip install -r requirements.txt
streamlit run app/main.py

# Frontend Next.js + Ollama (en otra terminal)
ollama pull llama3.1:8b
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
