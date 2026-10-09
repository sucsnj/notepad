import {
  deleteBlob,
  localUrl,
  nextLocalAttachmentId,
  putBlob,
} from "./blobs";
import { enqueue, removeOpForAttachment } from "./outbox";
import {
  getCachedNote,
  putCachedNote,
  resolveId,
} from "./notesStore";
import { nowSqlite } from "./notesRepository";
import type { Attachment, AttachmentKind } from "@/lib/types";

export interface AttachOutcome {
  attachment: Attachment;
  queued: boolean;
}

function guessKind(file: File): AttachmentKind {
  return file.type.startsWith("image/") ? "image" : "file";
}

async function addAttachmentToCache(
  noteId: number,
  attachment: Attachment,
): Promise<void> {
  const cached = await getCachedNote(noteId);
  if (!cached) return;

  await putCachedNote({
    ...cached,
    attachments: [...cached.attachments, attachment],
    attachmentCount: cached.attachments.length + 1,
  });
}

async function removeAttachmentFromCache(
  noteId: number,
  attachmentId: number,
): Promise<void> {
  const cached = await getCachedNote(noteId);
  if (!cached) return;

  const attachments = cached.attachments.filter(
    (item) => item.id !== attachmentId,
  );

  await putCachedNote({
    ...cached,
    attachments,
    attachmentCount: attachments.length,
  });
}

// Anexa um arquivo. Tenta o servidor; sem conexão, guarda o blob no
// IndexedDB e enfileira o upload.
export async function attachFile(
  noteId: number,
  file: File,
): Promise<AttachOutcome> {
  const targetId = await resolveId(noteId);

  if (targetId >= 0) {
    try {
      const form = new FormData();
      form.append("noteId", String(targetId));
      form.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Falha ao enviar o arquivo");
      }

      const attachment = data.attachment as Attachment;
      await addAttachmentToCache(targetId, attachment);
      return { attachment, queued: false };
    } catch {
      // sem conexão; guarda localmente
    }
  }

  const id = await nextLocalAttachmentId();
  const createdAt = nowSqlite();
  const attachment: Attachment = {
    id,
    noteId: targetId,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    url: localUrl(id),
    kind: guessKind(file),
    createdAt,
    pending: true,
  };

  await putBlob({
    id,
    noteId: targetId,
    filename: file.name,
    mimeType: attachment.mimeType,
    size: file.size,
    kind: attachment.kind,
    createdAt,
    blob: file,
  });
  await addAttachmentToCache(targetId, attachment);
  await enqueue({
    kind: "upload",
    noteId: targetId,
    attachmentId: id,
    filename: file.name,
    mimeType: attachment.mimeType,
    size: file.size,
    createdAt,
  });

  return { attachment, queued: true };
}

// Remove um anexo. Anexos locais (ainda não subidos) só limpam o cache e a
// fila; anexos no servidor tentam a exclusão e, sem conexão, a enfileiram.
export async function removeAttachment(
  noteId: number,
  attachment: Attachment,
): Promise<{ queued: boolean }> {
  const targetId = await resolveId(noteId);

  if (attachment.id < 0) {
    await removeOpForAttachment(targetId, attachment.id);
    await deleteBlob(attachment.id);
    await removeAttachmentFromCache(targetId, attachment.id);
    return { queued: false };
  }

  try {
    const params = new URLSearchParams({
      noteId: String(targetId),
      attachmentId: String(attachment.id),
    });
    const response = await fetch(`/api/upload?${params}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Falha ao remover o anexo");
    }
    await removeAttachmentFromCache(targetId, attachment.id);
    return { queued: false };
  } catch {
    // sem conexão; enfileira a remoção
  }

  await removeAttachmentFromCache(targetId, attachment.id);
  await enqueue({
    kind: "detach",
    noteId: targetId,
    attachmentId: attachment.id,
    createdAt: nowSqlite(),
  });

  return { queued: true };
}