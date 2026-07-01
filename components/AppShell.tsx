"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/icons";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // The login page stands alone — no sidebar/topbar (all of which would only
  // bounce back to /login anyway).
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="relative z-10 h-full shadow-2xl">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute -right-11 top-3 grid place-items-center w-9 h-9 rounded-lg bg-black/40 text-white"
                aria-label="Close menu"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
            <div
              className="flex-1 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
          </div>
        )}

        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
