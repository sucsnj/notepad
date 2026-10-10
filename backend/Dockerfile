# Imagem de produção do backend (Fastify + node:sqlite).
# O entrypoint continua sendo scripts/serve.mjs (nunca `node src/server.ts`).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
COPY public ./public

# /app/data recebe o volume (banco SQLite + uploads).
RUN mkdir -p /app/data/uploads && chown -R node:node /app

USER node
EXPOSE 3010

# O compose/publica a porta 3010; o container sempre escuta nela.
ENV PORT=3010 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/notepad.db \
    UPLOAD_DIR=/app/data/uploads

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3010/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/serve.mjs", "start"]