# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Web（Next standalone） ─────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

RUN apk add --no-cache python3 bash \
  && addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /data && chown -R nextjs:nodejs /data /app
USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ── Worker（独立任务执行器，需 PostgreSQL） ───────────────────────
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 bash \
  && addgroup -g 1001 -S nodejs && adduser -S worker -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle

RUN mkdir -p /data && chown -R worker:nodejs /data /app
USER worker
ENV DATA_DIR=/data
CMD ["npx", "tsx", "src/worker/index.ts"]
