# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones con [SemVer](https://semver.org/lang/es/).

## [0.1.1] - 2026-11-12

### Cambiado

- El motor busca por número de vueltas y no por tiempo: con la misma entrada da siempre el mismo plan, en cualquier ordenador.
- El motor hace 16 arranques independientes con aceptación «récord a récord» y se queda con el mejor plan. Los resultados son más estables entre ejecuciones.
- El planificador responde sin emojis.

## [0.1.0] - 2026-11-10

Primera versión de la app de escritorio. Sustituye al prototipo del hackathon de mayo de 2026 (Next.js, FastAPI y Ollama en Docker), que sigue en el historial de git.

### Añadido

- Instalador para Windows. Sin Docker, sin Python y sin modelos que descargar.
- Motor de rutas en TypeScript con capacidades, franjas horarias, prioridades, jornada y pedidos sin asignar con su motivo.
- Plan manual de referencia (zonas y urgencia) para medir el ahorro.
- Importación de pedidos desde CSV y Excel con cabeceras en español o inglés.
- Mapa con rutas por calles (OSRM) y teselas de OpenFreeMap.
- Agente planificador que funciona con Claude, ChatGPT, Gemini, OpenRouter, Ollama o cualquier API compatible con OpenAI.
- Claves de API cifradas con el almacén seguro del sistema.
- Enlaces de Google Maps por conductor, hojas de ruta en PDF y plan en CSV.
- Aprobación del plan por la persona responsable.
- 30 pedidos de ejemplo en Alicante y Elche.

[0.1.1]: https://github.com/ComunidadIA-OS/OpenRoute/releases/tag/v0.1.1
[0.1.0]: https://github.com/ComunidadIA-OS/OpenRoute/releases/tag/v0.1.0
