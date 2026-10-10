<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Frontend (Next.js)

UI cliente (SPA) do Bloco de Notas. Consome a API do `../backend` via proxy em Route Handlers (`app/api/[...slug]` e `app/uploads/[...slug]` → `BACKEND_URL`, lógica em `lib/proxy.ts`).

- `npm run dev` / `npm run build` / `npm start` passam por `scripts/serve.mjs` (bind `0.0.0.0`, `PORT` do `.env`). Nunca chame `next dev/build/start` direto.
- `npm run lint` (eslint) e `npm run typecheck` (`tsc --noEmit`) antes de concluir.
- TipTap v3: `useEditor` com `immediatelyRender: false`; `StarterKit` já inclui Link/Underline; `Placeholder` vem de `@tiptap/extensions`.
- Config: `BACKEND_URL` (padrão `http://127.0.0.1:3010`), `BACKEND_TOKEN`, `APP_PASSWORD` e `ALLOWED_DEV_ORIGINS` no `.env`.
- Auth: `proxy.ts` (guarda de senha, antes `middleware`) + tela `app/entrar`. `BACKEND_TOKEN` só no servidor.

Ver o `AGENTS.md` da raiz para visão geral do projeto (frontend + backend).
