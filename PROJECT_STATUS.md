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

O frontend faz **proxy** de `/api/*` e `/uploads/*` para o backend via Route
Handlers do Next (`BACKEND_URL`). Assim o cliente usa URLs relativas (mesma
origem) e **não há necessidade de CORS**. O proxy também injeta o token de API
(`BACKEND_TOKEN`) no servidor — o token nunca chega ao navegador.

```
Navegador ──HTTP──▶ frontend (Next.js :3011)
                       │  Route Handlers + header Authorization
                       ▼
                    backend (Fastify :3010) ──▶ SQLite (backend/data/notepad.db)
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
│  ├─ .dockerignore
│  ├─ Dockerfile              # imagem de produção (node:24-alpine, multi-stage)
│  ├─ compose.yaml            # backend + perfil "tunnel" (cloudflared)
│  ├─ scripts/serve.mjs      # injeta flag do SQLite + --env-file e sobe o servidor
│  ├─ public/uploads/        # anexos legados (/uploads/...)
│  ├─ data/                  # runtime, ignorado pelo git (DB + uploads)
│  └─ src/
│     ├─ server.ts           # bootstrap Fastify + rotas + guarda de token
│     ├─ auth.ts             # token de API (Bearer) com comparação constante
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
   ├─ next.config.ts         # allowedDevOrigins (proxy do backend e' Route Handler)
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
   │  ├─ format.ts           # datas e bytes (pt-BR)
   │  ├─ proxy.ts            # proxy do servidor -> backend (injeta o token)
   │  ├─ session.ts          # senha (APP_PASSWORD) + token do cookie
   │  └─ store/              # cache local offline-first (IndexedDB)
   │     ├─ db.ts            # schema do IndexedDB (notes/meta/outbox/conflicts/blobs)
   │     ├─ notesStore.ts    # cache de notas: salvar, ler, buscar, meta
   │     ├─ outbox.ts        # fila de operações pendentes (create/update/delete/upload/detach)
   │     ├─ notesRepository.ts # regras de leitura/escrita offline + fusão + conflitos
   │     ├─ conflicts.ts     # store de conflitos pendentes de decisão
   │     ├─ blobs.ts         # anexos locais (blobs) + URLs "notepad-local://"
   │     ├─ attachmentsRepository.ts # anexar/remover com fila offline
   │     └─ sync.ts          # drenagem da outbox (flushOutbox) + reconciliação
   ├─ proxy.ts              # guarda de senha (Next 16 "proxy", antes middleware)
   └─ app/
      ├─ layout.tsx          # html/body, fontes, ThemeProvider
      ├─ page.tsx            # renderiza <NoteApp/>
      ├─ globals.css         # Tailwind + estilos do editor
      ├─ entrar/page.tsx     # tela de login (quando APP_PASSWORD esta definida)
      ├─ api/[...slug]/      # proxy -> BACKEND_URL/api/* (com o token)
      ├─ api/sessao/         # POST login / DELETE logout
      ├─ uploads/[...slug]/  # proxy -> URLs legadas /uploads/*
      └─ components/
         ├─ NoteApp.tsx      # orquestração de estado e autosave
         ├─ NoteList.tsx     # lista + busca + tema
         ├─ NoteEditor.tsx   # título, editor TipTap, anexos
         ├─ EditorToolbar.tsx# barra de formatação (inclui espaçamento de linhas)
         ├─ ConflictDialog.tsx # decisão sobre conflitos de sincronização
         ├─ LogoutButton.tsx # sair (só com APP_PASSWORD definida)
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
- **Autenticação (falha fechada)**: `API_TOKEN` é obrigatório. Todas as rotas
  exigem `Authorization: Bearer <API_TOKEN>` (comparação em tempo constante):
  token ausente/errado → `401`, token não configurado → `503`. A única rota
  pública é `/api/health` (usada por Docker e uptime). O boot imprime
  `[auth] API_TOKEN nao definido - TODAS as requisicoes serao recusadas`.

### 3.3 Variáveis de ambiente (backend/.env)

| Variável             | Padrão               | Descrição                                     |
| -------------------- | -------------------- | --------------------------------------------- |
| `PORT`               | `3010`               | Porta HTTP                                    |
| `HOST`               | `0.0.0.0`            | Host de bind                                  |
| `DATABASE_PATH`      | `./data/notepad.db`  | Banco SQLite (relativo a `backend/`)          |
| `UPLOAD_DIR`         | `./data/uploads`     | Diretório de anexos (relativo a `backend/`)   |
| `MAX_UPLOAD_SIZE_MB` | `20`                 | Limite por arquivo                            |
| `MAX_JSON_SIZE_MB`   | `10`                 | Limite do corpo JSON                          |
| `CORS_ORIGIN`        | (vazio)              | Origens permitidas (vazio = qualquer)         |
| `API_TOKEN`          | — (obrigatório)      | Token Bearer da API; sem ele tudo vira `503`   |
| `BIND_ADDRESS`       | `127.0.0.1`          | Publicação da porta no host (só no compose)   |
| `TUNNEL_TOKEN`       | (vazio)              | Token do túnel Cloudflare (só no compose)     |

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

O proxy deixou de ser `rewrites` e passou a ser **Route Handlers**, para que o
frontend consiga injetar o header `Authorization` do backend **no servidor**:

- `frontend/app/api/[...slug]/route.ts` → `${BACKEND_URL}/api/<slug>`
- `frontend/app/uploads/[...slug]/route.ts` → `${BACKEND_URL}/uploads/<slug>`
- `frontend/lib/proxy.ts` — monta a URL, copia os headers (descartando
  hop-by-hop como `host`, `content-length` e `expect`) e adiciona
  `Authorization: Bearer ${BACKEND_TOKEN}`.

Assim, todo `fetch("/api/...")` do cliente chega ao backend pela mesma origem e o
token **nunca chega ao navegador**. `BACKEND_URL` padrão: `http://127.0.0.1:3010`.

