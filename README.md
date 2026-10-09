# Bloco de Notas

Aplicação de anotações em pt-BR, separada em **dois projetos independentes** que rodam em processos distintos:

- **`frontend/`** — Next.js (App Router) + TypeScript + Tailwind CSS v4 + TipTap v3 (SPA).
- **`backend/`** — API standalone em Fastify + SQLite via `node:sqlite`.

O frontend faz proxy de `/api/*` e `/uploads/*` para o backend (configurável por `BACKEND_URL`), então as chamadas do cliente permanecem em mesma origem (sem necessidade de CORS).

## Requisitos

- Node.js **22.5 ou superior** (o backend usa o módulo nativo `node:sqlite`). Node 23+ recomendado; em Node 22.5–22.12 o script injeta automaticamente o flag `--experimental-sqlite`.
- npm.

## Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3001
```

- `npm run dev` — sobe o Fastify com reload (via `tsx`).
- `npm start` — mesmo servidor, sem watch.
- `npm run typecheck` — valida os tipos.

Variáveis (`.env`): `PORT` (3001), `HOST` (0.0.0.0), `DATABASE_PATH` (`./data/notepad.db`), `UPLOAD_DIR` (`./data/uploads`), `MAX_UPLOAD_SIZE_MB` (20), `CORS_ORIGIN`.

## Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3000
```

- `npm run dev` / `npm run build` / `npm start` — passam por `scripts/serve.mjs` (lê `PORT` do `.env`, bind em `0.0.0.0`).
- `npm run lint`, `npm run typecheck`.

Variáveis (`.env`): `PORT` (3000), `BACKEND_URL` (`http://127.0.0.1:3001`), `ALLOWED_DEV_ORIGINS`.

## Dados e anexos

O banco SQLite fica em `backend/data/notepad.db` e os uploads novos em `backend/data/uploads` (ambos ignorados pelo Git). Os caminhos podem ser alterados com `DATABASE_PATH` e `UPLOAD_DIR`. O endpoint dinâmico `GET /api/attachments/:noteId/:storedName` valida os anexos no banco e os serve em runtime; URLs legadas em `/uploads/...` continuam válidas.

Em produção, use volumes persistentes para `DATABASE_PATH` e `UPLOAD_DIR`, aponte `BACKEND_URL` do frontend para o backend e exponha cada processo na porta desejada.

## Acesso pela rede

Os dois servidores fazem bind em `0.0.0.0` (LAN/Tailscale/Radmin). Para liberar a porta no Firewall do Windows (executar como Administrador):

```powershell
powershell -ExecutionPolicy Bypass -File frontend/scripts/firewall.ps1
```
