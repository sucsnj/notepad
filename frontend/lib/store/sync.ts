import {
  cacheNote,
  deleteCachedNote,
  getCachedNote,
  previewFromContent,
  putCachedNote,
  setIdMapping,
} from "./notesStore";
import {
  getPendingOps,
  pendingOpsForNote,
  remapOps,
  removeNoteOps,
  removeOpForAttachment,
  removeOpsForNote,
  replaceOpContent,
} from "./outbox";
import { conflictIds, putConflict } from "./conflicts";
import { deleteBlob, getBlob, localAttachmentsFor, localUrl } from "./blobs";
import { nowSqlite } from "./notesRepository";
import type { Attachment, Note } from "@/lib/types";

export interface UrlRewrite {
  noteId: number;
  from: string;
  to: string;
}

export interface FlushResult {
  processed: number;
  remaining: number;
  reconciled: Map<number, number>;
  rewrites: UrlRewrite[];
  failed: boolean;
}

let running: Promise<FlushResult> | null = null;

// Drena a fila de operações assim que possível. Chamadas concorrentes
// compartilham a mesma execução (não roda em paralelo).
export function flushOutbox(): Promise<FlushResult> {
  if (!running) {
    running = runFlush().finally(() => {
      running = null;
    });
  }
  return running;
}

