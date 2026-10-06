import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { unjamGeoLabel } from "@/lib/geo-country";
import {
  getPublicProfileByDisplayName,
  invitePath,
  publicProfileHref,
  publicProfilePath,
} from "@/lib/public-profile";
import { SITE_URL } from "@/lib/site-url";
import { cleanCoasterName } from "@/lib/display";

type PageProps = {
  params: Promise<{ username: string }>;
};

function countryLabel(code: string | null): string | null {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);
  const profile = await getPublicProfileByDisplayName(username);
  if (!profile) {
    return { title: "Profile not found", robots: { index: false, follow: false } };
  }

  const title = `${profile.displayName} on CoasterTrak`;
  const description = `${profile.displayName} has ${profile.uniqueCredits.toLocaleString()} coaster credit${profile.uniqueCredits === 1 ? "" : "s"} on CoasterTrak. Free coaster credit tracker — log yours and compare.`;
  const canonical = publicProfilePath(profile.displayName);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: publicProfileHref(profile.displayName),
      type: "profile",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);
  const profile = await getPublicProfileByDisplayName(username);
  if (!profile) notFound();

  const country = countryLabel(profile.countryCode);
  const favoriteRide = profile.favoriteRideName
    ? cleanCoasterName(profile.favoriteRideName)
    : null;
  const favoritePark = profile.favoriteParkName
    ? unjamGeoLabel(profile.favoriteParkName)
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${profile.displayName} on CoasterTrak`,
    url: publicProfileHref(profile.displayName),
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      url: publicProfileHref(profile.displayName),
      ...(country ? { nationality: country } : {}),
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Public profile</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <ProfileAvatar
            avatarKey={profile.avatarKey}
            imageUrl={profile.avatarUrl}
            name={profile.displayName}
            size="lg"
          />
          <div>
            <h1 className="font-bungee text-4xl leading-tight text-slate-900 sm:text-5xl">
              {profile.displayName}
            </h1>
            {country ? <p className="mt-1 text-sm text-slate-600">{country}</p> : null}
          </div>
        </div>

        <dl className="mt-8 grid gap-3 sm:grid-cols-3">
          <StatCard label="Coaster credits" value={profile.uniqueCredits.toLocaleString()} />
          <StatCard label="Total rides" value={profile.totalRides.toLocaleString()} />
          <StatCard label="Parks visited" value={profile.parksVisited.toLocaleString()} />
        </dl>

        {(favoriteRide || favoritePark) && (
          <div className="mt-6 space-y-1 text-sm text-slate-600">
            {favoriteRide ? (
              <p>
                <span className="font-medium text-slate-800">Favorite ride:</span> {favoriteRide}
              </p>
            ) : null}
            {favoritePark ? (
              <p>
                <span className="font-medium text-slate-800">Favorite park:</span> {favoritePark}
              </p>
            ) : null}
          </div>
        )}

        <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
          <h2 className="text-xl font-semibold text-slate-900">Track your own credits</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            CoasterTrak is a free browser coaster credit tracker. Sign up to log unique rides, plan park leftovers,
            and compare tallies with {profile.displayName}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/login?next=${encodeURIComponent(invitePath(profile.userId))}`}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
            >
              Sign up free
            </Link>
            <Link
              href={invitePath(profile.userId)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Accept invite / add friend
            </Link>
            <Link
              href="/guides/what-is-a-coaster-credit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              What is a credit?
            </Link>
          </div>
        </section>

        <p className="mt-8 text-xs text-slate-500">
          Full ride lists and photos are available when you are signed in and this profile stays public. Share URL:{" "}
          <span className="font-mono text-slate-600">
            {SITE_URL}
            {publicProfilePath(profile.displayName)}
          </span>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
