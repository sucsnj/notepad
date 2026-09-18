"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import type { Attachment, Note, SaveStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime } from "@/lib/format";
import EditorToolbar from "./EditorToolbar";
import {
  ChevronLeftIcon,
  DownloadIcon,
  FileIcon,
  ImageIcon,
  TrashIcon,
} from "./Icons";

export interface EditorChange {
  title: string;
  content: string;
  textContent: string;
}

export interface NoteEditorProps {
  note: Note;
  status: SaveStatus;
  onChange: (change: EditorChange) => void;
  onDelete: () => void;
  onBack: () => void;
}

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
  Image.configure({ inline: false, allowBase64: false }),
  Placeholder.configure({ placeholder: "Comece a escrever suas anotações…" }),
];

const statusLabel: Record<SaveStatus, string> = {
  idle: "",
  pending: "Alterações não salvas",
  saving: "Salvando…",
  saved: "Salvo",
  error: "Erro ao salvar",
};

export default function NoteEditor({
  note,
  status,
  onChange,
  onDelete,
  onBack,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [attachments, setAttachments] = useState<Attachment[]>(note.attachments);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const titleRef = useRef(title);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: note.content || "",
    editorProps: {
      attributes: {
        class: "editor-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current({
        title: titleRef.current,
        content: instance.getHTML(),
        textContent: instance.getText(),
      });
    },
  });

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setTitle(value);
    onChangeRef.current({
      title: value,
      content: editor?.getHTML() ?? note.content,
      textContent: editor?.getText() ?? "",
    });
  };

  const handleUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    mode: "image" | "file",
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) return;

    setUploading(true);
    setUploadError(null);

    try {
      const form = new FormData();
      form.append("noteId", String(note.id));
      form.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Falha ao enviar o arquivo");
      }

      const attachment = data.attachment as Attachment;
      setAttachments((previous) => [...previous, attachment]);

      if (mode === "image") {
        editor
          .chain()
          .focus()
          .setImage({
            src: attachment.url,
            alt: attachment.originalName,
            title: attachment.originalName,
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "paragraph",
            content: [
              {
                type: "text",
                text: attachment.originalName,
                marks: [{ type: "link", attrs: { href: attachment.url } }],
              },
            ],
          })
          .run();
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Falha ao enviar o arquivo",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          title="Voltar para a lista"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden"
        >
          <ChevronLeftIcon />
        </button>

        <span
          className={cn(
            "text-xs",
            status === "error" ? "text-danger" : "text-muted-foreground",
          )}
        >
          {statusLabel[status] ||
            (note.updatedAt ? `Editado em ${formatDateTime(note.updatedAt)}` : "")}
        </span>

        <button
          type="button"
          onClick={onDelete}
          title="Excluir anotação"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-danger"
        >
          <TrashIcon />
        </button>
      </header>

      <div className="shrink-0 px-4 pb-2 pt-3">
        <input
          value={title}
          onChange={handleTitleChange}
          placeholder="Título da anotação"
          className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
        />

        {attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                download={attachment.kind === "file" ? attachment.originalName : undefined}
                title={`${attachment.originalName} (${formatBytes(attachment.size)})`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                {attachment.kind === "image" ? (
                  <ImageIcon width={13} height={13} />
                ) : (
                  <FileIcon width={13} height={13} />
                )}
                <span className="max-w-40 truncate">{attachment.originalName}</span>
                <DownloadIcon width={13} height={13} />
              </a>
            ))}
          </div>
        )}

        {uploadError && (
          <p className="mt-2 text-xs text-danger">{uploadError}</p>
        )}
      </div>

      <EditorToolbar
        editor={editor}
        uploading={uploading}
        onPickImage={() => imageInputRef.current?.click()}
        onPickFile={() => fileInputRef.current?.click()}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleUpload(event, "image")}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => handleUpload(event, "file")}
      />

      <div className="flex-1 overflow-y-auto">
        <EditorContent
          editor={editor}
          className="mx-auto w-full max-w-3xl px-4 py-4"
        />
      </div>

      {uploading && (
        <p className="border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
          Enviando arquivo…
        </p>
      )}
    </div>
  );
}
