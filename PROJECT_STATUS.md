# PROJECT_STATUS.md — Bloco de Notas

Documentação técnica e **de estado** do projeto. Descreve a arquitetura atual, o
funcionamento de cada parte, como rodar, o modelo de dados e o andamento das
tarefas (feito / pendente).

- Última grande mudança: separação de **frontend** e **backend** em dois projetos
  independentes (ver seção [Status](#status)).
- Arquivos de convenção: `AGENTS.md` (raiz), `frontend/AGENTS.md`, `CLAUDE.md`.
- Visão de usuário/instalação: `README.md`.
- Estado das tarefas: este arquivo (seção [Status](#8-status)).

---

## 1. Visão geral

Aplicação de anotações em pt-BR (SPA) com rich text, imagens e anexos.

O repositório contém **dois projetos independentes**, cada um com seu próprio
`package.json`, `node_modules` e `.env`:

| Projeto     | Stack                                                     | Responsabilidade                          |
| ----------- | --------------------------------------------------------- | ----------------------------------------- |
| `frontend/` | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 | UI, tema, editor TipTap, autosave         |
| `backend/`  | Fastify 5, TypeScript, SQLite (`node:sqlite`)             | API REST, persistência e arquivos/anexos  |

O frontend faz **proxy** de `/api/*` e `/uploads/*` para o backend via
`rewrites` do Next (`BACKEND_URL`). Assim o cliente usa URLs relativas
(mesma origem) e **não há necessidade de CORS**.

```
Navegador ──HTTP──▶ frontend (Next.js :3000)
                       │  rewrites
                       ▼
                    backend (Fastify :3001) ──▶ SQLite (backend/data/notepad.db)
                                            └─▶ uploads (backend/data/uploads)
```

---

## 2. Estrutura de diretórios

```
notepad/
├─ AGENTS.md                 # convenções para agentes/IA (raiz)
├─ CLAUDE.md                 # importa AGENTS.md
├─ PROJECT_STATUS.md         # este arquivo (estado + arquitetura)
├─ README.md                 # visão de usuário
├─ .gitignore
├─ .vscode/settings.json
│
├─ backend/
│  ├─ package.json           # scripts: dev | start | typecheck
│  ├─ tsconfig.json          # ESM, noEmit, strict
│  ├─ .env.example / .env    # .env não versionado
│  ├─ .gitignore
│  ├─ scripts/serve.mjs      # injeta flag do SQLite + --env-file e sobe o servidor
│  ├─ public/uploads/        # anexos legados (/uploads/...)
│  ├─ data/                  # runtime, ignorado pelo git (DB + uploads)
│  └─ src/
│     ├─ server.ts           # bootstrap Fastify + rotas
│     ├─ db.ts               # conexão SQLite (singleton) + esquema
│     ├─ notes.ts            # CRUD de anotações
│     ├─ attachments.ts      # metadados e resolução de arquivos
│     ├─ uploads.ts          # gravação de uploads em disco
│     ├─ text.ts             # htmlToText (prévia/busca)
│     ├─ http.ts             # parseId / stringField
│     └─ types.ts            # tipos de domínio
│
└─ frontend/
   ├─ package.json           # scripts: dev | build | start | lint | typecheck
   ├─ next.config.ts         # allowedDevOrigins + rewrites p/ o backend
   ├─ tsconfig.json          # paths "@/*" -> "./*"
   ├─ eslint.config.mjs
   ├─ postcss.config.mjs
   ├─ .env.example / .env    # .env não versionado
   ├─ .gitignore
   ├─ AGENTS.md              # convenções do Next.js 16 (bloco auto-gerado)
   ├─ scripts/serve.mjs      # bind 0.0.0.0 + PORT do .env
   ├─ public/                # assets estáticos (sem uploads)
   ├─ lib/
   │  ├─ types.ts            # tipos espelhados do backend (client-side)
   │  ├─ cn.ts               # helper de className
   │  └─ format.ts           # datas e bytes (pt-BR)
   └─ app/
      ├─ layout.tsx          # html/body, fontes, ThemeProvider
      ├─ page.tsx            # renderiza <NoteApp/>
      ├─ globals.css         # Tailwind + estilos do editor
      └─ components/
         ├─ NoteApp.tsx      # orquestração de estado e autosave
         ├─ NoteList.tsx     # lista + busca + tema
         ├─ NoteEditor.tsx   # título, editor TipTap, anexos
         ├─ EditorToolbar.tsx# barra de formatação (inclui espaçamento de linhas)
         ├─ ThemeToggle.tsx  # alternância claro/escuro
         └─ Icons.tsx        # ícones SVG
```

---

## 3. Backend (Fastify + SQLite)

### 3.1 Boot e execução

- Entrada: `backend/src/server.ts`.
- `scripts/serve.mjs`:
  - exige **Node ≥ 22.5** (por causa de `node:sqlite`);
  - lê o `.env` via flag nativa `--env-file` (quando o arquivo existe);
  - injeta `--experimental-sqlite` quando `Node < 23`;
  - em `dev` usa `--watch`; executa o TS via `tsx`.
- Nunca rode `node src/server.ts` diretamente: o flag do SQLite e o `.env` são
  responsabilidade do `serve.mjs`.

### 3.2 Rotas

| Método | Rota                                      | Descrição                              | Respostas            |
| ------ | ----------------------------------------- | -------------------------------------- | -------------------- |
| GET    | `/api/health`                             | Healthcheck                            | `{ ok: true }`       |
| GET    | `/api/notes?q=`                           | Lista/resume anotações (busca título+conteúdo) | `{ notes }`  |
| POST   | `/api/notes`                              | Cria anotação                          | `201 { note }`       |
| GET    | `/api/notes/:id`                          | Lê anotação (com anexos)               | `{ note }` / 404     |
| PATCH  | `/api/notes/:id`                          | Atualiza título/conteúdo               | `{ note }` / 404     |
| DELETE | `/api/notes/:id`                          | Remove anotação e seus arquivos        | `{ ok: true }` / 404 |
| POST   | `/api/upload`                             | Upload multipart (`noteId`, `file`)    | `{ attachment }` 201 |
| DELETE | `/api/upload?noteId=&attachmentId=`       | Remove um anexo                        | `{ ok: true }`       |
| GET    | `/api/attachments/:noteId/:storedName`    | Serve o arquivo (inline/attachment)    | arquivo / 404        |
| GET    | `/uploads/:noteId/:storedName`            | Igual acima (URL legada)               | arquivo / 404        |

- Corpo JSON limitado por `MAX_JSON_SIZE_MB` (padrão 10 MB).
- Upload limitado por `MAX_UPLOAD_SIZE_MB` (padrão 20 MB); excesso → `413`.
- Anexos validados no banco antes de servir; imagens com `inline`, demais com
  `attachment` e `filename*` UTF-8.
- CORS: `origin = CORS_ORIGIN` (lista separada por vírgula) ou qualquer origem
  quando vazio. Irrelevante quando se usa o proxy do frontend.

### 3.3 Variáveis de ambiente (backend/.env)

| Variável             | Padrão               | Descrição                                     |
| -------------------- | -------------------- | --------------------------------------------- |
| `PORT`               | `3001`               | Porta HTTP                                    |
| `HOST`               | `0.0.0.0`            | Host de bind                                  |
| `DATABASE_PATH`      | `./data/notepad.db`  | Banco SQLite (relativo a `backend/`)          |
| `UPLOAD_DIR`         | `./data/uploads`     | Diretório de anexos (relativo a `backend/`)   |
| `MAX_UPLOAD_SIZE_MB` | `20`                 | Limite por arquivo                            |
| `MAX_JSON_SIZE_MB`   | `10`                 | Limite do corpo JSON                          |
| `CORS_ORIGIN`        | (vazio)              | Origens permitidas (vazio = qualquer)         |

### 3.4 Modelo de dados (SQLite)

`notes`
| coluna         | tipo    | notas                          |
| -------------- | ------- | ------------------------------ |
| id             | INTEGER | PK autoincrement               |
| title          | TEXT    | título da anotação             |
| content        | TEXT    | HTML do TipTap                 |
| text_content   | TEXT    | texto puro (busca/prévia)      |
| created_at     | TEXT    | `datetime('now')`              |
| updated_at     | TEXT    | `datetime('now')`              |

`files`
| coluna        | tipo    | notas                               |
| ------------- | ------- | ----------------------------------- |
| id            | INTEGER | PK autoincrement                    |
| note_id       | INTEGER | FK → notes(id)                      |
| original_name | TEXT    | nome original do arquivo            |
| stored_name   | TEXT    | nome em disco (timestamp + hash)    |
| mime_type     | TEXT    | tipo MIME                            |
| web_path      | TEXT    | URL interna do anexo                |
| size          | INTEGER | tamanho em bytes                    |
| kind          | TEXT    | `image` ou `file`                   |
| created_at    | TEXT    | `datetime('now')`                   |

- PRAGMAs: `journal_mode = WAL`, `foreign_keys = ON`.
- Índices: `idx_notes_updated_at`, `idx_files_note_id`.
- Conexão singleton em `globalThis.__notepadDb`.
- `@/*` não se aplica ao backend (imports relativos).

### 3.5 Anexos no disco

- Novos uploads: `backend/data/uploads/<noteId>/<storedName>`.
- Compatibilidade: arquivos antigos em `backend/public/uploads` ainda são lidos.
- URL nova: `/api/attachments/<noteId>/<storedName>` (URLs legadas `/uploads/...`
  são reescritas na leitura da nota).

---

## 4. Frontend (Next.js)

### 4.1 Proxy para o backend

`frontend/next.config.ts` define `rewrites`:

- `/api/:path*` → `${BACKEND_URL}/api/:path*`
- `/uploads/:path*` → `${BACKEND_URL}/uploads/:path*`

Assim, todo `fetch("/api/...")` do cliente chega ao backend pela mesma origem.
`BACKEND_URL` padrão: `http://127.0.0.1:3001`.

### 4.2 Componentes

- **`NoteApp`** — estado global: lista, busca (debounce 250 ms), nota ativa,
  salvamento automático (debounce 800 ms via `PATCH`), criação, exclusão
  (com `window.confirm`) e visão mobile (`list`/`editor`).
- **`NoteList`** — busca, botão de nova anotação, itens com prévia e contagem de
  anexos, alternância de tema.
- **`NoteEditor`** — título, anexos (chips com download/remoção), editor TipTap,
  upload de imagem/arquivo e rodapé com status de salvamento / voltar / excluir.
- **`EditorToolbar`** — undo/redo, títulos H1–H3, negrito/itálico/sublinhado/
  tachado/código, espaçamento de linhas, listas, citação, link, imagem, anexo.
- **`ThemeToggle`** — `next-themes` (claro/escuro/sistema).

### 4.3 Editor (TipTap v3)

- `StarterKit` já inclui Link e Underline; `Image` é extensão separada
  (`allowBase64: false`); `Placeholder` vem de `@tiptap/extensions`.
- `useEditor({ immediatelyRender: false })` por causa de SSR.
- Extensão custom `lineHeight` (atributos globais em `paragraph`/`heading`).
  Presets (evitando sobreposição de linhas, `line-height` nunca < 1):
  - Padrão `""` (CSS `1.2`), Compacto `1.0`, Normal `1.1`, Amplo `1.4`, Duplo `1.8`.
  - `renderHTML` faz `Math.max(valor, 1)` para sanear notas antigas.

### 4.4 Variáveis de ambiente (frontend/.env)

| Variável               | Padrão                    | Descrição                                         |
| ---------------------- | ------------------------- | ------------------------------------------------- |
| `PORT`                 | `3000`                    | Porta HTTP do Next (lida por `scripts/serve.mjs`) |
| `BACKEND_URL`          | `http://127.0.0.1:3001`   | Destino do proxy `/api` e `/uploads`              |
| `ALLOWED_DEV_ORIGINS`  | `*.*.*.*`, `**.local`     | Origens extras permitidas em dev (HMR)            |

---

## 5. Como rodar

### 5.1 Desenvolvimento (dois terminais)

```powershell
# Terminal 1 — backend
cd backend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3001

# Terminal 2 — frontend
cd frontend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3000
```

### 5.2 Produção (local)

```powershell
cd backend;  npm start          # Fastify via tsx
cd frontend; npm run build; npm start
```

> O frontend precisa do build (`npm run build`) antes de `npm start`.

### 5.3 Validação

```powershell
cd backend;  npm run typecheck
cd frontend; npm run build; npm run typecheck; npm run lint
```

---

## 6. Acesso pela rede (LAN/Tailscale/Radmin)

- Ambos os processos fazem bind em `0.0.0.0`.
- Acesso externo é feito pela porta do **frontend** (o proxy encaminha `/api`).
- Firewall (PowerShell como Administrador):
  `powershell -ExecutionPolicy Bypass -File frontend/scripts/firewall.ps1`

---

## 7. Decisões de arquitetura

- **Dois projetos independentes** (sem workspaces na raiz): cada pasta instala e
  roda sozinha, conforme pedido.
- **Backend em Fastify**: roteamento simples, plugins oficiais (`cors`,
  `multipart`) e tipagem.
- **Proxy no frontend** em vez de CORS no cliente: mantém URLs relativas no HTML
  das notas e nos anexos, evitando reescrever URLs absolutas no conteúdo.
- **Backend executa TypeScript via `tsx`** (sem etapa de build/dist), com
  `tsc --noEmit` apenas para checagem de tipos.
- **`node:sqlite` nativo** (sem dependência externa como better-sqlite3).
- **Compatibilidade legada** mantida para `/uploads/...` e `backend/public/uploads`.
- **`data/` preservado** e movido para `backend/data/` durante a separação.

---

## 8. Status

### 8.1 Concluído nesta entrega

- [x] Separação em `frontend/` e `backend/` com `package.json`, `.env`,
      `.gitignore` e scripts próprios.
- [x] API migrada de route handlers do Next para **Fastify** standalone
      (`backend/src/server.ts`), com todas as rotas equivalentes.
- [x] Upload adaptado para `@fastify/multipart`.
- [x] Proxy de `/api` e `/uploads` no `next.config.ts` do frontend.
- [x] `data/` (banco + uploads) movido para `backend/data/`.
- [x] `README.md`, `AGENTS.md` e `frontend/AGENTS.md` atualizados.
- [x] Artefatos órfãos da raiz removidos (`.next`, `node_modules`, `next-env.d.ts`,
      `tsconfig.tsbuildinfo`, `.env`, `package-lock.json`).
- [x] Typecheck (backend), build + typecheck + lint (frontend) verdes.
- [x] Smoke test com os dois servidores: health, proxy, CRUD de notas, upload,
      download de anexo e remoção (incluindo limpeza de arquivos).

### 8.2 Pendências / próximos passos

- [ ] **Commit**: as mudanças estão no working tree, ainda não commitadas.
- [ ] Opcional: CI (typecheck/lint/build) por projeto.
- [ ] Opcional: testes automatizados (unitários/HTTP) para o backend.
- [ ] Opcional: etapa de build de produção para o backend (hoje roda via `tsx`).
- [ ] Opcional: extrair um pacote `shared/` para os tipos duplicados
      (`backend/src/types.ts` ↔ `frontend/lib/types.ts`).

### 8.3 Observações / riscos conhecidos

- Requer **Node ≥ 22.5** no backend (`node:sqlite`). Em Node 22.5–22.12 o
  `serve.mjs` injeta `--experimental-sqlite`.
- O `typecheck` do frontend depende dos tipos gerados pelo Next; rode
  `npm run build` (ou `next typegen`) ao menos uma vez após clonar.
- `MAX_JSON_SIZE_MB` (10 MB) limita o tamanho do HTML da nota; ajuste se
  necessário.
- Em produção, `DATABASE_PATH` e `UPLOAD_DIR` devem apontar para volumes
  persistentes; o processo que serve o anexo precisa acessar os mesmos arquivos
  e banco.
