"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { getPageMeta } from "@/components/nav";
import { SessionBadge } from "@/components/SessionBadge";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { title, subtitle } = getPageMeta(pathname);

  return (
    <header
      className="h-16 shrink-0 flex items-center gap-3 px-4 sm:px-6 backdrop-blur-xl"
      style={{
        borderBottom: "1px solid var(--border)",
        background:
          "color-mix(in srgb, var(--surface) 72%, transparent)",
      }}
    >
      <button
        onClick={onMenu}
        className="lg:hidden btn-ghost btn !px-2.5 !py-2.5"
        aria-label="Open menu"
      >
        <Icon name="menu" className="w-5 h-5" />
      </button>

      <div className="min-w-0">
        <h1 className="text-base sm:text-lg font-bold leading-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs muted truncate hidden sm:block">{subtitle}</p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <a
          href="https://github.com/pedroslopez/whatsapp-web.js"
          target="_blank"
          rel="noreferrer"
          className="hidden md:inline-flex items-center gap-1.5 text-xs muted hover:text-[var(--accent)] transition-colors"
        >
          <Icon name="bolt" className="w-3.5 h-3.5" />
          powered by whatsapp-web.js
        </a>
        <SessionBadge variant="pill" />
      </div>
    </header>
  );
}
