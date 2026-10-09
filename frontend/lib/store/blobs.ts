import { getDB, type StoredBlob } from "./db";
import { getMeta, setMeta } from "./notesStore";
import type { Attachment } from "@/lib/types";

// Esquema de URL usado apenas no cliente para referência a anexos que ainda
// não subiram. Ex.: "notepad-local://-3" -> anexo local de id -3.
export const LOCAL_SCHEME = "notepad-local://";

export function localUrl(attachmentId: number): string {
  return `${LOCAL_SCHEME}${attachmentId}`;
}

export function isLocalUrl(url: string): boolean {
  return url.startsWith(LOCAL_SCHEME);
}

export function parseLocalId(url: string): number | null {
  if (!isLocalUrl(url)) return null;
  const value = Number(url.slice(LOCAL_SCHEME.length));
  return Number.isFinite(value) ? value : null;
}

export async function putBlob(record: StoredBlob): Promise<void> {
  const db = await getDB();
  await db.put("blobs", record);
}

export async function getBlob(id: number): Promise<StoredBlob | undefined> {
  const db = await getDB();
  return db.get("blobs", id);
}

export async function deleteBlob(id: number): Promise<void> {
  const db = await getDB();
  revokeLocalUrl(id);
  await db.delete("blobs", id);
}

export async function listBlobs(noteId?: number): Promise<StoredBlob[]> {
  const db = await getDB();
  const all = await db.getAll("blobs");
  return noteId === undefined ? all : all.filter((item) => item.noteId === noteId);
}

export async function deleteBlobsForNote(noteId: number): Promise<void> {
  const db = await getDB();
  for (const item of await listBlobs(noteId)) {
    revokeLocalUrl(item.id);
    await db.delete("blobs", item.id);
  }
}

// Object URLs vivas por anexo local, para não recriar a cada renderização.
const urlCache = new Map<number, string>();

export function revokeLocalUrl(id: number): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

export async function resolveLocalUrl(url: string): Promise<string | null> {
  const id = parseLocalId(url);
  if (id === null) return null;

  const cached = urlCache.get(id);
  if (cached) return cached;

  const record = await getBlob(id);
  if (!record) return null;

  const objectUrl = URL.createObjectURL(record.blob);
  urlCache.set(id, objectUrl);
  return objectUrl;
}

// Ids locais de anexo são negativos (como as notas criadas offline).
export async function nextLocalAttachmentId(): Promise<number> {
  const current = (await getMeta<number>("tempAttachmentId")) ?? 0;
  const next = current - 1;
  await setMeta("tempAttachmentId", next);
  return next;
}

// Reconstrói os anexos locais (ainda não enviados) de uma nota a partir dos
// blobs guardados — usado ao reconciliar uma nota criada offline.
export async function localAttachmentsFor(noteId: number): Promise<Attachment[]> {
  const blobs = await listBlobs(noteId);
  return blobs.map((item) => ({
    id: item.id,
    noteId: item.noteId,
    originalName: item.filename,
    mimeType: item.mimeType,
    size: item.size,
    url: localUrl(item.id),
    kind: item.kind,
    createdAt: item.createdAt,
    pending: true,
  }));
}