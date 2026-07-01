import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Wappr — WhatsApp bulk messaging console",
  description:
    "A self-hosted WhatsApp bulk messaging dashboard, powered by whatsapp-web.js.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
