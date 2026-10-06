import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Email preferences updated",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ ok?: string; error?: string; scope?: string }>;
};

export default async function NotificationsUnsubscribedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const ok = params.ok === "1";
  const error = params.error;
  const digest = params.scope === "digest";

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-12">
        <h1 className="font-bungee text-3xl text-slate-900">Email preferences</h1>
        {ok ? (
          <p className="mt-3 text-sm text-slate-600">
            {digest
              ? "You're unsubscribed from the weekly credit digest. Friend emails are unchanged — you can adjust everything in Account."
              : "You're unsubscribed from friend notification emails. You can turn them back on anytime in Account."}
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            {error === "invalid"
              ? "That unsubscribe link is invalid or expired."
              : "We couldn't update your preferences. Try again from Account, or email hello@coastertrak.com."}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/account"
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400"
          >
            Open Account
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
