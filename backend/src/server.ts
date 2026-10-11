import { readFile } from "node:fs/promises";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { getDb, maxUploadBytes } from "./db";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from "./notes";
import { deleteAttachment, findAttachmentFile } from "./attachments";
import { saveUpload, UploadError } from "./uploads";
import { parseId, stringField } from "./http";
import { authConfigured, isAuthorized } from "./auth";

const port = Number(process.env.PORT ?? 3010);
const host = process.env.HOST ?? "0.0.0.0";

// Garante a criacao do banco e do esquema antes de aceitar requisicoes.
getDb();

if (!authConfigured) {
  console.error(
    "[auth] API_TOKEN nao definido - TODAS as requisicoes serao recusadas " +
      "(503). Defina API_TOKEN e o mesmo valor em BACKEND_TOKEN no frontend.",
  );
}

const app = Fastify({
  logger: true,
  bodyLimit: Number(process.env.MAX_JSON_SIZE_MB ?? 10) * 1024 * 1024,
});

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : true;

await app.register(cors, { origin: corsOrigin });
await app.register(multipart, {
  limits: { fileSize: maxUploadBytes, files: 1 },
});

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function multipartFieldValue(field: unknown): string | undefined {
  const value = Array.isArray(field) ? field[0] : field;
  if (value && typeof value === "object" && "value" in value) {
    const raw = (value as { value?: unknown }).value;
    return typeof raw === "string" ? raw : undefined;
  }
  return undefined;
}

async function sendAttachment(
  request: FastifyRequest,
  reply: FastifyReply,
  rawNoteId: string,
  storedName: string,
) {
  const noteId = parseId(rawNoteId);
  if (noteId === null) {
    return reply.code(404).send("Not found");
  }

  const attachment = findAttachmentFile(noteId, storedName);
  if (!attachment) {
    return reply.code(404).send("Not found");
  }

  try {
    const file = await readFile(attachment.filePath);
    const isImage = attachment.mimeType.startsWith("image/");
    const safeName = encodeURIComponent(attachment.originalName);

    return reply
      .header("Content-Type", attachment.mimeType)
      .header(
        "Content-Disposition",
        `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${safeName}`,
      )
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(file);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return reply.code(404).send("Not found");
    }
    request.log.error(error);
    return reply.code(500).send("Falha ao ler anexo");
  }
}

// O health fica publico para orquestradores (Docker, uptime) mesmo com
// autenticacao ativa.
app.get("/api/health", async () => ({ ok: true }));

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/api/health") return;

  // Falha fechada: sem token configurado ninguem acessa.
  if (!authConfigured) {
    await reply.code(503).send({
      error: "API_TOKEN nao configurado",
      hint: "Defina API_TOKEN no .env do backend e reinicie o processo",
    });
    return;
  }

  if (isAuthorized(request.headers.authorization)) return;

  await reply.code(401).send({
    error: "Nao autorizado",
    hint: "Envie o header Authorization: Bearer <API_TOKEN>",
  });
});

app.get("/api/notes", async (request) => {
  const query = (request.query as { q?: string }).q ?? "";
  return { notes: listNotes(query) };
});

app.post("/api/notes", async (request, reply) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const note = createNote({
    title: stringField(body.title),
    content: stringField(body.content),
    textContent: stringField(body.textContent),
  });
  return reply.code(201).send({ note });
});

app.get("/api/notes/:id", async (request, reply) => {
  const id = parseId((request.params as { id: string }).id);
  if (id === null) {
    return reply.code(400).send({ error: "Identificador inválido" });
  }

  const note = getNote(id);
  if (!note) {
    return reply.code(404).send({ error: "Anotação não encontrada" });
  }

  return { note };
});

app.patch("/api/notes/:id", async (request, reply) => {
  const id = parseId((request.params as { id: string }).id);
  if (id === null) {
    return reply.code(400).send({ error: "Identificador inválido" });
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const note = updateNote(id, {
    title: stringField(body.title),
    content: stringField(body.content),
    textContent: stringField(body.textContent),
  });

  if (!note) {
    return reply.code(404).send({ error: "Anotação não encontrada" });
  }

  return { note };
});

app.delete("/api/notes/:id", async (request, reply) => {
  const id = parseId((request.params as { id: string }).id);
  if (id === null) {
    return reply.code(400).send({ error: "Identificador inválido" });
  }

  if (!deleteNote(id)) {
    return reply.code(404).send({ error: "Anotação não encontrada" });
  }

  return { ok: true };
});

app.post("/api/upload", async (request, reply) => {
  let data;
  try {
    data = await request.file();
  } catch (error) {
    request.log.error(error);
    return reply.code(400).send({ error: "Requisição inválida" });
  }

  if (!data) {
    return reply.code(400).send({ error: "Nenhum arquivo foi enviado" });
  }

  const noteId = parseId(multipartFieldValue(data.fields.noteId) ?? "");
  if (noteId === null) {
    return reply.code(400).send({ error: "noteId inválido" });
  }

  try {
    const buffer = await data.toBuffer();
    const attachment = await saveUpload(noteId, {
      filename: data.filename,
      mimetype: data.mimetype,
      buffer,
    });
    return reply.code(201).send({ attachment });
  } catch (error) {
    if (error instanceof UploadError) {
      return reply.code(error.status).send({ error: error.message });
    }
    if (errorCode(error) === "FST_REQ_FILE_TOO_LARGE") {
      return reply
        .code(413)
        .send({ error: "O arquivo excede o limite permitido" });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "Falha ao salvar o arquivo" });
  }
});

app.delete("/api/upload", async (request, reply) => {
  const query = request.query as { noteId?: string; attachmentId?: string };
  const noteId = parseId(query.noteId ?? "");
  const attachmentId = parseId(query.attachmentId ?? "");

  if (noteId === null || attachmentId === null) {
    return reply.code(400).send({ error: "Identificador inválido" });
  }

  if (!deleteAttachment(attachmentId, noteId)) {
    return reply.code(404).send({ error: "Anexo não encontrado" });
  }

  return { ok: true };
});

app.get("/api/attachments/:noteId/:storedName", async (request, reply) => {
  const { noteId, storedName } = request.params as {
    noteId: string;
    storedName: string;
  };
  return sendAttachment(request, reply, noteId, storedName);
});

// Handler legado: URLs antigas em /uploads/... continuam validas.
app.get("/uploads/:noteId/:storedName", async (request, reply) => {
  const { noteId, storedName } = request.params as {
    noteId: string;
    storedName: string;
  };
  return sendAttachment(request, reply, noteId, storedName);
});

try {
  await app.listen({ port, host });
  console.log(`Backend disponivel em http://localhost:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
