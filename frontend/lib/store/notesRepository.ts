import {
  cacheNote,
  deleteCachedNote,
  getCachedNote,
  getMeta,
  previewFromContent,
  putCachedNote,
  resolveId,
  setMeta,
} from "./notesStore";
import { enqueue, pendingKinds, removeOpsForNote } from "./outbox";
import { getConflict, putConflict, removeConflict } from "./conflicts";
import type { CachedNote, ConflictRecord } from "./db";
import type { Note, NoteSummary } from "@/lib/types";

export function isTempId(id: number): boolean {
  return id < 0;
}

// Timestamp no mesmo formato do SQLite (UTC, "YYYY-MM-DD HH:MM:SS"), para que a
// ordenação no cache case com a do backend.
export function nowSqlite(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

async function nextTempId(): Promise<number> {
  const current = (await getMeta<number>("tempId")) ?? 0;
  const next = current - 1;
  await setMeta("tempId", next);
  return next;
}

export interface SaveOutcome {
  saved: boolean;
  queued: boolean;
}

export async function saveNote(
  id: number,
  input: { title: string; content: string },
): Promise<SaveOutcome> {
  const targetId = await resolveId(id);

  if (!isTempId(targetId)) {
    try {
      // Antes de sobrescrever, confere se a nota mudou no servidor desde a
      // última versão conhecida (conflito detectado no autosave online).
      const check = await fetch(`/api/notes/${targetId}`, { cache: "no-store" });
      if (check.status === 404) {
        // nota não existe mais no servidor; segue para a gravação local
      } else if (check.ok) {
        const current = (await check.json()) as { note: Note };
        const cached = await getCachedNote(targetId);
        if (
          cached?.serverUpdatedAt &&
          cached.serverUpdatedAt !== current.note.updatedAt
        ) {
          await putConflict({
            noteId: targetId,
            localTitle: input.title,
            localContent: input.content,
            serverTitle: current.note.title,
            serverContent: current.note.content,
            localUpdatedAt: nowSqlite(),
            serverUpdatedAt: current.note.updatedAt,
            detectedAt: nowSqlite(),
          });
        } else {
          const response = await fetch(`/api/notes/${targetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          if (response.ok) {
            const data = (await response.json()) as { note: Note };
            await cacheNote(data.note);
            await removeOpsForNote(targetId);
            await removeOpsForNote(id);
            return { saved: true, queued: false };
          }
        }
      }
    } catch {
      // sem conexão; grava localmente e enfileira
    }
  }

  const cached = await getCachedNote(targetId);
  const timestamp = nowSqlite();
  await putCachedNote({
    id: targetId,
    title: input.title,
    content: input.content,
    preview: previewFromContent(input.content),
    attachmentCount: cached?.attachmentCount ?? 0,
    attachments: cached?.attachments ?? [],
    createdAt: cached?.createdAt ?? timestamp,
    updatedAt: timestamp,
    serverUpdatedAt: cached?.serverUpdatedAt ?? null,
    full: true,
  });
  await enqueue({
    kind: "update",
    noteId: targetId,
    title: input.title,
    content: input.content,
    createdAt: timestamp,
  });

  return { saved: false, queued: true };
}

export interface CreateOutcome {
  note: Note;
  queued: boolean;
}

export async function createNote(): Promise<CreateOutcome> {
  try {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", content: "", textContent: "" }),
    });
    if (response.ok) {
      const data = (await response.json()) as { note: Note };
      await cacheNote(data.note);
      return { note: data.note, queued: false };
    }
  } catch {
    // sem conexão; cria localmente com id temporário
  }

  const id = await nextTempId();
  const timestamp = nowSqlite();
  const note: Note = {
    id,
    title: "",
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    attachments: [],
  };
  await putCachedNote({
    id,
    title: "",
    content: "",
    preview: "",
    attachmentCount: 0,
    attachments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    serverUpdatedAt: null,
    full: true,
  });
  await enqueue({
    kind: "create",
    noteId: id,
    title: "",
    content: "",
    createdAt: timestamp,
  });

  return { note, queued: true };
}

export async function removeNote(id: number): Promise<{ queued: boolean }> {
  const targetId = await resolveId(id);
  await deleteCachedNote(id);
  if (targetId !== id) await deleteCachedNote(targetId);

  if (isTempId(targetId)) {
    // Nunca chegou ao servidor: basta descartar a fila.
    await removeOpsForNote(id);
    await removeOpsForNote(targetId);
    return { queued: false };
  }

  try {
    const response = await fetch(`/api/notes/${targetId}`, { method: "DELETE" });
    if (response.ok) {
      await removeOpsForNote(targetId);
      await removeOpsForNote(id);
      return { queued: false };
    }
  } catch {
    // sem conexão; enfileira a exclusão
  }

  await enqueue({ kind: "delete", noteId: targetId, createdAt: nowSqlite() });
  return { queued: true };
}

function cachedToNote(cached: CachedNote): Note {
  return {
    id: cached.id,
    title: cached.title,
    content: cached.content ?? "",
    createdAt: cached.createdAt,
    updatedAt: cached.updatedAt,
    attachments: cached.attachments,
  };
}

export async function getNote(
  id: number,
): Promise<{ note: Note; offline: boolean } | null> {
  const targetId = await resolveId(id);
  const pending = await pendingKinds();
  const kind = pending.get(targetId);

  if (kind === "delete") return null;

  // Com alteração local pendente, a cópia local é a fonte da verdade.
  if (kind === "create" || kind === "update") {
    const cached = await getCachedNote(targetId);
    if (cached?.full && cached.content !== null) {
      return { note: cachedToNote(cached), offline: false };
    }
  }

  if (!isTempId(targetId)) {
    try {
      const response = await fetch(`/api/notes/${targetId}`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { note: Note };
        await cacheNote(data.note);
        return { note: data.note, offline: false };
      }
    } catch {
      // cai para o cache local
    }
  }

  const cached = await getCachedNote(targetId);
  if (cached?.full && cached.content !== null) {
    return { note: cachedToNote(cached), offline: !isTempId(targetId) };
  }

  return null;
}

// Combina a lista do servidor com o cache local, mantendo visíveis as alterações
// pendentes (create/update offline) e escondendo as exclusões pendentes.
export async function mergeSummaries(
  server: NoteSummary[],
  cached: NoteSummary[],
): Promise<NoteSummary[]> {
  const pending = await pendingKinds();
  if (pending.size === 0) return server;

  const localById = new Map(cached.map((item) => [item.id, item]));
  const merged: NoteSummary[] = [];
  const seen = new Set<number>();

  for (const item of server) {
    const kind = pending.get(item.id);
    if (kind === "delete") continue;

    seen.add(item.id);
    const local = localById.get(item.id);
    merged.push(kind && local ? { ...local, pending: true } : item);
  }

  for (const item of cached) {
    const kind = pending.get(item.id);
    if (!kind || kind === "delete" || seen.has(item.id)) continue;
    merged.push({ ...item, pending: true });
  }

  return merged.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return b.id - a.id;
  });
}

export async function markPending(
  summaries: NoteSummary[],
): Promise<NoteSummary[]> {
  const pending = await pendingKinds();
  if (pending.size === 0) return summaries;

  return summaries.map((item) =>
    pending.has(item.id) ? { ...item, pending: true } : item,
  );
}

export async function pendingNoteIdSet(): Promise<Set<number>> {
  const pending = await pendingKinds();
  return new Set(pending.keys());
}

export type ConflictChoice = "local" | "server" | "both";

// Resolve um conflito de sincronização. "server" descarta a edição local,
// "local" sobrescreve o servidor com a versão local e "both" cria uma cópia
// local como nova anotação, mantendo a versão do servidor na original.
export async function resolveConflict(
  noteId: number,
  choice: ConflictChoice,
): Promise<boolean> {
  const conflict = await getConflict(noteId);
  if (!conflict) return true;

  if (choice === "local") {
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: conflict.localTitle,
          content: conflict.localContent,
        }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { note: Note };
      await cacheNote(data.note);
    } catch {
      return false;
    }
    await removeOpsForNote(noteId);
    await removeConflict(noteId);
    return true;
  }

  if (choice === "server") {
    await removeOpsForNote(noteId);
    await removeConflict(noteId);
    try {
      const response = await fetch(`/api/notes/${noteId}`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { note: Note };
        await cacheNote(data.note);
      }
    } catch {
      // mantém a cópia do servidor já guardada no conflito
      await putServerSnapshot(noteId, conflict);
    }
    return true;
  }

  // both
  try {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: conflict.localTitle,
        content: conflict.localContent,
      }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { note: Note };
    await cacheNote(data.note);
  } catch {
    return false;
  }
  await removeOpsForNote(noteId);
  await removeConflict(noteId);
  await putServerSnapshot(noteId, conflict);
  return true;
}

async function putServerSnapshot(
  noteId: number,
  conflict: ConflictRecord,
): Promise<void> {
  const existing = await getCachedNote(noteId);
  await putCachedNote({
    id: noteId,
    title: conflict.serverTitle,
    content: conflict.serverContent,
    preview: previewFromContent(conflict.serverContent),
    attachmentCount: existing?.attachmentCount ?? 0,
    attachments: existing?.attachments ?? [],
    createdAt: existing?.createdAt ?? conflict.serverUpdatedAt,
    updatedAt: conflict.serverUpdatedAt,
    serverUpdatedAt: conflict.serverUpdatedAt,
    full: true,
  });
}
