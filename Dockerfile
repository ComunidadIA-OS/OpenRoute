# Microservicio FastAPI sobre el motor VRP de OpenRoute.
#
# Construye una imagen mínima con Python 3.12 que ejecuta:
#   uvicorn app.main:app --host 0.0.0.0 --port 8000
#
# La imagen NO incluye Ollama ni el frontend Next.js — se levantan como
# servicios independientes en docker-compose.yml. Esto mantiene cada
# componente desplegable por separado (microservicios honestos).
FROM python:3.12-slim

# Variables que mejoran el comportamiento por defecto en contenedor:
#   PYTHONDONTWRITEBYTECODE — no escribir .pyc (el FS del contenedor es efímero).
#   PYTHONUNBUFFERED       — logs de Python salen sin buffer (visibles en docker logs).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Instalamos las dependencias en una capa propia para que `docker build`
# las cachee mientras solo cambia el código de la app.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos solo lo que necesita el microservicio. Los datasets viven en
# /app/data y se montan como volumen en compose para que la pyme pueda
# sustituirlos sin reconstruir la imagen.
COPY app/ ./app/
COPY src/ ./src/
COPY data/ ./data/

EXPOSE 8000

# Healthcheck contra el propio endpoint /health — el front se apoya en
# isPythonOptimizerUp() para detectar este servicio.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, sys; \
                   sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
