# Project conventions

Bloco de notas online (SPA, pt-BR) com rich text, imagens e anexos. O repositório
tem **dois projetos independentes**, cada um com seu próprio `package.json`,
`node_modules` e `.env`:

- **`frontend/`** — Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, TipTap v3.
- **`backend/`** — API standalone em Fastify 5 + SQLite nativo (`node:sqlite`).

O frontend faz proxy de `/api/*` e `/uploads/*` para o backend (Route Handlers em
`app/api/[...slug]` e `app/uploads/[...slug]`, destino `BACKEND_URL`), então o
cliente usa URLs relativas (mesma origem, sem CORS). O proxy injeta o header
`Authorization` do backend **no servidor** — o token não vai ao navegador.

Referências: arquitetura/estado em `PROJECT_STATUS.md`; visão de usuário em
`README.md`; regras do Next em `frontend/AGENTS.md`.

## Estrutura

```
frontend/  app/ (layout,page,globals.css,entrar,api,*,uploads,components/*)  lib/ (cn,format,types,proxy,session,store/*)  proxy.ts  next.config.ts  scripts/serve.mjs
backend/   src/ (server,db,notes,attachments,uploads,http,text,auth,types)  scripts/serve.mjs  data/ (banco+uploads)  Dockerfile  compose.yaml
```

- `frontend/app/components`: `NoteApp` (estado/autosave), `NoteList`, `NoteEditor`,
  `EditorToolbar`, `ConflictDialog`, `LogoutButton`, `ThemeToggle`, `Icons`.
- `backend/src`: `server.ts` (rotas Fastify + guarda de token), `db.ts` (esquema
  + singleton `globalThis.__notepadDb`), `notes.ts`, `attachments.ts`,
  `uploads.ts`, `http.ts`, `text.ts`, `auth.ts`, `types.ts`. Imports no backend
  são **relativos**.

## Comandos

- **Backend** (`cd backend`): `npm run dev` / `npm start` / `npm run typecheck`.
  `scripts/serve.mjs` exige Node ≥ 22.5, lê o `.env` (`--env-file`) e injeta
  `--experimental-sqlite` quando o Node é `< 23`. Executa TS via `tsx` (sem build).
  **Nunca** chame `node src/server.ts` direto.
- **Frontend** (`cd frontend`): `npm run dev` / `npm run build` / `npm start` /
  `npm run lint` / `npm run typecheck`. Tudo passa por `scripts/serve.mjs`
  (bind `0.0.0.0`, `PORT` do `.env`). **Nunca** chame `next dev/build/start` direto.
- Validar antes de concluir qualquer tarefa: `npm run typecheck` (backend) e
  `npm run typecheck` + `npm run lint` (frontend). O `typecheck` do frontend
  depende de tipos gerados — rode `npm run build` uma vez após clonar.
- Portas padrão: backend `3010`, frontend `3011`.

## API (backend)

| Método | Rota                                    | Descrição                                   |
| ------ | --------------------------------------- | ------------------------------------------- |
| GET    | `/api/health`                           | `{ ok: true }`                              |
| GET    | `/api/notes?q=`                         | Lista/resume anotações (busca)              |
| POST   | `/api/notes`                            | Cria (`201 { note }`)                       |
| GET    | `/api/notes/:id`                        | Lê nota com anexos                          |
| PATCH  | `/api/notes/:id`                        | Atualiza título/conteúdo                    |
| DELETE | `/api/notes/:id`                        | Remove nota + arquivos                      |
| POST   | `/api/upload`                           | Multipart `noteId` + `file` → `{ attachment }` |
| DELETE | `/api/upload?noteId=&attachmentId=`     | Remove anexo                                |
| GET    | `/api/attachments/:noteId/:storedName`  | Serve arquivo (inline p/ imagem)            |
| GET    | `/uploads/:noteId/:storedName`          | URL legada (mesmo handler)                  |

- JSON limitado por `MAX_JSON_SIZE_MB` (10 MB); upload por `MAX_UPLOAD_SIZE_MB`
  (20 MB, excesso → `413`); imagens `inline`, demais `attachment`.
