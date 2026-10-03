Aplicação de anotações em pt-BR feita com Next.js App Router, TypeScript, Tailwind CSS, TipTap e SQLite.

## Requisitos

- Node.js 23 ou superior recomendado. O projeto usa o módulo integrado `node:sqlite`.
- npm.

## Desenvolvimento

Instale as dependências e inicie o servidor de desenvolvimento:

```bash
npm run dev
```

O servidor fica disponível em [http://localhost:3000](http://localhost:3000) por padrão. O script `scripts/serve.mjs` também lê `PORT` do ambiente ou do `.env` e configura o host para acesso pela rede.

## Produção

```bash
npm run build
npm start
```

Use `npm run typecheck` e `npm run lint` para validar alterações.

## Documentação

Consulte a [documentação oficial do Next.js](https://nextjs.org/docs) para detalhes do framework.

## Dados e anexos

O banco SQLite fica em `data/notepad.db` por padrão. Uploads novos ficam em `data/uploads` por padrão, fora da pasta estática do Next.js. Os caminhos podem ser alterados com `DATABASE_PATH` e `UPLOAD_DIR`. Caminhos relativos são resolvidos a partir da raiz do projeto. O limite padrão é 20 MB por arquivo e pode ser alterado com `MAX_UPLOAD_SIZE_MB`.

Os arquivos são armazenados no disco do servidor e seus metadados ficam na tabela `files`. O endpoint dinâmico `app/api/attachments/[noteId]/[storedName]/route.ts` valida os anexos no banco e serve os arquivos em runtime, inclusive uploads criados depois do build. Anexos antigos em `public/uploads` continuam sendo lidos como compatibilidade. O diretório `data/` é ignorado pelo Git.

Em produção, configure `DATABASE_PATH` e `UPLOAD_DIR` para volumes persistentes. O processo que recebe o upload precisa acessar os mesmos arquivos e banco ao servir o anexo; armazenamento efêmero ou múltiplas instâncias sem volume compartilhado podem causar perda de dados ou respostas 404. Para ambientes serverless, use armazenamento de arquivos externo.
