export type AttachmentKind = "image" | "file";

export interface Attachment {
  id: number;
  noteId: number;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  kind: AttachmentKind;
  createdAt: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
}

export interface NoteSummary {
  id: number;
  title: string;
  preview: string;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