function sendJson(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

// Erro do cliente que não adianta repetir (ex.: arquivo grande demais).
function isPermanentClientError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

async function applyUpload(
  noteId: number,
  localId: number,
  attachment: Attachment,
  from: string,
  to: string,
  rewrites: UrlRewrite[],
): Promise<void> {
  const cached = await getCachedNote(noteId);
  const content =
    cached?.content == null ? null : cached.content.replaceAll(from, to);

  if (cached) {
    const attachments = [
      ...cached.attachments.filter((item) => item.id !== localId),
      attachment,
    ];

    await putCachedNote({
      ...cached,
      attachments,
      attachmentCount: attachments.length,
      content,
      preview: content == null ? cached.preview : previewFromContent(content),
    });
  }

  // Operações ainda pendentes da nota passam a levar a URL definitiva.
  await replaceOpContent(noteId, (value) => value.replaceAll(from, to));
  rewrites.push({ noteId, from, to });

  // Se a nota já está no servidor e não há operação de conteúdo pendente,
  // corrige o conteúdo gravado antes (que ainda tinha a URL local).
  const pending = await pendingOpsForNote(noteId);
  const hasContentOp = pending.some(
    (item) => item.kind === "create" || item.kind === "update",
  );

  if (noteId >= 0 && !hasContentOp && cached && content != null) {
    const response = await sendJson(`/api/notes/${noteId}`, "PATCH", {
      title: cached.title,
      content,
    });
    if (response.ok) {
      const data = (await response.json()) as { note: Note };
      await cacheNote(data.note, await localAttachmentsFor(noteId));
    }
  }
}

async function runFlush(): Promise<FlushResult> {
  const reconciled = new Map<number, number>();
  const rewrites: UrlRewrite[] = [];
  let processed = 0;
  let failed = false;

  const ops = (await getPendingOps()).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );

  // Operações aguardando decisão do usuário sobre conflito ficam de fora.
  const blocked = await conflictIds();
  // Notas criadas offline ganham id real durante a própria drenagem.
  const remapped = new Map<number, number>();

  for (const op of ops) {
    const noteId = remapped.get(op.noteId) ?? op.noteId;
    if (blocked.has(noteId)) continue;
    try {
      if (op.kind === "create") {
        const response = await sendJson("/api/notes", "POST", {
          title: op.title ?? "",
          content: op.content ?? "",
        });
        if (!response.ok) {
          failed = response.status >= 500;
          break;
        }
        const data = (await response.json()) as { note: Note };
        const locals = await localAttachmentsFor(op.noteId);
        await deleteCachedNote(op.noteId);
        await cacheNote(data.note, locals);
        await setIdMapping(op.noteId, data.note.id);
        await remapOps(op.noteId, data.note.id, op.id);
        remapped.set(op.noteId, data.note.id);
        reconciled.set(op.noteId, data.note.id);
        processed++;
      } else if (op.kind === "update") {
        // Antes de sobrescrever, confere se a nota mudou no servidor desde a
        // última versão conhecida (conflito).
        const current = await sendJson(`/api/notes/${noteId}`, "GET");
        if (current.status === 404) {
          // A nota não existe mais no servidor: descarta a operação.
          await removeNoteOps(noteId);
          processed++;
          continue;
        }
        if (!current.ok) {
          failed = current.status >= 500;
          break;
        }
        const currentData = (await current.json()) as { note: Note };
        const cached = await getCachedNote(noteId);
        if (
          cached?.serverUpdatedAt &&
          cached.serverUpdatedAt !== currentData.note.updatedAt
        ) {
          await putConflict({
            noteId: noteId,
            localTitle: op.title ?? "",
            localContent: op.content ?? "",
            serverTitle: currentData.note.title,
            serverContent: currentData.note.content,
            localUpdatedAt: cached.updatedAt,
            serverUpdatedAt: currentData.note.updatedAt,
            detectedAt: nowSqlite(),
          });
          blocked.add(noteId);
          continue;
        }

        const response = await sendJson(`/api/notes/${noteId}`, "PATCH", {
          title: op.title ?? "",
          content: op.content ?? "",
        });
        if (!response.ok) {
          failed = response.status >= 500;
          break;
        }
        const data = (await response.json()) as { note: Note };
        await cacheNote(data.note, await localAttachmentsFor(noteId));
        await removeNoteOps(noteId);
        processed++;
      } else if (op.kind === "upload") {
        // A nota ainda não existe no servidor (create pendente): tenta depois.
        if (noteId < 0) continue;

        const localId = op.attachmentId ?? 0;
        const record = await getBlob(localId);
        if (!record) {
          // O blob sumiu: nada a enviar.
          await removeOpForAttachment(noteId, localId);
          processed++;
          continue;
        }

        const form = new FormData();
        form.append("noteId", String(noteId));
        form.append("file", record.blob, record.filename);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });

        if (response.status === 404 || isPermanentClientError(response.status)) {
          await removeOpForAttachment(noteId, localId);
          await deleteBlob(localId);
          processed++;
          continue;
        }
        if (!response.ok) {
          failed = response.status >= 500;
          break;
        }

        const data = (await response.json()) as { attachment: Attachment };
        await applyUpload(
          noteId,
          localId,
          data.attachment,
          localUrl(localId),
          data.attachment.url,
          rewrites,
        );
        await deleteBlob(localId);
        await removeOpForAttachment(noteId, localId);
        processed++;
      } else if (op.kind === "detach") {
        const params = new URLSearchParams({
          noteId: String(noteId),
          attachmentId: String(op.attachmentId ?? ""),
        });
        const response = await fetch(`/api/upload?${params}`, { method: "DELETE" });

        if (response.ok || response.status === 404) {
          await removeOpForAttachment(noteId, op.attachmentId ?? 0);
          processed++;
          continue;
        }
        if (isPermanentClientError(response.status)) {
          await removeOpForAttachment(noteId, op.attachmentId ?? 0);
          processed++;
          continue;
        }
        failed = response.status >= 500;
        break;
      } else {
        const response = await sendJson(`/api/notes/${noteId}`, "DELETE");
        if (!response.ok && response.status !== 404) {
          failed = response.status >= 500;
          break;
        }
        await removeOpsForNote(noteId);
        processed++;
      }
    } catch {
      // Erro de rede: interrompe e tenta de novo depois.
      failed = true;
      break;
    }
  }

  const remaining = (await getPendingOps()).length;
  return { processed, remaining, reconciled, rewrites, failed };
}