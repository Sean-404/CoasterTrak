import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { AdsenseAd } from "@/components/adsense-ad";
import { GUIDES, type GuideMeta, guideAuthor, guidePath, guideUpdated } from "@/lib/guides";
import { SITE_URL } from "@/lib/site-url";

type GuideArticleShellProps = {
  guide: GuideMeta;
  children: ReactNode;
  /** Optional AdSense slot for mid-article unit (only renders when ads enabled). */
  adSlot?: string;
};

function formatGuideDate(isoDate: string): string {
  return new Date(isoDate + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function GuideArticleShell({ guide, children, adSlot }: GuideArticleShellProps) {
  const related = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);
  const author = guideAuthor(guide);
  const updated = guideUpdated(guide);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
      {
        "@type": "ListItem",
        position: 3,
        name: guide.title,
        item: `${SITE_URL}${guidePath(guide.slug)}`,
      },
    ],
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    datePublished: guide.published,
    dateModified: updated,
    author: author
      ? {
          "@type": "Person",
          name: author.name,
          description: author.bio,
          ...(author.url ? { url: author.url.startsWith("/") ? `${SITE_URL}${author.url}` : author.url } : {}),
        }
      : { "@type": "Organization", name: "CoasterTrak", url: SITE_URL },
    publisher: { "@type": "Organization", name: "CoasterTrak", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}${guidePath(guide.slug)}`,
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-800">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/guides" className="hover:text-slate-800">
            Guides
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{guide.title}</span>
        </nav>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Guide</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">
          {guide.title}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          {author ? (
            <>
              By <span className="font-semibold text-slate-700">{author.name}</span> ·{" "}
            </>
          ) : null}
          {guide.readingMinutes} min read · {updated !== guide.published ? "Updated" : "Published"}{" "}
          {formatGuideDate(updated)}
        </p>
        <p className="mt-4 text-base leading-relaxed text-slate-700">{guide.description}</p>

        <div className="prose-guide mt-10 space-y-5 text-base leading-relaxed text-slate-700">
          {children}
        </div>

        {author ? (
          <aside className="mt-12 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">About the author</p>
            <p className="mt-2 font-semibold text-slate-900">
              {author.url ? (
                <a href={author.url} className="text-amber-800 underline-offset-2 hover:underline">
                  {author.name}
                </a>
              ) : (
                author.name
              )}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{author.bio}</p>
          </aside>
        ) : null}

        {adSlot ? (
          <AdsenseAd slot={adSlot} className="mt-10" format="horizontal" fullWidthResponsive />
        ) : null}

        <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Track it on CoasterTrak</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            CoasterTrak is a free browser coaster credit tracker — log unique rides, plan park leftovers, and
            compare tallies with friends. No app store install.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
            >
              Start free credit log
            </Link>
            <Link
              href="/map"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Browse parks
            </Link>
            <Link
              href="/guides"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              More guides
            </Link>
          </div>
        </section>

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-slate-900">Related guides</h2>
            <ul className="mt-4 space-y-3">
              {related.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={guidePath(g.slug)}
                    className="font-semibold text-amber-700 underline-offset-2 hover:underline"
                  >
                    {g.title}
                  </Link>
                  <p className="text-sm text-slate-600">{g.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}

export function GuideH2({ children }: { children: ReactNode }) {
  return <h2 className="!mt-10 text-2xl font-semibold text-slate-900 first:!mt-0">{children}</h2>;
}

export function GuideH3({ children }: { children: ReactNode }) {
  return <h3 className="!mt-6 text-lg font-semibold text-slate-900">{children}</h3>;
}

export function GuideP({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function GuideUl({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

export function GuideOl({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5">{children}</ol>;
}

export function GuideLi({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

export function GuideLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-amber-700 underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
