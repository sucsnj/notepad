import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { maxUploadBytes, uploadDir } from "./db";
import { insertAttachment } from "./attachments";
import { getNote } from "./notes";
import type { Attachment, AttachmentKind } from "./types";

export class UploadError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

function sanitizeFileName(name: string): string {
  const base = path
    .basename(name || "arquivo")
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 120);

  return base || "arquivo";
}

export async function saveUpload(noteId: number, file: File): Promise<Attachment> {
  if (!getNote(noteId)) {
    throw new UploadError("Anotação não encontrada", 404);
  }
  if (file.size === 0) {
    throw new UploadError("O arquivo enviado está vazio");
  }
  if (file.size > maxUploadBytes) {
    throw new UploadError(
      `O arquivo excede o limite de ${Math.round(maxUploadBytes / (1024 * 1024))} MB`,
      413,
    );
  }

  const directory = path.join(uploadDir, String(noteId));
  fs.mkdirSync(directory, { recursive: true });

  const storedName = `${Date.now()}-${randomBytes(4).toString("hex")}-${sanitizeFileName(
    file.name,
  )}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(directory, storedName), bytes);

  const mimeType = file.type || "application/octet-stream";
  const kind: AttachmentKind = mimeType.startsWith("image/") ? "image" : "file";

  return insertAttachment({
    noteId,
    originalName: file.name || storedName,
    storedName,
    mimeType,
    webPath: `/uploads/${noteId}/${storedName}`,
    size: file.size,
    kind,
  });
}
