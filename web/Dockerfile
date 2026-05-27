# Frontend conversacional Next.js de OpenRoute.
#
# Build multi-stage:
#   1. deps    — instala dependencias (cacheado mientras package.json no cambia).
#   2. builder — genera Prisma Client + build de producción + SIEMBRA la DB.
#   3. runner  — imagen ligera que solo lleva el output standalone + Prisma.
#
# La DB se siembra durante el build (no en runtime) para evitar tener que
# arrastrar tsx/prisma como dependencias del runtime, y para que el primer
# `docker compose up` arranque al instante con los 47 pedidos demo + usuarios.

# ─── Stage 1: dependencies ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# libc6-compat: Prisma Engine usa OpenSSL; Alpine necesita esto.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ─── Stage 2: builder ───────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# El generate de Prisma debe correr antes del build para que TypeScript
# encuentre los tipos del cliente. Los engines de Prisma se descargan
# durante este paso y van a /app/node_modules/.prisma.
RUN npx prisma generate

# Variables dummy solo para que el build no falle por env vars del
# código que tira valores en build time. Los reales se inyectan en
# tiempo de ejecución desde compose.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="file:/app/prisma/dev.db.baked" \
    JWT_SECRET="build-time-dummy-rotate-at-runtime" \
    OLLAMA_BASE_URL="http://ollama:11434" \
    OPTIMIZER_BASE_URL="http://optimizer:8000"

RUN npm run build

# Sembrar la DB durante el build: aplicamos migraciones contra dev.db.baked
# y ejecutamos el seed con los usuarios demo + 47 pedidos. El fichero
# resultante se copia luego al runner. En runtime, el entrypoint solo lo
# clona al volumen si no hay DB previa — primer `docker compose up` arranca
# con admin/admin123 ya disponible, y reinicios posteriores preservan los
# cambios del operador.
RUN npx prisma migrate deploy && \
    npx tsx prisma/seed.ts && \
    echo "[builder] DB seedeada en /app/prisma/dev.db.baked"

# ─── Stage 3: runner ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Usuario no-root para reducir blast radius si una vuln en next/node
# permite escapar a shell.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiamos el output standalone, los estáticos públicos y los assets
# generados por el build.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Schema de Prisma (por si el cliente lo necesita en runtime) + cliente
# generado. Sin migraciones porque la DB ya viene seedeada del builder.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# DB seedeada en build time. El entrypoint la clona al volumen montado
# en /app/prisma/dev.db si éste está vacío.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/dev.db.baked /app/dev.db.baked

# Entrypoint trivial: clona la DB baked si el volumen está vacío, exec next.
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --quiet -O- http://localhost:3000/login >/dev/null 2>&1 || exit 1
# /login responde 200 sin sesión (la app está sana). El healthcheck previo
# pegaba a /api/auth/me que devuelve 401 cuando no hay cookie → wget --spider
# lo marcaba como fallo aunque la app estaba perfectamente arriba.

ENTRYPOINT ["./docker-entrypoint.sh"]