- CORS via `CORS_ORIGIN` (lista por vírgula; vazio = qualquer). Desnecessário no
  fluxo com o proxy do frontend.
- **Auth (obrigatório)**: `API_TOKEN` no backend + `BACKEND_TOKEN` (mesmo valor)
  no frontend + `APP_PASSWORD` na interface. **Falha fechada**: sem `API_TOKEN` a
  API recusa tudo (`503`), sem `BACKEND_TOKEN` o proxy recusa (`503`) e sem
  `APP_PASSWORD` ninguém consegue entrar (toda sessão é inválida). Só
  `/api/health` é pública no backend. Nunca exponha `BACKEND_TOKEN` ao cliente.

## Banco e arquivos — backend

- SQLite via módulo nativo `node:sqlite` (`DatabaseSync`) em
  `backend/data/notepad.db` (WAL, FK). Esquema/singleton em `backend/src/db.ts`;
  `data/` é ignorado pelo git.
- Tabelas: `notes` (id, title, content HTML, text_content, created_at,
  updated_at) e `files` (id, note_id FK, original_name, stored_name, mime_type,
  web_path, size, kind, created_at).
- Anexos em `backend/data/uploads/<noteId>/<storedName>`, com metadados na tabela
  `files`; URLs legadas em `/uploads/...` e arquivos antigos em
  `backend/public/uploads` continuam suportados.
- `DATABASE_PATH`, `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB` e `MAX_JSON_SIZE_MB` vêm do
  `.env` do backend (caminhos relativos partem da raiz do `backend/`).

## Frontend

- `next.config.ts` tem `allowedDevOrigins` (padrão `*.*.*.*`, `**.local`;
  sobrescrever via `ALLOWED_DEV_ORIGINS`) — o proxy de `/api` e `/uploads` **não**
  é mais rewrite: são Route Handlers em `app/api/[...slug]` e
  `app/uploads/[...slug]`, com destino `BACKEND_URL` (padrão
  `http://127.0.0.1:3010`). `PORT` é lido por `scripts/serve.mjs`, não pelo CLI.
- Env do frontend: `PORT`, `BACKEND_URL`, `BACKEND_TOKEN`, `APP_PASSWORD`,
  `ALLOWED_DEV_ORIGINS`.
- Ver `frontend/AGENTS.md` — documentação oficial do Next fica em
  `node_modules/next/dist/docs/`; ler antes de escrever código (route handlers
  recebem `params` como `Promise`).
- TipTap v3: `StarterKit` já inclui Link/Underline; `Image` é extensão separada;
  `Placeholder` vem de `@tiptap/extensions`. `useEditor` usa
  `immediatelyRender: false` (SSR).
- Editor: extensão custom de `lineHeight` (atributos globais em
  `paragraph`/`heading`). Presets em `EditorToolbar.tsx`: Padrão `""` (CSS `1.2`),
  Compacto `1.0`, Normal `1.1`, Amplo `1.4`, Duplo `1.8`; `NoteEditor.tsx` faz
  `Math.max(valor, 1)` no `renderHTML` para sanear notas antigas.
- `NoteApp.tsx` gerencia estado, busca (debounce 250 ms) e autosave
  (debounce 800 ms via `PATCH`).
- Offline-first (Etapas 1–5 concluídas): `frontend/lib/store/` mantém cache local
  em **IndexedDB** (`idb`, v4) — `db.ts` (stores `notes`/`meta`/`outbox`/
  `conflicts`/`blobs`), `notesStore.ts` (cache + mapeamento de IDs +
  `serverUpdatedAt`), `outbox.ts` (fila: `create`/`update`/`delete`/`upload`/
  `detach`), `notesRepository.ts` (leitura/escrita + conflitos),
  `conflicts.ts`, `blobs.ts` (anexos locais com URL `notepad-local://<id>`),
  `attachmentsRepository.ts` e `sync.ts` (`flushOutbox`). A lista é cache-first,
  há indicador "Sem conexão" e a escrita offline enfileira operações. A outbox é
  drenada em `NoteApp.syncNow()` (abertura, `online`, foco, a cada 30 s). Antes de
  cada `PATCH`, `sync.ts` faz `GET` e compara `serverUpdatedAt`; divergência vira
  conflito e abre o `ConflictDialog` (manter local / servidor / ambos). Anexos
  offline sobem como `upload` e as URLs locais são reescritas para as do servidor
  (recarregando o editor via `editorEpoch`). Ver `PROJECT_STATUS.md` seção 9.

