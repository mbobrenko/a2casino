// Small inline line icons (24×24, currentColor) for the lobby. Hand-drawn, no icon library.
import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  all: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  slots: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M9 5v14M15 5v14" /><path d="M5.5 10.5h2l-1.4 3M11.5 10.5h2l-1.4 3M17.5 10.5h2l-1.4 3" /></>,
  table: <><rect x="4" y="5" width="10" height="14" rx="2" transform="rotate(-10 9 12)" /><rect x="10" y="5" width="10" height="14" rx="2" transform="rotate(10 15 12)" /><path d="M15 10.5c-1-1.6-3 0-1.3 1.6L15 13.4l1.3-1.3c1.7-1.6-.3-3.2-1.3-1.6z" /></>,
  crash: <><path d="M3 20h18" /><path d="M4 18c6 0 10-3 13-12" /><path d="M14 6h3.5V9.5" /></>,
  instant: <path d="M13 2 5 13.5h6L10 22l8-11.5h-6z" />,
  dice: <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.2" /><circle cx="15" cy="15" r="1.2" /><circle cx="12" cy="12" r="1.2" /></>,
  live: <><circle cx="12" cy="12" r="3" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none" />,
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  fire: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 3 0-3 .2-5.6 1-8.5z" />,
  sparkle: <><path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z" /><path d="M19 3v3M17.5 4.5h3" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  bolt: <path d="M13 2 5 13.5h6L10 22l8-11.5h-6z" />,
  shield: <><path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  studio: <><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /></>,
};

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={"icon" + (className ? " " + className : "")} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.all}
    </svg>
  );
}
