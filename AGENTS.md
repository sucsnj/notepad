# Project conventions

Bloco de notas online (SPA) separado em **dois projetos independentes**:

- **`frontend/`** — Next.js App Router + TypeScript, Tailwind CSS v4, TipTap v3 (UI cliente, pt-BR).
- **`backend/`** — API standalone em Fastify + SQLite via `node:sqlite`.

O frontend faz proxy de `/api/*` e `/uploads/*` para o backend (rewrites do Next, `BACKEND_URL`), então o cliente usa URLs relativas (mesma origem, sem CORS).

## Comandos

- **Backend** (`cd backend`): `npm run dev` / `npm start` / `npm run typecheck`. `scripts/serve.mjs` exige Node ≥ 22.5, lê o `.env` (`--env-file`) e injeta `--experimental-sqlite` quando o Node é `< 23`. **Nunca** chame `node src/server.ts` direto: o flag do SQLite e o `.env` são tratados pelo script.
- **Frontend** (`cd frontend`): `npm run dev` / `npm run build` / `npm start` / `npm run lint` / `npm run typecheck`. Tudo passa por `scripts/serve.mjs` (bind `0.0.0.0`, `PORT` do `.env`). **Nunca** chame `next dev/build/start` direto.
- Validar antes de concluir qualquer tarefa: `npm run typecheck` (backend) e `npm run typecheck` + `npm run lint` (frontend).

## Next.js 16 (breaking changes) — frontend

- Ver `frontend/AGENTS.md`. Documentação oficial local em `node_modules/next/dist/docs/` — ler antes de escrever código (route handlers recebem `params` como `Promise`; `PORT` não é lido do `.env` pelo CLI).
- `next.config.ts` tem `allowedDevOrigins` (padrão `*.*.*.*`, `**.local`; sobrescrever via `ALLOWED_DEV_ORIGINS`) e os `rewrites` de `/api` e `/uploads` para `BACKEND_URL`.
- TipTap v3: `StarterKit` já inclui Link/Underline; `Image` é extensão separada; `Placeholder` vem de `@tiptap/extensions`. `useEditor` usa `immediatelyRender: false` (SSR).

## Banco e arquivos — backend

- SQLite via módulo nativo `node:sqlite` (`DatabaseSync`) em `backend/data/notepad.db` (WAL, FK). Esquema e singleton (globalThis) em `backend/src/db.ts`; `data/` é ignorado pelo git.
- Anexos em `backend/data/uploads/<noteId>/<storedName>`, com metadados na tabela `files`; servidos em runtime por `GET /api/attachments/[noteId]/[storedName]` e pela rota legada `GET /uploads/[noteId]/[storedName]`.
- `DATABASE_PATH`, `UPLOAD_DIR` e `MAX_UPLOAD_SIZE_MB` vêm do `.env` do backend (caminhos relativos partem da raiz do `backend/`).

## Acesso pela rede

- Binding em `0.0.0.0` nos dois processos (LAN/Tailscale/Radmin).
- Firewall (Administrador): `powershell -ExecutionPolicy Bypass -File frontend/scripts/firewall.ps1`.

## Notas de ambiente

- Servidores de fundo iniciados em um comando do shell não sobrevivem entre comandos — rode start + testes no mesmo comando quando precisar validar.
- O Windows esteve exposto a `EPERM uv_spawn powershell.exe` com `curl.exe`/`Start-Job`; preferir `Invoke-WebRequest`/`System.Net.Http` (com `UseProxy=$false`) nos testes.
