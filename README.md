# OpenRoute
**IA abierta y explicable para la optimización logística de última milla en pymes.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![Streamlit App](https://img.shields.io/badge/Streamlit-FF4B4B?logo=streamlit&logoColor=white)](https://streamlit.io)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Ollama llama3.1](https://img.shields.io/badge/Ollama-llama3.1:8b-1a531a?logo=ollama)](https://ollama.com)
[![Hackathon](https://img.shields.io/badge/Hackathon-IA_Responsable_y_Abierta-000000?logo=github)](https://github.com/ComunidadIA-OS)

---

##  Visión del Proyecto

El problema real de la logística local no es calcular una ruta de A a B. El verdadero reto para las pymes es **ordenar decenas de entregas con restricciones de tiempo y capacidad, repartirlas entre vehículos y justificar esas decisiones de forma transparente**.

**OpenRoute** democratiza las capacidades de planificación que usan los grandes operadores. Convertimos una simple lista de pedidos (CSV) en rutas optimizadas, **explicables en lenguaje natural** y totalmente accionables desde una interfaz unificada.

---

##  Dos componentes complementarios

OpenRoute combina dos piezas que pueden usarse de forma **independiente** o **integrada**:

| Componente | Tecnología | Para qué |
|---|---|---|
| **Backend de optimización** (raíz del repo) | Python + Streamlit + Google OR-Tools | Resolver VRP con time windows y capacidades. Explicaciones XAI de las decisiones del solver. UI para el gestor de flota: carga CSV → rutas → métricas. |
| **Frontend conversacional** (`web/`) | Next.js 14 + Ollama (LLM local) + Leaflet + OSRM | Centro de comandos en español: chatbot que consulta pedidos, sugiere rutas optimizadas, asigna furgonetas y reorganiza automáticamente ante averías. |

Para el detalle de arquitectura y cómo evolucionará la integración entre ambos, ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

##  Características Principales

### Backend Python (optimización)

* **Carga Simple:** Importación directa de pedidos mediante archivos CSV. Cero integraciones complejas.
* **IA Explicativa (XAI):** No somos una caja negra. El sistema explica *por qué* agrupó ciertas entregas y qué restricciones influyeron en la decisión final.
* **Gestión de Restricciones:** Soporte para prioridades (alta/media/baja), ventanas horarias y capacidad de vehículos.
* **Métricas de Impacto:** Comparativa clara entre la ruta manual y la optimizada (ahorro de km y tiempo).

### Frontend conversacional (`web/`)

* **Chatbot como UI principal:** el LLM no es un añadido, es la forma natural de operar. *"Sugiere rutas para hoy"*, *"Asigna la opción B a Juan"*, *"Mi furgo se ha averiado, 60 minutos"*.
* **Privacidad por diseño:** Ollama corre 100% local, los datos del cliente no salen de la máquina.
* **Mapa real:** Leaflet + OSRM dibujan la ruta optimizada por calles reales, no líneas rectas.
* **Auto-gestión de averías:** ante una avería, el chatbot reoptimiza la ruta restante, mueve pedidos al día siguiente y comunica las nuevas ETAs en una sola frase.
* **Auditoría completa:** cada turno del chatbot queda registrado con sus tool calls para reproducibilidad y trazabilidad.

---

##  Arquitectura y Tecnologías

### Backend Python
* **Interfaz:** [Streamlit](https://streamlit.io/) (Carga de datos, controles y dashboard de resultados).
* **Procesamiento de Datos:** `pandas` (Limpieza, validación y cálculo de métricas).
* **Motor de Optimización:** [Google OR-Tools](https://developers.google.com/optimization) (VRP con time windows y capacidades).
* **Geolocalización y Mapas:** `Folium` / `Pydeck` (Renderizado del mapa interactivo).
* **IA Generativa:** Modelo LLM open source para la generación de explicaciones en lenguaje natural.

### Frontend `web/`
* **Framework:** [Next.js 14](https://nextjs.org) (App Router) + TypeScript + Tailwind + shadcn/ui.
* **Persistencia:** SQLite + [Prisma](https://www.prisma.io/) (cambio a Postgres con una variable de entorno).
* **Mapas:** [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) + [OSRM](https://project-osrm.org/) público para `/trip` y `/route`.
* **Geocoding:** [Nominatim](https://nominatim.openstreetmap.org/) de OSM con caché persistente.
* **LLM local:** [Ollama](https://ollama.com/) con `llama3.1:8b` y tool calling nativo.
* **Auth:** JWT en cookie `httpOnly` (simple, sin OAuth).

Arquitectura detallada en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

##  Guía de Instalación y Uso

OpenRoute tiene **dos componentes**. Puedes ejecutar uno, otro o ambos. Lo recomendado durante el desarrollo es tenerlos corriendo en paralelo.

### 1. Clonar el repositorio
```bash
git clone https://github.com/ComunidadIA-OS/OpenRoute.git
cd OpenRoute
```

### 2A. Backend Python (Streamlit + OR-Tools)

Requisitos: **Python 3.9+**.

```bash
# Crear entorno virtual (recomendado)
python -m venv .venv
source .venv/bin/activate            # macOS / Linux
.venv\Scripts\activate               # Windows PowerShell

# Instalar dependencias
pip install -r requirements.txt

# Lanzar la app Streamlit
streamlit run app/main.py
```

Abre la URL que muestra Streamlit (típicamente http://localhost:8501).

### 2B. Frontend conversacional (`web/`)

Requisitos: **Node.js 20+**, **[Ollama](https://ollama.com/download)** instalado, **~5 GB** libres para el modelo, conexión a internet (para OSRM y Nominatim públicos).

```bash
# 1. Descargar el modelo LLM (una sola vez, ~5GB)
ollama pull llama3.1:8b

# 2. Configurar la app
cd web
cp .env.example .env
# (revisa .env, ajusta JWT_SECRET en producción)

# 3. Instalar dependencias y preparar la DB
npm install
npx prisma migrate dev
npm run db:seed

# 4. Arrancar el servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Inicia sesión con `admin / admin123`.

**Usuarios demo sembrados:**

| Usuario   | Contraseña    | Rol    | Furgoneta  |
| --------- | ------------- | ------ | ---------- |
| admin     | admin123      | ADMIN  | —          |
| despacho  | despacho123   | ADMIN  | —          |
| juan      | juan123       | DRIVER | 1234-ABC   |
| maria     | maria123      | DRIVER | 5678-DEF   |
| carlos    | carlos123     | DRIVER | 9012-GHI   |

> ⚠️ Las contraseñas demo están publicadas a propósito. **Cambiar antes de cualquier despliegue real.**

---

##  Guión de demo del frontend (5 min)

1. **Login** como `admin/admin123` → tabla con 47 pedidos repartidos por Alicante.
2. **Crear pedido nuevo** desde el botón → la dirección se geocodifica en vivo contra Nominatim.
3. Ir a `/chat`:
   - *"Sugiere rutas para hoy"* → el LLM llama a `current_time`, luego `suggest_routes`, devuelve 3 opciones con resumen (entregas, distancia, duración).
   - *"Asigna la opción B a Juan"* → el LLM crea la ruta `RT-2026-XX-XX-A` y la asigna.
4. Ir a `/routes/[id]` → mapa con polyline real por calles + marcadores numerados + panel lateral con paradas en orden óptimo y ETAs.
5. Volver al chat:
   - *"Mi furgo se ha averiado en RT-..., 60 minutos"* → el LLM reoptimiza la ruta restante, mueve los pedidos que ya no caben a mañana (`RESCHEDULED`), registra incidencia, comunica las nuevas ETAs.

---

##  Hackathon

Este proyecto se desarrolla para el **Hackathon "IA Responsable y Abierta en Industria" Mayo'26** organizado por la Secretaría de Estado de Digitalización e Inteligencia Artificial ([SEDIA](https://digital.gob.es)) y la Agencia Española de Supervisión de la Inteligencia Artificial (AESIA), en el marco de la [Comunidad IA de Código Abierto](https://digital.gob.es), con la colaboración del EDIH de Aragón ([ITA](https://www.ita.es/) + Universidad de Zaragoza).

- **Reto**: soluciones de IA responsable y abierta aplicables en entornos industriales.
- **TRL objetivo**: TRL5-6 (validación / demostración de prototipo en entorno relevante).
- **Compromiso**: el código se publica bajo licencia [Apache 2.0](LICENSE) y está pensado para ser auditable, reproducible y reutilizable por terceros.

---

##  Hoja de ruta

Lo que viene después del hackathon: ver [`docs/ROADMAP.md`](docs/ROADMAP.md). Resumen:

- **Corto plazo**: integración Python ↔ web/ (el chatbot delega al OR-Tools), tests automatizados, CI/CD, Docker, migración a Postgres.
- **Medio plazo**: ficha técnica del conductor (KPIs), app móvil PWA, notificaciones al cliente, vista en tiempo real para el despachador.
- **Largo plazo**: multi-tenant, integración con ERPs y e-commerce, internacionalización.

---

##  Contribuir

¡Bienvenidas las contribuciones! Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) para empezar. Áreas donde nos vendría bien ayuda:

- 🧪 Tests automatizados (ambos componentes)
- 🐳 Docker compose con todo levantado
- 🔗 Integración backend Python ↔ frontend web/ vía HTTP
- 🌍 Internacionalización
- ♿ Accesibilidad
- 📊 Ficha técnica del conductor

Este proyecto sigue el [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

---

##  Built with — Agradecimientos

OpenRoute se apoya en el ecosistema open source. Devolvemos visibilidad a los proyectos sobre los que está construido:

**Backend Python:**
- **[Streamlit](https://streamlit.io/)** (Apache 2.0) — interfaz interactiva.
- **[pandas](https://pandas.pydata.org/)** (BSD-3) — procesamiento de datos.
- **[Google OR-Tools](https://developers.google.com/optimization)** (Apache 2.0) — solver VRP.
- **[Folium](https://python-visualization.github.io/folium/)** (MIT) / **[Pydeck](https://deckgl.readthedocs.io/)** (MIT) — visualización geográfica.

**Frontend `web/`:**
- **[Next.js](https://nextjs.org/)** (MIT) — framework full-stack.
- **[Prisma](https://www.prisma.io/)** (Apache 2.0) — ORM.
- **[Tailwind CSS](https://tailwindcss.com/)** (MIT) — estilos.
- **[shadcn/ui](https://ui.shadcn.com/)** (MIT) — primitivos de UI accesibles.
- **[Leaflet](https://leafletjs.com/)** (BSD-2) — librería de mapas.
- **[OpenStreetMap](https://www.openstreetmap.org/)** (ODbL) — datos cartográficos.
- **[OSRM](https://project-osrm.org/)** (BSD-2) — motor de routing y TSP.
- **[Nominatim](https://nominatim.org/)** (GPL-2, usado como servicio externo) — geocoding.
- **[Ollama](https://ollama.com/)** (MIT) — runtime local para LLMs.
- **[Llama 3.1](https://llama.meta.com/)** (Llama 3.1 Community License) — modelo de lenguaje.
- **[Lucide](https://lucide.dev/)** (ISC) — iconos.
- **[Zod](https://zod.dev/)** (MIT) — validación de inputs.

Sin estos proyectos, OpenRoute no existiría. Si encuentras un bug en una de estas dependencias mientras contribuyes, abre un issue upstream — eso también es devolver.

---

##  Licencia

[Apache License 2.0](LICENSE) © 2026 Equipo OpenRoute.

Eres libre de usar, modificar y distribuir este software, incluso comercialmente, conservando el aviso de copyright y la licencia original.

---

##  Contacto

- Issues y discusiones técnicas → [GitHub Issues](../../issues)
- Hackathon → [comunidad.ia.os@digital.gob.es](mailto:comunidad.ia.os@digital.gob.es)
- Discord de la Comunidad IA de Código Abierto → ver [portal SEDIA](https://digital.gob.es)
