#!/bin/sh
# Entrypoint del contenedor del frontend.
#
# La DB SQLite se siembra durante el build de la imagen (ver Dockerfile),
# por lo que aquí solo necesitamos:
#   1. Si el volumen montado en /app/prisma NO tiene dev.db, copiar la
#      versión seedeada (/app/dev.db.baked) — primer arranque del jurado.
#   2. Si ya existe, dejarla intacta — preservamos los cambios del
#      operador entre reinicios.
#
# Después, exec a `node server.js` para que Next.js sea PID 1 y reciba
# SIGTERM correctamente cuando docker compose down apague el contenedor.

set -e

DB_FILE="/app/prisma/dev.db"
BAKED="/app/dev.db.baked"

if [ ! -f "$DB_FILE" ]; then
    if [ -f "$BAKED" ]; then
        echo "[entrypoint] Primera ejecución: clonando DB seedeada al volumen."
        cp "$BAKED" "$DB_FILE"
        echo "[entrypoint] Base de datos lista. Login demo: admin / admin123."
    else
        echo "[entrypoint] WARN: no hay dev.db ni dev.db.baked. Arrancando sin DB."
    fi
else
    echo "[entrypoint] DB existente detectada en $DB_FILE; no se re-siembra."
fi

# Next.js standalone server.
exec node server.js
