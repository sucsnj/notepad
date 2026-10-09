# Project conventions

Bloco de notas online (SPA, pt-BR) com rich text, imagens e anexos. O repositório
tem **dois projetos independentes**, cada um com seu próprio `package.json`,
`node_modules` e `.env`:

- **`frontend/`** — Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, TipTap v3.
- **`backend/`** — API standalone em Fastify 5 + SQLite nativo (`node:sqlite`).

O frontend faz proxy de `/api/*` e `/uploads/*` para o backend (rewrites do Next,
`BACKEND_URL`), então o cliente usa URLs relativas (mesma origem, sem CORS).

Referências: arquitetura/estado em `PROJECT_STATUS.md`; visão de usuário em
`README.md`; regras do Next em `frontend/AGENTS.md`.

## Estrutura

```
frontend/  app/ (layout,page,globals.css,components/*)  lib/ (cn,format,types)  next.config.ts  scripts/serve.mjs
backend/   src/ (server,db,notes,attachments,uploads,http,text,types)  scripts/serve.mjs  data/ (banco+uploads)
```

- `frontend/app/components`: `NoteApp` (estado/autosave), `NoteList`, `NoteEditor`,
  `EditorToolbar`, `ThemeToggle`, `Icons`.
- `backend/src`: `server.ts` (rotas Fastify), `db.ts` (esquema + singleton
  `globalThis.__notepadDb`), `notes.ts`, `attachments.ts`, `uploads.ts`, `http.ts`,
  `text.ts`, `types.ts`. Imports no backend são **relativos**.

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
- Portas padrão: backend `3001`, frontend `3000`.

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
  sobrescrever via `ALLOWED_DEV_ORIGINS`) e os `rewrites` de `/api` e `/uploads`
  para `BACKEND_URL` (padrão `http://127.0.0.1:3001`). `PORT` é lido por
  `scripts/serve.mjs`, não pelo CLI do Next.
- Env do frontend: `PORT`, `BACKEND_URL`, `ALLOWED_DEV_ORIGINS`.
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
- Offline-first (em andamento): `frontend/lib/store/` mantém cache local em
  **IndexedDB** (`idb`); a lista é cache-first e há indicador "Sem conexão".
  Escrita offline/outbox ainda é etapa futura — ver `PROJECT_STATUS.md` seção 9.

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
