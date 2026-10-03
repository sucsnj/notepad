import fs from "node:fs";
import path from "node:path";
import { getDb, uploadDir } from "./db";
import type { Attachment, AttachmentKind } from "./types";

interface FileRow {
  id: number;
  note_id: number;
  original_name: string;
  stored_name: string;
  mime_type: string;
  web_path: string;
  size: number;
  kind: string;
  created_at: string;
}

const legacyUploadDir = path.resolve(process.cwd(), "public", "uploads");
const attachmentUrlPrefix = "/api/attachments/";
const legacyUploadPrefix = "/uploads/";

function getAttachmentUrl(noteId: number, storedName: string): string {
  return `${attachmentUrlPrefix}${noteId}/${encodeURIComponent(storedName)}`;
}

function mapAttachment(row: FileRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    url: getAttachmentUrl(row.note_id, row.stored_name),
    kind: row.kind === "image" ? "image" : "file",
    createdAt: row.created_at,
  };
}

export function listAttachments(noteId: number): Attachment[] {
  const rows = getDb()
    .prepare("SELECT * FROM files WHERE note_id = ? ORDER BY id ASC")
    .all(noteId) as unknown as FileRow[];
  return rows.map(mapAttachment);
}

export function rewriteAttachmentUrls(noteId: number, content: string): string {
  const rows = getDb()
    .prepare("SELECT stored_name, web_path FROM files WHERE note_id = ?")
    .all(noteId) as unknown as Pick<FileRow, "stored_name" | "web_path">[];

  return rows.reduce((result, row) => {
    if (!row.web_path.startsWith(legacyUploadPrefix)) return result;
    return result.replaceAll(
      row.web_path,
      getAttachmentUrl(noteId, row.stored_name),
    );
  }, content);
}

export function findAttachmentFile(noteId: number, storedName: string) {
  if (path.basename(storedName) !== storedName) return null;

  const row = getDb()
    .prepare("SELECT * FROM files WHERE note_id = ? AND stored_name = ?")
    .get(noteId, storedName) as unknown as FileRow | undefined;

  if (!row) return null;

  const roots = [...new Set([path.resolve(uploadDir), legacyUploadDir])];
  const filePaths = roots
    .map((root) => path.resolve(root, String(noteId), row.stored_name))
    .filter((filePath, index) =>
      filePath.startsWith(roots[index] + path.sep),
    );
  if (filePaths.length === 0) return null;
  const filePath = filePaths.find((candidate) => fs.existsSync(candidate)) ?? filePaths[0];

  return {
    filePath,
    mimeType: row.mime_type,
    originalName: row.original_name,
  };
}

export function insertAttachment(input: {
  noteId: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  webPath: string;
  size: number;
  kind: AttachmentKind;
}): Attachment {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO files (note_id, original_name, stored_name, mime_type, web_path, size, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.noteId,
      input.originalName,
      input.storedName,
      input.mimeType,
      input.webPath,
      input.size,
      input.kind,
    );

  const row = db
    .prepare("SELECT * FROM files WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as unknown as FileRow;

  return mapAttachment(row);
}

export function deleteAttachment(
  attachmentId: number,
  noteId: number,
): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM files WHERE id = ? AND note_id = ?")
    .get(attachmentId, noteId) as FileRow | undefined;

  if (!row) return false;

  db.prepare("DELETE FROM files WHERE id = ? AND note_id = ?").run(
    attachmentId,
    noteId,
  );
  removeStoredFile(row.web_path);
  return true;
}

function resolveUploadPaths(webPath: string): string[] {
  const prefix = webPath.startsWith(attachmentUrlPrefix)
    ? attachmentUrlPrefix
    : webPath.startsWith(legacyUploadPrefix)
      ? legacyUploadPrefix
      : null;
  if (!prefix) return [];

  let segments: string[];
  try {
    segments = decodeURIComponent(webPath.slice(prefix.length)).split("/");
  } catch {
    return [];
  }

  if (
    segments.length !== 2 ||
    !/^\d+$/.test(segments[0]) ||
    path.basename(segments[1]) !== segments[1]
  ) {
    return [];
  }

  const roots = [...new Set([path.resolve(uploadDir), legacyUploadDir])];
  return roots
    .map((root) => path.resolve(root, segments[0], segments[1]))
    .filter((filePath, index) =>
      filePath.startsWith(roots[index] + path.sep),
    );
}

export function removeStoredFile(webPath: string): void {
  for (const filePath of resolveUploadPaths(webPath)) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      console.error(`Falha ao remover o arquivo ${webPath}`, error);
    }
  }
}