### 4.1.1 Autenticação

Duas camadas, ambas **obrigatórias** (falha fechada):

| Onde  | Variável   | Efeito                                                                 |
| ----- | ---------- | ---------------------------------------------------------------------- |
| Backend | `API_TOKEN`   | Exige `Authorization: Bearer <token>`; **sem ele, `503` em tudo**. |
| Frontend | `BACKEND_TOKEN` | Token que o Route Handler envia ao backend (mesmo valor de `API_TOKEN`); sem ele o proxy responde `503`. |
| Frontend | `APP_PASSWORD` | Exige senha na tela `/entrar`; **sem ela, toda sessão é inválida** e o login responde `503`. |

Falha fechada: nenhuma configuração ausente abre acesso.

- `frontend/proxy.ts` (o *proxy* do Next 16, antes `middleware`) protege a app:
  sem cookie válido, páginas vão para `/entrar` e rotas `/api/*` recebem 401.
- `frontend/lib/session.ts` — comparação em tempo constante e token do cookie
  derivado de `APP_PASSWORD` (`SHA-256`), sem guardar a senha.
- `frontend/app/api/sessao/route.ts` — `POST` (login) e `DELETE` (logout).
- `frontend/app/entrar/page.tsx` — tela de login; botão de sair na barra lateral
  (`LogoutButton`), exibido só quando `APP_PASSWORD` está definida.

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
- **`ConflictDialog`** — escolhe o destino de um conflito de sincronização
  (manter local / servidor / ambos).
- **`LogoutButton`** — encerra a sessão (aparece só com `APP_PASSWORD`).

### 4.3 Editor (TipTap v3)

- `StarterKit` já inclui Link e Underline; `Image` é extensão separada
  (`allowBase64: false`); `Placeholder` vem de `@tiptap/extensions`.
- `useEditor({ immediatelyRender: false })` por causa de SSR.
- Extensão custom `lineHeight` (atributos globais em `paragraph`/`heading`).
  Presets (evitando sobreposição de linhas, `line-height` nunca < 1):
  - Padrão `""` (CSS `1.2`), Compacto `1.0`, Normal `1.1`, Amplo `1.4`, Duplo `1.8`.
  - `renderHTML` faz `Math.max(valor, 1)` para sanear notas antigas.

