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

const uploadPrefix = "/uploads/";

function mapAttachment(row: FileRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    url: row.web_path,
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

function resolveUploadPath(webPath: string): string | null {
  if (!webPath.startsWith(uploadPrefix)) return null;

  const relative = decodeURIComponent(webPath.slice(uploadPrefix.length));
  const absolute = path.resolve(uploadDir, relative);

  if (absolute !== uploadDir && !absolute.startsWith(uploadDir + path.sep)) {
    return null;
  }
  return absolute;
}

export function removeStoredFile(webPath: string): void {
  const absolute = resolveUploadPath(webPath);
  if (!absolute) return;

  try {
    fs.rmSync(absolute, { force: true });
  } catch (error) {
    console.error(`Falha ao remover o arquivo ${webPath}`, error);
  }
}
