import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function CatalogPageShell({
  children,
  breadcrumb,
}: {
  children: React.ReactNode;
  breadcrumb: { href: string; label: string }[];
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-slate-800">
                Home
              </Link>
            </li>
            {breadcrumb.map((item) => (
              <li key={item.href} className="flex items-center gap-1.5">
                <span aria-hidden>/</span>
                <Link href={item.href} className="hover:text-slate-800">
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function StatGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-1 text-base font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
