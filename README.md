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

##  Arquitectura — un frontend, dos motores de optimización

OpenRoute presenta un **único producto al usuario**: el frontend conversacional Next.js, donde un chatbot LLM local actúa como centro de comandos. Por detrás conviven dos motores de optimización:

| Componente | Función | Cómo se invoca | Cuándo se usa |
|---|---|---|---|
| **Frontend conversacional (`web/`)** | Next.js 14 + chatbot Ollama + mapa Leaflet + Prisma/SQLite. UI única que ven los usuarios. | `cd web && npm run dev` (puerto 3000) | Siempre. Es la cara del producto. |
| **Microservicio FastAPI (`app/`)** | Wrapper HTTP sobre el motor VRP de Python (`src/`). Expone `/optimize`, `/baseline`, `/compare`. | `uvicorn app.main:app --port 8000` | Cuando el chatbot llama al tool `optimize_with_ortools`. |
| **Motor Python (`src/`)** | Solver VRP dual: heurística propia (K-Means + VMC) + Google OR-Tools (CVRPTW). Procesador de datos, simulador baseline manual y asistente IA con Ollama. | Llamado por el FastAPI internamente | Cuando se pide optimización industrial con time windows y capacidades. |
| **Ollama local** | LLM `llama3.1:8b` con tool calling. Mismo modelo para el chatbot y para los informes explicativos del motor Python. | `ollama serve` (puerto 11434) | Continuamente mientras el chatbot está en uso. |

**Flujo típico:**

1. El despachador escribe *"Optimiza el día con OR-Tools"* al chatbot del frontend.
2. El LLM invoca el tool `optimize_with_ortools`.
3. Next.js (`web/src/lib/python-optimizer.ts`) hace POST a `:8000/compare` con los pedidos y vehículos actuales de la DB.
4. El FastAPI llama a `src/optimizer.py` y devuelve plan + baseline + ahorros.
5. El chatbot resume el resultado en lenguaje natural; el frontend pinta la ruta con polyline real por calles vía OSRM.

Para rutas rápidas con pocas paradas (≤10) el chatbot también puede usar el tool `suggest_routes`, que resuelve un TSP simple directamente con OSRM `/trip` sin necesidad de arrancar el backend Python.

Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para el detalle técnico.

---

##  Características Principales

* **Chatbot como UI principal:** el LLM no es un añadido, es la forma natural de operar. *"Sugiere rutas para hoy"*, *"Optimiza con OR-Tools"*, *"Asigna la opción B a Juan"*, *"Mi furgo se ha averiado, 60 minutos"*.
* **Dos motores de optimización combinables:** TSP rápido (OSRM) integrado, o VRP industrial (Google OR-Tools) cuando hay restricciones estrictas. El chatbot decide o el usuario lo pide explícitamente.
* **IA Explicativa (XAI):** el motor Python no es una caja negra. Cuando se invoca, devuelve métricas frente a un plan manual baseline (ahorro de km, €, CO₂, retrasos evitados).
* **Privacidad por diseño:** Ollama corre 100% local, los datos del cliente no salen de la máquina.
* **Mapa real:** Leaflet + OSRM dibujan la ruta optimizada por calles reales, no líneas rectas.
* **Auto-gestión de averías:** ante una avería, el chatbot reoptimiza la ruta restante, mueve pedidos al día siguiente y comunica las nuevas ETAs en una sola frase.
* **Auditoría completa:** cada turno del chatbot queda registrado con sus tool calls para reproducibilidad y trazabilidad.

---

##  Stack técnico

### Frontend (`web/`)
* [Next.js 14](https://nextjs.org) (App Router) + TypeScript + Tailwind + shadcn/ui.
* [Prisma](https://www.prisma.io/) + SQLite (cambio a Postgres con una variable de entorno).
* [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) + [OSRM](https://project-osrm.org/) público para mapa y TSP rápido.
* [Nominatim](https://nominatim.openstreetmap.org/) de OSM para geocoding con caché persistente.
* [Ollama](https://ollama.com/) con `llama3.1:8b` y tool calling nativo.
* JWT en cookie `httpOnly` para auth.

### Backend de optimización (`app/` + `src/`)
* FastAPI + uvicorn como microservicio HTTP.
* `pandas` y `numpy` para procesamiento de datos.
* [Google OR-Tools](https://developers.google.com/optimization) (CVRPTW industrial) en `src/optimizer.py`.
* Heurística académica propia (K-Means + Vecino Más Cercano Ponderado) como alternativa.
* Cliente Ollama propio en `src/ai_assistant.py` para generar informes en lenguaje natural.

Arquitectura detallada en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

##  Guía de Instalación y Uso

OpenRoute necesita tres procesos en paralelo: el frontend Next.js, el microservicio Python y Ollama.

> **Atajo (Windows)**: una vez instaladas las dependencias (pasos 2A, 2B, 2C), `.\start.ps1` desde la raíz verifica los prerrequisitos y arranca FastAPI + Next.js automáticamente. Ollama se asume corriendo como servicio. Ahorra abrir 3 terminales.

### 1. Clonar el repositorio
```bash
git clone https://github.com/ComunidadIA-OS/OpenRoute.git
cd OpenRoute
```

### 2A. Ollama (LLM local) — Terminal 1

```bash
# Descargar el modelo (una sola vez, ~5GB)
ollama pull llama3.1:8b

# En Windows ya arranca como servicio. En macOS/Linux:
ollama serve
```

### 2B. Backend de optimización (FastAPI) — Terminal 2

Requisitos: **Python 3.9+**.

```bash
# Crear entorno virtual (recomendado)
python -m venv .venv
source .venv/bin/activate            # macOS / Linux
.venv\Scripts\activate               # Windows PowerShell

# Instalar dependencias
pip install -r requirements.txt

# Lanzar el microservicio FastAPI
uvicorn app.main:app --reload --port 8000
```

Verifica que está vivo: http://localhost:8000/health debería devolver `{"status":"ok",...}`.

Los endpoints disponibles:
- `GET  /health` — comprobación.
- `POST /optimize` — devuelve el plan optimizado.
- `POST /baseline` — devuelve el plan manual de referencia.
- `POST /compare` — devuelve ambos + cuadro de ahorros (el que usa el chatbot).

#### Probar el motor sin UI

```bash
# Suite unitaria (10 tests: schema, capacidad, ventanas, fallback, comparativa)
python -m unittest src/test_optimizer.py -v

# Test end-to-end con reporte comparativo en consola
python src/test_run.py
```

### 2C. Frontend conversacional (`web/`) — Terminal 3

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
- AUTORES →  [David Morales](juandmg020407@gmail.com) [Samuel Parra](parrasamuel453@gmail.com) [Giulian Peterlecean](giulian.peterlecean@gmail.com)
