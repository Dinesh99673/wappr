import type { IconName } from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  desc: string;
  icon: IconName;
};

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        desc: "Session & activity",
        icon: "dashboard",
      },
    ],
  },
  {
    title: "Messaging",
    items: [
      {
        href: "/send",
        label: "Send",
        desc: "One-off messages",
        icon: "send",
      },
      {
        href: "/bulk",
        label: "Bulk",
        desc: "CSV campaigns",
        icon: "layers",
      },
      {
        href: "/schedules",
        label: "Schedules",
        desc: "Timed & recurring sends",
        icon: "clock",
      },
    ],
  },
  {
    title: "History",
    items: [
      {
        href: "/history",
        label: "Bulk Sending History",
        desc: "Past bulk sends",
        icon: "list",
      },
    ],
  },
  {
    title: "Developer",
    items: [
      {
        href: "/docs",
        label: "API Docs",
        desc: "REST reference",
        icon: "code",
      },
    ],
  },
];

/** Contextual title + subtitle for the topbar, derived from the pathname. */
export function getPageMeta(pathname: string): {
  title: string;
  subtitle: string;
} {
  if (pathname === "/") return { title: "Dashboard", subtitle: "Session & activity" };
  if (pathname.startsWith("/send"))
    return { title: "Send a message", subtitle: "One-off text or media" };
  if (pathname.startsWith("/bulk"))
    return { title: "Bulk send", subtitle: "Upload a CSV/XLSX and run a campaign" };
  if (pathname.startsWith("/schedules"))
    return { title: "Schedules", subtitle: "Timed & recurring bulk sends" };
  if (pathname.startsWith("/history/"))
    return { title: "Send detail", subtitle: "Per-recipient results" };
  if (pathname.startsWith("/history"))
    return { title: "Bulk Sending History", subtitle: "Everything you've sent in bulk" };
  if (pathname.startsWith("/docs"))
    return { title: "API reference", subtitle: "Drive Wappr from your own code" };
  return { title: "Wappr", subtitle: "" };
}
