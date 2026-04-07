import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <Link href="/" className="text-xl font-bold text-slate-900">
          CoasterTrak
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/map" className="text-slate-700 hover:text-slate-900">
            Map
          </Link>
          <Link href="/wishlist" className="text-slate-700 hover:text-slate-900">
            Wishlist
          </Link>
          <Link href="/stats" className="text-slate-700 hover:text-slate-900">
            Stats
          </Link>
          <Link href="/login" className="rounded bg-slate-900 px-3 py-2 text-white">
            Login
          </Link>
        </div>
      </nav>
    </header>
  );
}
