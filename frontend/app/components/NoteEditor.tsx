"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import type { Attachment, Note, SaveStatus } from "@/lib/types";
import { isLocalUrl, resolveLocalUrl } from "@/lib/store/blobs";
import {
  attachFile,
  removeAttachment as removeAttachmentRecord,
} from "@/lib/store/attachmentsRepository";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime } from "@/lib/format";
import EditorToolbar from "./EditorToolbar";
import {
  ChevronLeftIcon,
  DownloadIcon,
  FileIcon,
  ImageIcon,
  TrashIcon,
  XIcon,
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

// Imagens anexadas offline usam "notepad-local://<id>"; o node view troca
// pela URL real (object URL do blob) assim que ela estiver disponível.
const LocalAwareImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("img");
      const src = String(node.attrs.src ?? "");

      if (isLocalUrl(src)) {
        dom.alt = String(node.attrs.alt ?? "");
        void resolveLocalUrl(src).then((url) => {
          if (url) dom.src = url;
        });
      } else {
        dom.src = src;
        if (node.attrs.alt) dom.alt = String(node.attrs.alt);
      }

      if (node.attrs.title) dom.title = String(node.attrs.title);
      return { dom };
    };
  },
});

const extensions = [
  Extension.create({
    name: "lineHeight",
    addGlobalAttributes() {
      return [
        {
          types: ["paragraph", "heading"],
          attributes: {
            lineHeight: {
              default: null,
              parseHTML: (element) => element.style.lineHeight || null,
              renderHTML: (attributes) => {
                if (!attributes.lineHeight) return {};
                const parsed = Number.parseFloat(String(attributes.lineHeight));
                if (!Number.isFinite(parsed)) return {};
                return { style: `line-height: ${Math.max(parsed, 1)}` };
              },
            },
          },
        },
      ];
    },
  }),
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
  LocalAwareImage.configure({ inline: false, allowBase64: false }),
  Placeholder.configure({ placeholder: "Comece a escrever suas anotações…" }),
];

const statusLabel: Record<SaveStatus, string> = {
  idle: "",
  pending: "Alterações não salvas",
  saving: "Salvando…",
  saved: "Salvo",
  queued: "Salvo offline · sincroniza depois",
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
  const [localUrls, setLocalUrls] = useState<Record<number, string>>({});

  // Anexos locais (ainda não subidos) precisam de uma object URL para abrir.
  useEffect(() => {
    const locals = attachments.filter((item) => isLocalUrl(item.url));
    if (locals.length === 0) return;

    let cancelled = false;

    void Promise.all(
      locals.map(async (item) => {
        const url = await resolveLocalUrl(item.url);
        return [item.id, url] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<number, string> = {};
      for (const [id, url] of entries) {
        if (url) next[id] = url;
      }
      setLocalUrls(next);
    });

    return () => {
      cancelled = true;
    };
  }, [attachments]);

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
      // Links para anexos locais só podem ser abertos pelo blob.
      handleClick: (_view, _pos, event) => {
        const anchor = (event.target as HTMLElement | null)?.closest?.("a");
        const href = anchor?.getAttribute("href");
        if (!href || !isLocalUrl(href)) return false;

        event.preventDefault();
        void resolveLocalUrl(href).then((url) => {
          if (url) window.open(url, "_blank", "noopener");
        });
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current({
        title: titleRef.current,
        content: instance.getHTML(),
        textContent: instance.getText(),
      });
    },
    onSelectionUpdate: ({ editor: instance }) => {
      const { selection } = instance.state;
      const domNode = instance.view.nodeDOM(selection.from) as HTMLElement
      || instance.view.domAtPos(selection.from).node as HTMLElement;

      const element = domNode?.nodeType === 1 ? domNode : domNode?.parentElement;

      if (element && typeof element.scrollIntoView === "function") {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
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

  const handleRemoveAttachment = async (attachment: Attachment) => {
    setUploadError(null);

    try {
      await removeAttachmentRecord(note.id, attachment);
      setAttachments((previous) =>
        previous.filter((item) => item.id !== attachment.id),
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Falha ao remover o anexo",
      );
    }
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
      const { attachment } = await attachFile(note.id, file);
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
        <div className="min-w-0 flex-1 px-4 pb-2 pt-3">
          <input
            value={title}
            onChange={handleTitleChange}
            placeholder="Título da anotação"
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
          />

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachments.map((attachment) => {
                const href = localUrls[attachment.id] ?? attachment.url;
                const ready = !isLocalUrl(attachment.url) || !!localUrls[attachment.id];

                return (
                  <div
                    key={attachment.id}
                    className="inline-flex max-w-full items-center rounded-full border border-border bg-card text-xs text-muted-foreground"
                  >
                    <a
                      href={ready ? href : undefined}
                      target="_blank"
                      rel="noreferrer"
                      download={attachment.kind === "file" ? attachment.originalName : undefined}
                      title={`${attachment.originalName} (${formatBytes(attachment.size)})`}
                      className={cn(
                        "inline-flex min-w-0 items-center gap-1.5 py-1 pl-2.5 transition hover:text-foreground",
                        !ready && "pointer-events-none opacity-60",
                      )}
                    >
                      {attachment.kind === "image" ? (
                        <ImageIcon width={13} height={13} />
                      ) : (
                        <FileIcon width={13} height={13} />
                      )}
                      <span className="max-w-40 truncate">{attachment.originalName}</span>
                      {attachment.pending ? (
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                          offline
                        </span>
                      ) : (
                        <DownloadIcon width={13} height={13} />
                      )}
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(attachment)}
                      title="Remover anexo"
                      aria-label={`Remover ${attachment.originalName}`}
                      className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-muted hover:text-danger"
                    >
                      <XIcon width={12} height={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-xs text-danger">{uploadError}</p>
          )}
        </div>
      </header>
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

      <footer className="flex items-center gap-1.5 border-t border-border px-2 py-1 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={onBack}
          title="Voltar para a lista"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-muted hover:text-foreground md:hidden"
        >
          <ChevronLeftIcon width={15} height={15} />
        </button>

        <span
          className={cn(
            "truncate",
            status === "error" ? "text-danger" : "text-muted-foreground/70",
          )}
        >
          {statusLabel[status] ||
            (note.updatedAt ? `Editado em ${formatDateTime(note.updatedAt)}` : "")}
        </span>

        <button
          type="button"
          onClick={onDelete}
          title="Excluir anotação"
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-muted hover:text-danger"
        >
          <TrashIcon width={14} height={14} />
        </button>
      </footer>
    </div>
  );
}
