import { getDB, type CachedNote } from "./db";
import type { Note, NoteSummary } from "@/lib/types";

const PREVIEW_LENGTH = 160;

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function previewFromContent(content: string | null): string {
  if (content === null) return "";
  return htmlToText(content).slice(0, PREVIEW_LENGTH);
}

export function toSummary(note: CachedNote): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    preview:
      note.content !== null ? previewFromContent(note.content) : note.preview,
    attachmentCount: note.attachmentCount,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export async function cacheSummaries(
  summaries: NoteSummary[],
): Promise<void> {
  if (summaries.length === 0) return;

  const db = await getDB();
  const tx = db.transaction("notes", "readwrite");

  for (const summary of summaries) {
    const existing = await tx.store.get(summary.id);

    const record: CachedNote = {
      id: summary.id,
      title: summary.title,
      content: existing?.content ?? null,
      preview:
        existing?.content != null
          ? previewFromContent(existing.content)
          : summary.preview,
      attachmentCount: summary.attachmentCount,
      attachments: existing?.attachments ?? [],
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      full: existing?.full ?? false,
    };

    await tx.store.put(record);
  }

  await tx.done;
}

export async function cacheNote(note: Note): Promise<void> {
  const db = await getDB();

  const record: CachedNote = {
    id: note.id,
    title: note.title,
    content: note.content,
    preview: previewFromContent(note.content),
    attachmentCount: note.attachments.length,
    attachments: note.attachments,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    full: true,
  };

  await db.put("notes", record);
}

export async function getCachedNote(
  id: number,
): Promise<CachedNote | undefined> {
  const db = await getDB();
  return db.get("notes", id);
}

export async function deleteCachedNote(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("notes", id);
}

export async function listCachedSummaries(
  query = "",
): Promise<NoteSummary[]> {
  const db = await getDB();
  const all = await db.getAll("notes");
  const term = query.trim().toLowerCase();

  const matching = term
    ? all.filter((note) => {
        if (note.title.toLowerCase().includes(term)) return true;
        const haystack =
          note.content !== null ? htmlToText(note.content) : note.preview;
        return haystack.toLowerCase().includes(term);
      })
    : all;

  return matching
    .sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return b.id - a.id;
    })
    .map(toSummary);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", value, key);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get("meta", key)) as T | undefined;
}

type IdMap = Record<string, number>;

export async function setIdMapping(
  tempId: number,
  realId: number,
): Promise<void> {
  const db = await getDB();
  const map = ((await db.get("meta", "idMap")) as IdMap | undefined) ?? {};
  map[String(tempId)] = realId;
  await db.put("meta", map, "idMap");
}

export async function resolveId(id: number): Promise<number> {
  if (id >= 0) return id;
  const db = await getDB();
  const map = ((await db.get("meta", "idMap")) as IdMap | undefined) ?? {};
  return map[String(id)] ?? id;
}