## Backend em container (Docker)

- `backend/Dockerfile` (node:24-alpine, multi-stage) e `backend/compose.yaml`.
  O entrypoint continua sendo `scripts/serve.mjs` (nunca `node src/server.ts`).
- `cd backend`: `docker compose up -d --build`, `docker compose logs -f`,
  `docker compose down`.
- **Persistência**: bind mount `./data:/app/data` (SQLite + `data/uploads`).
  Para usar volume nomeado, troque o mount e declare `volumes: { notepad-data: }`.
  Alternativa ao bind mount em Linux: `sudo chown -R 1000:1000 backend/data`
  (o container roda como `node`). Pare o backend do host antes (porta 3010).
- `tsx` é dependência de **runtime** (`serve.mjs` usa `--import tsx`); não pode
  ficar em `devDependencies`, senão `npm ci` da imagem quebra.
- Variáveis do compose: `BIND_ADDRESS` (padrão `127.0.0.1`; use `0.0.0.0` para
  LAN) e `TUNNEL_TOKEN`.
- O env do container vem do `.env` (`env_file`) + `DATABASE_PATH`/`UPLOAD_DIR`
  apontando para o volume. Mudou o `.env`? `docker compose up -d --force-recreate`.

## Frontend em container (Docker)

- `frontend/Dockerfile` (node:24-**slim**, 4 estágios: `deps`, `prod-deps`,
  `build`, `runtime`) e `frontend/compose.yaml`. Slim, não alpine: o build roda o
  Turbopack (binários nativos do SWC).
- `cd frontend`: `docker compose up -d --build`.
- **Stateless** (sem volume). Segredos **não** entram na imagem (`.dockerignore`
  exclui `.env`): `BACKEND_URL`, `BACKEND_TOKEN` e `APP_PASSWORD` chegam em
  runtime por `env_file`.
- **No container, `127.0.0.1` seria o próprio container**: o compose usa
  `DOCKER_BACKEND_URL` (padrão `http://host.docker.internal:3010`, com
  `extra_hosts: host-gateway`). `BACKEND_URL` do `.env` vale para o host.
- `GET /api/vivo` é o HEALTHCHECK (sem auth e sem depender do backend).
- O `package-lock.json` foi regerado em Linux; se `npm ci` falhar no container
  com "lock file out of sync", regere com:
  `docker run --rm -v "${PWD}:/app" -w /app node:24-slim npm install --package-lock-only`.
- Túnel: `docker compose --profile tunnel up -d` (aponta para o **frontend**;
  o backend fica interno, protegido pelo `API_TOKEN`).
- Obrigatório: defina `API_TOKEN` no `backend/.env` e o mesmo valor em
  `BACKEND_TOKEN` no `frontend/.env`; para expor a interface, `APP_PASSWORD`.
  Sem `API_TOKEN`, quem tiver a URL lê/edita/apaga as anotações (CORS não protege
  clientes não-browser).
- `GET /api/vivo` responde `{ ok: true }` sem auth e sem tocar no backend —
  é o HEALTHCHECK do container do frontend.

## Acesso pela rede

- Binding em `0.0.0.0` nos dois processos (LAN/Tailscale/Radmin); acesse pela
  porta do frontend.
- Firewall (Administrador): `powershell -ExecutionPolicy Bypass -File frontend/scripts/firewall.ps1`.

## Notas de ambiente

- Servidores de fundo iniciados em um comando do shell não sobrevivem entre
  comandos — rode start + testes no mesmo comando quando precisar validar.
- O Windows esteve exposto a `EPERM uv_spawn powershell.exe` com `curl.exe`/
  `Start-Job`; preferir `Invoke-WebRequest`/`System.Net.Http` (com
  `UseProxy=$false`) nos testes.