### 4.4 Variáveis de ambiente (frontend/.env)

| Variável               | Padrão                    | Descrição                                        |
| ---------------------- | ------------------------- | --------------------------------------------------- |
| `PORT`                 | `3011`                    | Porta HTTP do Next (lida por `scripts/serve.mjs`) |
| `BACKEND_URL`          | `http://127.0.0.1:3010`   | Destino do proxy `/api` e `/uploads`              |
| `BACKEND_TOKEN`        | — (obrigatório)           | Token enviado ao backend (igual ao `API_TOKEN`)    |
| `APP_PASSWORD`         | — (obrigatório)           | Senha de acesso (tela `/entrar`)                  |
| `ALLOWED_DEV_ORIGINS`  | `*.*.*.*`, `**.local`     | Origens extras permitidas em dev (HMR)             |

---

## 5. Como rodar

### 5.1 Desenvolvimento (dois terminais)

```powershell
# Terminal 1 — backend
cd backend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3010

# Terminal 2 — frontend
cd frontend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3011
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

### 5.4 Backend em container (Docker)

```powershell
cd backend
docker compose up -d --build     # build + start
docker compose logs -f           # logs
docker compose down              # para
```

- **`Dockerfile`**: `node:24-alpine`, estágio `deps` (`npm ci`) + `runtime`.
  O entrypoint é `node scripts/serve.mjs start` (nunca `node src/server.ts`);
  `serve.mjs` continua decidindo a flag do SQLite conforme a versão do Node.
  Container roda como usuário `node` e tem `HEALTHCHECK` em `/api/health`.
- **Persistência**: bind mount `./data:/app/data` — o `notepad.db` (com WAL) e
  os `uploads` ficam no host, fora da imagem, e sobrevivem a `down`/rebuild.
  Alternativas:
  - volume nomeado: troque o mount para `notepad-data:/app/data` e declare
    `volumes: { notepad-data: }` no compose;
  - em Linux, se o bind mount falhar por permissão (o container é `node`,
    uid 1000): `sudo chown -R 1000:1000 backend/data`.
- **Porta**: publicada em `127.0.0.1:3010` por padrão (`BIND_ADDRESS`). Para
  liberar na LAN/Tailscale, use `BIND_ADDRESS=0.0.0.0`. Pare o backend do host
  antes (mesma porta).
- `tsx` é dependência de **runtime** (o `serve.mjs` usa `--import tsx`), por isso
  está em `dependencies` — se voltar para `devDependencies`, a imagem quebra.
- O frontend continua rodando no host e speakando com o container sem mudar nada:
  `BACKEND_URL=http://127.0.0.1:3010`.
- **Autenticação no container**: defina `API_TOKEN` no `backend/.env` (o compose
  injeta todo o `.env`) e o mesmo valor em `BACKEND_TOKEN` no `frontend/.env`. Com
  isso o backend só aceita o proxy do frontend, mesmo exposto na internet.

### 5.5 Túnel Cloudflare (opcional)

```powershell
cd backend
# 1) criar o túnel no painel Zero Trust e copiar o TUNNEL_TOKEN para o .env
docker compose --profile tunnel up -d
```

- O serviço `cloudflared` fica no perfil `tunnel` (não sobe por padrão) e usa o
  **token**, que já embute a configuração — não há `config.yml` no repositório.
- Sem `TUNNEL_TOKEN` o serviço falha na inicialização com mensagem do próprio
  `cloudflared`.
- O `cloudflared` espera o `backend` ficar `healthy` antes de subir.

