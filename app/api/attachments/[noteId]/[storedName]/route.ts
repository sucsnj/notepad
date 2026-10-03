import { readFile } from "node:fs/promises";
import { findAttachmentFile } from "@/lib/attachments";
import { parseId } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ noteId: string; storedName: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { noteId: rawNoteId, storedName } = await context.params;
  const noteId = parseId(rawNoteId);
  if (noteId === null) return new Response("Not found", { status: 404 });

  const attachment = findAttachmentFile(noteId, storedName);
  if (!attachment) {
    console.warn(`[attachments] Metadata not found for note ${noteId}`);
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await readFile(attachment.filePath);
    const isImage = attachment.mimeType.startsWith("image/");
    const safeName = encodeURIComponent(attachment.originalName);

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename*=UTF-8''${safeName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Upload-Handler": "api-attachment-route",
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.warn(`[attachments] Stored file missing for note ${noteId}`);
      return new Response("Not found", { status: 404 });
    }
    console.error("Falha ao ler anexo", error);
    return new Response("Falha ao ler anexo", { status: 500 });
  }
}