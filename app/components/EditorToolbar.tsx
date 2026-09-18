"use client";

import type { ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { cn } from "@/lib/cn";
import {
  BoldIcon,
  BulletListIcon,
  CodeIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  PaperclipIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  UnderlineIcon,
  UndoIcon,
} from "./Icons";

export interface EditorToolbarProps {
  editor: Editor | null;
  uploading: boolean;
  onPickImage: () => void;
  onPickFile: () => void;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm font-medium transition",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

export default function EditorToolbar({
  editor,
  uploading,
  onPickImage,
  onPickFile,
}: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance?.isActive("bold") ?? false,
      italic: instance?.isActive("italic") ?? false,
      underline: instance?.isActive("underline") ?? false,
      strike: instance?.isActive("strike") ?? false,
      bulletList: instance?.isActive("bulletList") ?? false,
      orderedList: instance?.isActive("orderedList") ?? false,
      blockquote: instance?.isActive("blockquote") ?? false,
      code: instance?.isActive("code") ?? false,
      link: instance?.isActive("link") ?? false,
      h1: instance?.isActive("heading", { level: 1 }) ?? false,
      h2: instance?.isActive("heading", { level: 2 }) ?? false,
      h3: instance?.isActive("heading", { level: 3 }) ?? false,
      canUndo: instance?.can().undo() ?? false,
      canRedo: instance?.can().redo() ?? false,
    }),
  });

  if (!editor || !state) return null;

  const chain = () => editor.chain().focus();

  const handleLink = () => {
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    const input = window.prompt("Endereço do link (URL):", previous);
    if (input === null) return;

    const url = input.trim();
    if (!url) {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }

    const href = /^(https?:|mailto:|\/)/i.test(url) ? url : `https://${url}`;
    chain().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-card/60 px-2 py-1.5">
      <ToolbarButton
        title="Desfazer"
        disabled={!state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <UndoIcon />
      </ToolbarButton>
      <ToolbarButton
        title="Refazer"
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <RedoIcon />
      </ToolbarButton>

      <Divider />

      <ToolbarButton active={state.h1} title="Título 1" onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        H1
      </ToolbarButton>
      <ToolbarButton active={state.h2} title="Título 2" onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarButton>
      <ToolbarButton active={state.h3} title="Título 3" onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarButton>

      <Divider />

      <ToolbarButton active={state.bold} title="Negrito" onClick={() => chain().toggleBold().run()}>
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton active={state.italic} title="Itálico" onClick={() => chain().toggleItalic().run()}>
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton active={state.underline} title="Sublinhado" onClick={() => chain().toggleUnderline().run()}>
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton active={state.strike} title="Tachado" onClick={() => chain().toggleStrike().run()}>
        <StrikeIcon />
      </ToolbarButton>
      <ToolbarButton active={state.code} title="Código" onClick={() => chain().toggleCode().run()}>
        <CodeIcon />
      </ToolbarButton>

      <Divider />

      <ToolbarButton active={state.bulletList} title="Lista com marcadores" onClick={() => chain().toggleBulletList().run()}>
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton active={state.orderedList} title="Lista numerada" onClick={() => chain().toggleOrderedList().run()}>
        <OrderedListIcon />
      </ToolbarButton>
      <ToolbarButton active={state.blockquote} title="Citação" onClick={() => chain().toggleBlockquote().run()}>
        <QuoteIcon />
      </ToolbarButton>

      <Divider />

      <ToolbarButton active={state.link} title="Inserir link" onClick={handleLink}>
        <LinkIcon />
      </ToolbarButton>
      <ToolbarButton title="Inserir imagem" disabled={uploading} onClick={onPickImage}>
        <ImageIcon />
      </ToolbarButton>
      <ToolbarButton
        title="Anexar arquivo"
        disabled={uploading}
        onClick={onPickFile}
      >
        <PaperclipIcon />
      </ToolbarButton>
    </div>
  );
}
