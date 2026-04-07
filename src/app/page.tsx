import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl p-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-3xl font-bold text-slate-900">Track every coaster ride</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            CoasterTrak helps you explore parks worldwide, build your wishlist, and track your coaster stats.
          </p>
          <div className="mt-4 flex gap-3">
            <Link href="/map" className="rounded bg-slate-900 px-4 py-2 text-sm text-white">
              Open map
            </Link>
            <Link href="/login" className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-900">
              Create account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
