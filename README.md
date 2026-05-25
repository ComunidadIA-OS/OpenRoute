#  OpenRoute
**IA abierta y explicable para la optimización logística de última milla en pymes.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![Streamlit App](https://img.shields.io/badge/Streamlit-FF4B4B?logo=streamlit&logoColor=white)](https://streamlit.io)
[![Hackathon](https://img.shields.io/badge/Hackathon-IA_Responsable_y_Abierta-000000?logo=github)](https://github.com/ComunidadIA-OS)

---

##  Visión del Proyecto

El problema real de la logística local no es calcular una ruta de A a B. El verdadero reto para las pymes es **ordenar decenas de entregas con restricciones de tiempo y capacidad, repartirlas entre vehículos y justificar esas decisiones de forma transparente**. 

**OpenRoutePyME** democratiza las capacidades de planificación que usan los grandes operadores. Convertimos una simple lista de pedidos (CSV) en rutas optimizadas, **explicables en lenguaje natural** y totalmente accionables desde una interfaz unificada. 

---

##  Características Principales

*  **Carga Simple:** Importación directa de pedidos mediante archivos CSV. Cero integraciones complejas.
*  **IA Explicativa (XAI):** No somos una caja negra. El sistema explica *por qué* agrupó ciertas entregas y qué restricciones influyeron en la decisión final.
*  **Rutas Integradas Nativas:** El repartidor y el gestor visualizan la ruta creada de extremo a extremo directamente dentro de la aplicación, sin saltos a Google Maps u otras herramientas externas.
*  **Gestión de Restricciones:** Soporte para prioridades (alta/media/baja), ventanas horarias y capacidad de vehículos.
*  **Métricas de Impacto:** Comparativa clara entre la ruta manual y la optimizada (ahorro de km y tiempo).

---

##  Arquitectura y Tecnologías

El proyecto está diseñado para ser ligero, reproducible y fácil de desplegar:

* **Interfaz:** [Streamlit](https://streamlit.io/) (Carga de datos, controles y dashboard de resultados).
* **Procesamiento de Datos:** `pandas` (Limpieza, validación y cálculo de métricas).
* **Motor de Optimización:** [Google OR-Tools](https://developers.google.com/optimization) / Algoritmia propia.
* **Geolocalización y Mapas:** `Folium` / `Pydeck` (Renderizado del mapa interactivo).
* **IA Generativa:** Modelo LLM de código abierto para la generación de explicaciones en lenguaje natural.

---

##  Guía de Instalación y Uso (Demo)

Sigue estos pasos para ejecutar la prueba de concepto (TRL3) en tu máquina local.

### 1. Clonar el repositorio
```bash
git clone [https://github.com/ComunidadIA-OS/tu-repo-openroutepyme.git](https://github.com/ComunidadIA-OS/tu-repo-openroutepyme.git)
cd tu-repo-openroutepyme
