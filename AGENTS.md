<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

Bloco de notas online (SPA): Next.js App Router + TypeScript, Tailwind CSS v4, SQLite via `node:sqlite` (módulo nativo do Node, sem dependência C++), editor TipTap v3. UI cliente/idioma: pt-BR.

## Commands
- `npm run dev` / `npm start` — rodam via `scripts/serve.mjs`, que lê `PORT` do `.env` e executa `next dev|start -H <host> -p <port>`. O script injeta `--experimental-sqlite` quando o Node é `< 23` (necessário para o `node:sqlite`). **Nunca** chame `next dev`/`next start` direto: além do `-H 0.0.0.0`, o flag do SQLite tem que ser repassado.
- `npm run typecheck` (`tsc --noEmit`), `npm run lint` (eslint), `npm run build` — validar antes de concluir qualquer tarefa.
- `powershell -ExecutionPolicy Bypass -File scripts/firewall.ps1` (como Administrador) — abre a porta do app no Firewall do Windows para acesso de outros dispositivos (LAN/Tailscale/Radmin).

## Next.js 16 (breaking changes)
- Documentação oficial local em `node_modules/next/dist/docs/` — ler antes de escrever código (route handlers recebem `params` como `Promise`; `PORT` não é lido do `.env` pelo CLI; etc.).
- `next.config.ts` tem apenas `allowedDevOrigins` (padrão `*.*.*.*`, `**.local`; sobrescrever via `ALLOWED_DEV_ORIGINS` no `.env`, separado por vírgula, wildcards `*`/`**`). Esse bloqueio anti-rebinding só existe no modo dev e atinge assets `/_next`/HMR. Não há mais `serverExternalPackages` (o `node:sqlite` é built-in).
- TipTap v3: `StarterKit` já inclui Link/Underline; `Image` é extensão separada; `Placeholder` vem de `@tiptap/extensions`. `useEditor` usa `immediatelyRender: false` (SSR). Lint React 19 proíbe `setState` em effect refs durante render (ex.: `ThemeToggle` usa `useSyncExternalStore`).

## Banco e arquivos
- SQLite via módulo nativo `node:sqlite` (`DatabaseSync`) em `data/notepad.db` (WAL, FK). Esquema e singleton (globalThis, sobrevive HMR) em `lib/db.ts`; `data/` é ignorado pelo git.
- Anexos ficam em `public/uploads/<noteId>/<storedName>` com metadados na tabela `files` (tabela `notes` guarda `content` HTML + `text_content` para busca LIKE em `lib/notes.ts`). `public/uploads/*` é ignorado exceto `.gitkeep`.

## Acesso pela rede
- Binding sempre em `0.0.0.0` via `scripts/serve.mjs`: dá acesso por `http://localhost:3000`, IP de LAN e IPs de VPN (Tailscale/Radmin). IPv6 puro (`::1`) não é atendido; navegadores caem para IPv4 automaticamente.
- Debug de porta: `Get-NetTCPConnection -LocalPort <port> -State Listen` (preste atenção a listeners bound a IP específico, ex.: `26.47.63.186` da Radmin VPN).

## Notas de ambiente
- Servidores de fundo iniciados em um comando do shell não sobrevivem entre comandos — rode start + testes no mesmo comando quando precisar validar.
- O Windows esteve exposto a `EPERM uv_spawn powershell.exe` com `curl.exe`/`Start-Job`; preferir `Invoke-WebRequest`/`System.Net.Http` (com `UseProxy=$false`) nos testes.
