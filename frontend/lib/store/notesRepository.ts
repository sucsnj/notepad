import {
  cacheNote,
  deleteCachedNote,
  getCachedNote,
  getMeta,
  setMeta,
} from "./notesStore";
import { enqueue, pendingKinds, removeOpsForNote } from "./outbox";
import type { CachedNote } from "./db";
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
  if (!isTempId(id)) {
    try {
      const response = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.ok) {
        const data = (await response.json()) as { note: Note };
        await cacheNote(data.note);
        await removeOpsForNote(id);
        return { saved: true, queued: false };
      }
    } catch {
      // sem conexão; grava localmente e enfileira
    }
  }

  const cached = await getCachedNote(id);
  const timestamp = nowSqlite();
  await cacheNote({
    id,
    title: input.title,
    content: input.content,
    createdAt: cached?.createdAt ?? timestamp,
    updatedAt: timestamp,
    attachments: cached?.attachments ?? [],
  });
  await enqueue({
    kind: "update",
    noteId: id,
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
  await cacheNote(note);
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
  await deleteCachedNote(id);

  if (isTempId(id)) {
    // Nunca chegou ao servidor: basta descartar a fila.
    await removeOpsForNote(id);
    return { queued: false };
  }

  try {
    const response = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (response.ok) {
      await removeOpsForNote(id);
      return { queued: false };
    }
  } catch {
    // sem conexão; enfileira a exclusão
  }

  await enqueue({ kind: "delete", noteId: id, createdAt: nowSqlite() });
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
  const pending = await pendingKinds();
  const kind = pending.get(id);

  if (kind === "delete") return null;

  // Com alteração local pendente, a cópia local é a fonte da verdade.
  if (kind === "create" || kind === "update") {
    const cached = await getCachedNote(id);
    if (cached?.full && cached.content !== null) {
      return { note: cachedToNote(cached), offline: false };
    }
  }

  if (!isTempId(id)) {
    try {
      const response = await fetch(`/api/notes/${id}`, { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { note: Note };
        await cacheNote(data.note);
        return { note: data.note, offline: false };
      }
    } catch {
      // cai para o cache local
    }
  }

  const cached = await getCachedNote(id);
  if (cached?.full && cached.content !== null) {
    return { note: cachedToNote(cached), offline: !isTempId(id) };
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