> **Antes de expor:** é obrigatório ter `API_TOKEN` no backend, o mesmo valor em
> `BACKEND_TOKEN` no frontend e `APP_PASSWORD` no frontend. Sem qualquer um
> deles o acesso é **negado** (falha fechada), então um `.env` incompleto
> derruba o app em vez de deixá-lo aberto.

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
- [x] **Backend em container**: `backend/Dockerfile` (node:24-alpine,
      multi-stage, usuário `node`, healthcheck) + `backend/compose.yaml` com
      volume persistente (`./data:/app/data`) e serviço `cloudflared` no perfil
      `tunnel`. `tsx` movido para `dependencies` (é runtime do `serve.mjs`).
      Ver [seção 5.4](#54-backend-em-container-docker) e
      [5.5](#55-túnel-cloudflare-opcional).

### 8.2 Pendências / próximos passos

- [ ] **Commit**: as mudanças estão no working tree, ainda não commitadas.
- [x] Offline-first: ver [seção 9](#9-offline-first-roadmap) (Etapas 1–5 concluídas).
- [x] **Autenticação simples**: `API_TOKEN` (Bearer) no backend + tela `/entrar`
      com `APP_PASSWORD` no frontend; o proxy (`lib/proxy.ts`) injeta o token no
      servidor. Substituiu os `rewrites` por Route Handlers.
- [ ] Opcional: containerizar o frontend e tunelá-lo em vez do backend.
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
- **A API não tem autenticação por padrão.** Com `API_TOKEN` (backend) e
  `APP_PASSWORD` (frontend) definidos, a exposição passa a exigir credencial.
  Mesmo assim: o token do backend é de uso exclusivo do servidor do frontend —
  não distribua `BACKEND_TOKEN` para nenhum cliente, e não exponha o backend sem
  o `API_TOKEN` definido (CORS só afeta navegadores).
- Sair da sessão não apaga o cache offline: as notas continuam no IndexedDB
  daquele navegador. Em máquina compartilhada, limpar os dados do site.

---

## 9. Offline-first (roadmap)

Objetivo: o app deve **funcionar sem o backend**, carregando do cache local,
guardando alterações para sincronizar depois e avisando sobre mudanças remotas.
Armazenamento escolhido: **IndexedDB** (via `idb`). Escopo inicial: **notas de
texto** (anexos ficam para a Etapa 5). Implementação **por etapas**.

- **Etapa 1 — Cache de leitura + indicador de conexão** — ✅ concluída
  - Camada `frontend/lib/store/`: `db.ts` (IndexedDB `notepad`, stores `notes`
  e `meta`) e `notesStore.ts` (cache/leitura/busca/meta, com `htmlToText`
  espelhando o backend para gerar a prévia).
  - `NoteApp` passa a ser **cache-first** na lista: mostra o cache local
    imediatamente e, em paralelo, busca no backend e atualiza o cache.
  - Abrir nota: tenta o backend; se indisponível, usa a cópia completa local.
  - Indicador **"Sem conexão"** na barra lateral + evento `online/offline` do
    navegador (ao reconectar, recarrega a lista).
  - Escrita offline (criar/editar/excluir) ainda **não** é suportada — falha
    explicitamente (Etapa 2).
  - Verificado: `typecheck`, `lint` e `build` do frontend verdes.
- **Etapa 2 — Escrita offline (outbox)** — ✅ concluída
  - `outbox.ts`: fila persistente de operações (`create`/`update`/`delete`) no
    IndexedDB, com fusão — um `create` absorve os `update` seguintes e um `delete`
    cancela o que houver.
  - `notesRepository.ts`: ponto único de leitura/escrita. Criação/edição/exclusão
    tentam o backend e, em caso de falha, gravam no cache local (estado otimista)
    e enfileiram a operação.
  - Notas criadas offline recebem **ID temporário** (negativo, via contador em
    `meta`); a exclusão de uma nota temporária apenas limpa a fila.
  - `mergeSummaries` combina a lista do servidor com o cache: mantém a versão
    local de notas com pendência e esconde as exclusões pendentes.
  - UI: ponto (`bg-accent`) na lista para notas pendentes; status "Salvo offline ·
    sincroniza depois" no editor. Reabrir uma nota com edição pendente usa a
    cópia local (não é sobrescrita pelo servidor).
  - Typecheck/lint/build do frontend verdes; smoke dos dois servidores ok.
- **Etapa 3 — Sincronização (drenar a outbox)** — ✅ concluída
  - `sync.ts` (`flushOutbox`) drena a fila em ordem, com guarda contra execução
    concorrente. `create` → `POST` e reconciliação do ID temporário; `update` →
    `PATCH`; `delete` → `DELETE`. `404` em update/delete descarta a operação;
    erro de rede (ou 5xx) interrompe e tenta de novo depois.
  - Mapeamento temporário → real persistido em `meta` (`idMap`); o repositório
    resolve IDs temporários antes de qualquer operação, evitando operações
    órfãs a partir de estado obsoleto.
  - `NoteApp.syncNow()` dispara ao abrir o app, no evento `online`, ao focar a
    janela e a cada 30 s; ao terminar, atualiza a lista e remapeia a nota aberta.
  - Typecheck/lint/build do frontend verdes; smoke dos dois servidores ok.
- **Etapa 4 — Conflitos / mudanças remotas** — ✅ concluída
  - Cada nota no cache guarda `serverUpdatedAt` (último `updatedAt` conhecido do
    servidor), separado do `updatedAt` local, para detectar divergência.
  - **Mudança remota sem conflito** (sem edição local pendente): a lista reflete
    o servidor e o app mostra um aviso discreto "N anotação(ões) atualizada(s) no
    servidor" (some em 5 s).
  - **Conflito** (edição local pendente **e** nota alterada no servidor): durante
    `flushOutbox`, antes do `PATCH` faz-se `GET` da nota e compara-se
    `serverUpdatedAt` com o `updatedAt` do servidor. Se divergir, a operação é
    **bloqueada** e um registro vai para o store `conflicts` (guardando a versão
    local e a do servidor). Notas com conflito ficam fora das demais drenagens.
  - **UI `ConflictDialog`**: modal listando a versão local e a do servidor com a
    escolha **Manter minha versão** (`PATCH` forçado), **Usar a do servidor**
    (descarta a edição local) e **Manter ambas** (cria a versão local como nova
    anotação e mantém a do servidor na original). Resolução via
    `resolveConflict()` no repositório.
  - Typecheck/lint/build do frontend verdes.
- **Etapa 5 — Anexos offline** — ✅ concluída
  - Store `blobs` no IndexedDB (v4) guarda o arquivo anexado offline; o anexo
    recebe **id local negativo** e a URL `notepad-local://<id>`.
  - `attachmentsRepository.ts`: `attachFile` tenta `POST /api/upload` e, sem
    conexão, guarda o blob + enfileira `upload`; `removeAttachment` apaga anexos
    locais na hora e enfileira `detach` para os que já estão no servidor.
  - Fila: `upload`/`detach` são independentes de `create`/`update` (não são
    absorvidos); `delete` da nota descarta tudo; `remapOps` move anexos pendentes
    do id temporário para o id real após a reconciliação da nota.
  - **Imagens inline**: extensão `Image` com node view que troca
    `notepad-local://<id>` pela object URL do blob; links para anexos locais são
    resolvidos no clique.
  - **Reescrita de URL ao sincronizar**: após o upload, `applyUpload` substitui a
    URL local pela definitiva no conteúdo em cache e nas operações pendentes, e
    corrige o conteúdo já gravado no servidor. `NoteApp` recarrega o editor
    aberto (`editorEpoch`) para exibir a versão definitiva.
  - Erros permanentes (ex.: `413` arquivo grande demais) descartam a operação em
    vez de travar a fila; exclusão da nota apaga os blobs locais.
  - UI: chip do anexo mostra selo "offline" enquanto pendente.
  - Typecheck/lint/build do frontend e typecheck do backend verdes.

### Como testar (roteiro)

1. Backend ligado, abra o app (popula o cache).
2. Desligue o backend (ou use o DevTools em modo offline).
3. Crie/abra uma nota, anexe uma **imagem** e um **arquivo**: os chips aparecem
   com selo "offline", a imagem aparece inline e o conteúdo é salvo.
4. Recarregue a página (F5): tudo continua disponível.
5. Religue o backend: em até 30 s (ou ao focar a janela) os arquivos sobem, os
   selos somem, o editor é recarregado com as URLs definitivas e o conteúdo no
   servidor passa a apontar para `/api/attachments/...`.
6. Remova um anexo enquanto offline: some da lista e é removido do servidor ao
   reconectar.
