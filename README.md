# Bloco de Notas

Aplicação de anotações em pt-BR, separada em **dois projetos independentes** que rodam em processos distintos:

- **`frontend/`** — Next.js (App Router) + TypeScript + Tailwind CSS v4 + TipTap v3 (SPA).
- **`backend/`** — API standalone em Fastify + SQLite via `node:sqlite`.

O frontend faz proxy de `/api/*` e `/uploads/*` para o backend (configurável por `BACKEND_URL`), então as chamadas do cliente permanecem em mesma origem (sem necessidade de CORS). O proxy também injeta o token da API no servidor — ele nunca chega ao navegador.

## Requisitos

- Node.js **22.5 ou superior** (o backend usa o módulo nativo `node:sqlite`). Node 23+ recomendado; em Node 22.5–22.12 o script injeta automaticamente o flag `--experimental-sqlite`.
- npm.

## Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3010
```

- `npm run dev` — sobe o Fastify com reload (via `tsx`).
- `npm start` — mesmo servidor, sem watch.
- `npm run typecheck` — valida os tipos.

Variáveis (`.env`): `PORT` (3010), `HOST` (0.0.0.0), `DATABASE_PATH` (`./data/notepad.db`), `UPLOAD_DIR` (`./data/uploads`), `MAX_UPLOAD_SIZE_MB` (20), `CORS_ORIGIN`, `API_TOKEN`.

`API_TOKEN` ativa a autenticação da API: todas as rotas exigem `Authorization: Bearer <API_TOKEN>` (fora `/api/health`). Em branco, a API fica aberta — prático no uso local, inseguro se exposta.

## Backend em Docker (opcional)

```powershell
cd backend
docker compose up -d --build     # sobe o backend em http://127.0.0.1:3010
docker compose logs -f
docker compose down
```

- **Persistência**: o bind mount `./data:/app/data` mantém o SQLite e os uploads no host, fora da imagem (sobrevive a `down` e rebuilds). Para usar um volume nomeado, troque o mount no `compose.yaml` para `notepad-data:/app/data` e declare `volumes: { notepad-data: }`.
- **Porta**: publicada em `127.0.0.1:3010`. Use `BIND_ADDRESS=0.0.0.0` para liberar na LAN. Pare o backend do host antes (mesma porta).
- **Autenticação**: defina `API_TOKEN` no `backend/.env` e o mesmo valor em `BACKEND_TOKEN` no `frontend/.env`. O frontend no host continua funcionando sem mudar nada (`BACKEND_URL=http://127.0.0.1:3010`).

### Túnel Cloudflare (opcional)

```powershell
# crie o túnel no painel Zero Trust e coloque o TUNNEL_TOKEN no backend/.env
docker compose --profile tunnel up -d
```

O serviço `cloudflared` só sobe com o perfil `tunnel` e usa o token (que já embute a configuração, sem `config.yml` no repositório).

> ⚠️ **Sem `API_TOKEN` a API fica aberta**: qualquer pessoa com a URL lê, altera e exclui suas anotações — e o CORS não protege clientes não-browser. Para expor também a interface, defina `APP_PASSWORD` no frontend.

## Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env   # opcional
npm run dev                   # http://localhost:3011
```

- `npm run dev` / `npm run build` / `npm start` — passam por `scripts/serve.mjs` (lê `PORT` do `.env`, bind em `0.0.0.0`).
- `npm run lint`, `npm run typecheck`.

Variáveis (`.env`): `PORT` (3011), `BACKEND_URL` (`http://127.0.0.1:3010`), `BACKEND_TOKEN`, `APP_PASSWORD`, `ALLOWED_DEV_ORIGINS`.

### Senha de acesso

`APP_PASSWORD` protege a interface: ao abrir o app aparece a tela `/entrar` e, sem um cookie válido, as chamadas da API recebem `401`. `BACKEND_TOKEN` é o token que o servidor do frontend envia ao backend — deve ser **igual** ao `API_TOKEN` do backend e **nunca** deve ir para o navegador. Em branco (padrão), o app fica aberto, como antes.

## Dados e anexos

O banco SQLite fica em `backend/data/notepad.db` e os uploads novos em `backend/data/uploads` (ambos ignorados pelo Git). Os caminhos podem ser alterados com `DATABASE_PATH` e `UPLOAD_DIR`. O endpoint dinâmico `GET /api/attachments/:noteId/:storedName` valida os anexos no banco e os serve em runtime; URLs legadas em `/uploads/...` continuam válidas.

Em produção, use volumes persistentes para `DATABASE_PATH` e `UPLOAD_DIR`, aponte `BACKEND_URL` do frontend para o backend e exponha cada processo na porta desejada.

## Acesso pela rede

Os dois servidores fazem bind em `0.0.0.0` (LAN/Tailscale/Radmin). Para liberar a porta no Firewall do Windows (executar como Administrador):

```powershell
powershell -ExecutionPolicy Bypass -File frontend/scripts/firewall.ps1
```
