# Imagem de producao do frontend (Next.js 16).
# O entrypoint continua sendo scripts/serve.mjs (nunca `next start` direto).
#
# Usa slim (Debian) em vez de alpine: o build roda o Turbopack, que traz
# binarios nativos (SWC) e nao e tao previsivel em musl.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# O build nao recebe .env (ver .dockerignore): nenhuma variavel secreta entra
# na imagem. O que faltar aparece como "nao configurado" em runtime.
RUN node scripts/serve.mjs build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3011 \
    HOSTNAME=0.0.0.0

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY next.config.ts tsconfig.json ./
COPY scripts ./scripts
COPY public ./public
COPY --from=build /app/.next ./.next

USER node
EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3011/api/vivo').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/serve.mjs", "start"]