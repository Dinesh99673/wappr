"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { NAV_SECTIONS } from "@/components/nav";
import { SessionBadge } from "@/components/SessionBadge";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [authEnabled, setAuthEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAuthEnabled(Boolean(d.enabled)))
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <aside
      className="w-64 shrink-0 h-full flex flex-col"
      style={{
        background:
          "linear-gradient(180deg, var(--side) 0%, var(--side-2) 100%)",
        borderRight: "1px solid var(--side-border)",
        color: "var(--side-text)",
      }}
    >
      {/* Brand */}
      <div
        className="h-16 flex items-center gap-3 px-5 shrink-0"
        style={{ borderBottom: "1px solid var(--side-border)" }}
      >
        <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-[#04130d]"
            fill="currentColor"
          >
            <path d="M12 2a10 10 0 0 0-8.7 15l-1.2 4.4a.8.8 0 0 0 1 1l4.5-1.2A10 10 0 1 0 12 2Zm0 3.3a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm2 12.2h-4a.9.9 0 0 1 0-1.8h.6v-4h-.5a.9.9 0 0 1 0-1.8h1.4c.5 0 .9.4.9.9v4.9h1.6a.9.9 0 0 1 0 1.8Z" />
          </svg>
        </span>
        <div className="leading-tight">
          <div className="font-bold text-[15px] text-white tracking-tight">
            Wappr
          </div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: "var(--side-muted)" }}
          >
            WhatsApp console
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div
              className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--side-muted)" }}
            >
              {section.title}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                    style={
                      active
                        ? {
                            background: "var(--side-active)",
                            color: "#fff",
                          }
                        : undefined
                    }
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-emerald-400" />
                    )}
                    <Icon
                      name={item.icon}
                      className={`w-[18px] h-[18px] shrink-0 ${
                        active
                          ? "text-emerald-400"
                          : "text-slate-400 group-hover:text-slate-200"
                      }`}
                    />
                    <span className="flex flex-col">
                      <span
                        className={`text-sm font-medium ${
                          active ? "text-white" : "group-hover:text-white"
                        }`}
                      >
                        {item.label}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--side-muted)" }}
                      >
                        {item.desc}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Session footer */}
      <div
        className="p-3 shrink-0 space-y-2"
        style={{ borderTop: "1px solid var(--side-border)" }}
      >
        <SessionBadge variant="sidebar" />
        {authEnabled && (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Icon name="logout" className="w-[18px] h-[18px] shrink-0" />
            Sign out
          </button>
        )}
        <p
          className="text-[10px] leading-relaxed px-1"
          style={{ color: "var(--side-muted)" }}
        >
          Unofficial client · {authEnabled ? "password protected" : "no dashboard auth"} · self-hosted
        </p>
      </div>
    </aside>
  );
}
