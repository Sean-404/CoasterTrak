import Link from "next/link";
import { MarkUpdatesSeen } from "@/components/mark-updates-seen";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  PRODUCT_UPDATES,
  formatProductUpdateDate,
} from "@/lib/product-updates";
import { INSTAGRAM_URL } from "@/lib/site-url";

export default function UpdatesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <MarkUpdatesSeen />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Updates</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">
          What’s new
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
          Occasional product notes. Trip photos and short posts still live on{" "}
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-amber-700 underline-offset-2 hover:underline"
          >
            Instagram
          </a>
          .
        </p>

        <ol className="mt-10 space-y-6">
          {PRODUCT_UPDATES.map((update) => (
            <li
              key={update.id}
              className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {formatProductUpdateDate(update.date)}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{update.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{update.summary}</p>
              {update.highlights && update.highlights.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                  {update.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>

        <p className="mt-10 text-sm text-slate-500">
          Looking for help or a catalog fix?{" "}
          <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">
            Contact us
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
