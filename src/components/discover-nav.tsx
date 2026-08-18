"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/map", label: "Map", isActive: (path: string) => path === "/map" },
  {
    href: "/parks",
    label: "Parks",
    isActive: (path: string) => path === "/parks" || path.startsWith("/parks/"),
  },
  {
    href: "/coasters",
    label: "Coasters",
    isActive: (path: string) => path === "/coasters" || path.startsWith("/coasters/"),
  },
] as const;

export function DiscoverNav({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Discover"
      className={["flex flex-wrap gap-2", className].filter(Boolean).join(" ")}
    >
      {TABS.map((tab) => {
        const active = tab.isActive(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "border-amber-300 bg-amber-100 text-amber-950"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
