#!/bin/sh
# Entrypoint del contenedor del frontend.
#
# En cada arranque:
#   1. Si la DB SQLite no existe en el volumen montado, aplica migraciones
#      y siembra los usuarios + pedidos demo (admin/admin123, etc.).
#   2. Si ya existía, deja el contenido tal cual — preservamos cambios
#      del operador entre reinicios.
#
# Tras eso, exec al server standalone de Next.js. El `exec` asegura que
# Next.js sea PID 1 y reciba SIGTERM correctamente cuando docker compose
# down apague el contenedor.

set -e

DB_FILE="/app/prisma/dev.db"

if [ ! -f "$DB_FILE" ]; then
    echo "[entrypoint] Primera ejecución: aplicando migraciones y sembrando datos demo..."
    # Las migraciones están en /app/prisma/migrations (copiadas en el builder).
    # Usamos `prisma migrate deploy` (production-safe, no interactivo) en lugar
    # de `migrate dev` (que esperaría confirmación).
    npx prisma migrate deploy
    # El seed.ts es TypeScript; lo ejecutamos con tsx que ya está en deps.
    # Si falla, no abortamos — la app sigue siendo usable sin datos demo.
    npx tsx prisma/seed.ts || echo "[entrypoint] Seed falló (no crítico); continúa el arranque."
    echo "[entrypoint] Base de datos lista. Usuario demo: admin / admin123."
else
    echo "[entrypoint] DB existente detectada en $DB_FILE; no se re-siembra."
fi

# Next.js standalone server.
exec node server.js
