import { getDb } from "./db";
import { listAttachments, removeStoredFile } from "./attachments";
import { htmlToText } from "./text";
import type { Note, NoteSummary } from "./types";

const PREVIEW_LENGTH = 160;

interface NoteRow {
  id: number;
  title: string;
  content: string;
  text_content: string;
  created_at: string;
  updated_at: string;
}

interface SummaryRow {
  id: number;
  title: string;
  text_content: string;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export interface NoteInput {
  title?: string;
  content?: string;
  textContent?: string;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function listNotes(query = ""): NoteSummary[] {
  const db = getDb();
  const term = query.trim();

  const baseSelect = `
    SELECT
      n.id,
      n.title,
      n.text_content,
      n.created_at,
      n.updated_at,
      (SELECT COUNT(*) FROM files f WHERE f.note_id = n.id) AS attachment_count
    FROM notes n
  `;

  let rows: SummaryRow[];

  if (term) {
    const like = `%${escapeLike(term)}%`;
    rows = db
      .prepare(
        `${baseSelect}
         WHERE n.title LIKE ? ESCAPE '\\' OR n.text_content LIKE ? ESCAPE '\\'
         ORDER BY n.updated_at DESC, n.id DESC`,
      )
      .all(like, like) as SummaryRow[];
  } else {
    rows = db
      .prepare(`${baseSelect} ORDER BY n.updated_at DESC, n.id DESC`)
      .all() as SummaryRow[];
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    preview: row.text_content.slice(0, PREVIEW_LENGTH),
    attachmentCount: row.attachment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getNote(id: number): Note | null {
  const row = getDb()
    .prepare("SELECT * FROM notes WHERE id = ?")
    .get(id) as NoteRow | undefined;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: listAttachments(id),
  };
}

export function createNote(input: NoteInput = {}): Note {
  const title = input.title ?? "";
  const content = input.content ?? "";
  const textContent = input.textContent ?? htmlToText(content);

  const info = getDb()
    .prepare("INSERT INTO notes (title, content, text_content) VALUES (?, ?, ?)")
    .run(title, content, textContent);

  return getNote(Number(info.lastInsertRowid)) as Note;
}

export function updateNote(id: number, input: NoteInput): Note | null {
  const existing = getNote(id);
  if (!existing) return null;

  const title = input.title ?? existing.title;
  const content = input.content ?? existing.content;
  const textContent = input.textContent ?? htmlToText(content);

  getDb()
    .prepare(
      `UPDATE notes
       SET title = ?, content = ?, text_content = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(title, content, textContent, id);

  return getNote(id);
}

export function deleteNote(id: number): boolean {
  const attachments = listAttachments(id);
  const info = getDb().prepare("DELETE FROM notes WHERE id = ?").run(id);

  if (info.changes === 0) return false;

  for (const attachment of attachments) {
    removeStoredFile(attachment.url);
  }

  return true;
}
