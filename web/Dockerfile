# Frontend conversacional Next.js de OpenRoute.
#
# Build multi-stage:
#   1. deps   — instala dependencias (cacheado mientras package.json no cambia).
#   2. builder — genera Prisma Client + build de producción.
#   3. runner  — imagen ligera que solo lleva el output standalone + Prisma.
#
# El binario standalone de Next.js incluye solo lo necesario para servir
# la app: ~150 MB en lugar de ~1.2 GB con node_modules entero. Crítico
# para que el jurado pueda descargarse el repo y arrancar todo rápido.

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
    DATABASE_URL="file:/app/prisma/dev.db" \
    JWT_SECRET="build-time-dummy-rotate-at-runtime" \
    OLLAMA_BASE_URL="http://ollama:11434" \
    OPTIMIZER_BASE_URL="http://optimizer:8000"

RUN npm run build

# ─── Stage 3: runner ────────────────────────────────────────
# Para usar el output standalone, Next.js debe tener
# `output: 'standalone'` en next.config. Lo configuramos en este commit.
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

# Prisma necesita el schema y el binario del cliente en runtime para que
# las migraciones y el cliente funcionen.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Entrypoint propio que migra la DB y siembra usuarios demo en el
# primer arranque. Los siguientes arranques solo hacen `next start`.
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --quiet --spider http://localhost:3000/api/auth/me || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
