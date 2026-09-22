import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const BoldIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M7 12h6.5a3.5 3.5 0 0 1 0 7H7z" />
  </Base>
);

export const ItalicIcon = (props: IconProps) => (
  <Base {...props}>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </Base>
);

export const UnderlineIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 4v6a6 6 0 0 0 12 0V4" />
    <line x1="5" y1="20" x2="19" y2="20" />
  </Base>
);

export const StrikeIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M16 6.5A4 4 0 0 0 12 5c-2.4 0-4 1.2-4 3 0 1 .5 1.8 1.6 2.5" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <path d="M8 17.5A4 4 0 0 0 12 19c2.6 0 4.2-1.2 4.2-3 0-.9-.4-1.6-1.2-2.2" />
  </Base>
);

export const BulletListIcon = (props: IconProps) => (
  <Base {...props}>
    <line x1="9" y1="6" x2="20" y2="6" />
    <line x1="9" y1="12" x2="20" y2="12" />
    <line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="4.5" cy="6" r="0.9" fill="currentColor" />
    <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
    <circle cx="4.5" cy="18" r="0.9" fill="currentColor" />
  </Base>
);

export const OrderedListIcon = (props: IconProps) => (
  <Base {...props}>
    <line x1="10" y1="6" x2="20" y2="6" />
    <line x1="10" y1="12" x2="20" y2="12" />
    <line x1="10" y1="18" x2="20" y2="18" />
    <path d="M4 4h1.5v4" />
    <path d="M3.5 15h2.2l-2.2 3h2.2" />
  </Base>
);

export const QuoteIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M6 5a3 3 0 0 0-3 3v3h4V8" />
    <path d="M18 5a3 3 0 0 0-3 3v3h4V8" />
    <path d="M3 11v4a4 4 0 0 0 4 4" />
    <path d="M15 11v4a4 4 0 0 0 4 4" />
  </Base>
);

export const CodeIcon = (props: IconProps) => (
  <Base {...props}>
    <polyline points="8 7 3 12 8 17" />
    <polyline points="16 7 21 12 16 17" />
  </Base>
);

export const LinkIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
  </Base>
);

export const ImageIcon = (props: IconProps) => (
  <Base {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.4" />
    <path d="m21 15-5-5L5 21" />
  </Base>
);

export const PaperclipIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />
  </Base>
);

export const UndoIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Base>
);

export const RedoIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </Base>
);

export const TrashIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="m6 6 1 14h10l1-14" />
  </Base>
);

export const XIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const PlusIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const SearchIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);

export const SunIcon = (props: IconProps) => (
  <Base {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Base>
);

export const MoonIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Base>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="m15 18-6-6 6-6" />
  </Base>
);

export const DownloadIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </Base>
);

export const FileIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Base>
);

export const NoteIcon = (props: IconProps) => (
  <Base {...props}>
    <path d="M5 4h14v16H5z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </Base>
);
