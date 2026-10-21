import Link from "next/link";
import {
  COMMUNITY_MIN_CONTRIBUTORS,
  formatAverageRating,
  formatCount,
  formatRatingCount,
  formatRiderCount,
  hasCommunityStats,
  rankParkCommunityCoasters,
  type CommunityCoasterStats,
  type ParkCommunityEntry,
} from "@/lib/community-stats";
import { cleanCoasterName } from "@/lib/display";
import { coasterSlug } from "@/lib/slug";
import type { Coaster } from "@/types/domain";

const LEFTOVERS_GUIDE_HREF = "/guides/planning-park-leftovers";

function CommunityShell({ children }: { children?: React.ReactNode }) {
  return (
    <section
      aria-labelledby="community-stats-heading"
      className="mt-6 max-w-3xl rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5"
    >
      <h2 id="community-stats-heading" className="text-base font-semibold text-slate-900">
        From CoasterTrak riders
      </h2>
      {children}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Anonymous totals from members&apos; ride logs, ratings and wishlists. A number appears only once at least{" "}
        {COMMUNITY_MIN_CONTRIBUTORS} members contribute to it, and members with private stats are never counted.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Planning a visit?{" "}
        <Link
          href={LEFTOVERS_GUIDE_HREF}
          className="font-semibold text-amber-800 underline-offset-2 hover:underline"
        >
          How to plan park leftovers
        </Link>
        .
      </p>
    </section>
  );
}

/** Link-only fallback when community data could not be loaded (never claims "no riders"). */
function GuideOnly() {
  return (
    <p className="mt-6 max-w-3xl text-sm text-slate-600">
      Planning a visit?{" "}
      <Link href={LEFTOVERS_GUIDE_HREF} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
        How to plan park leftovers
      </Link>
      .
    </p>
  );
}

function NotEnoughYet({ subject }: { subject: string }) {
  return (
    <p className="mt-3 text-sm leading-relaxed text-slate-700">
      Not enough riders yet. Rider counts and ratings for {subject} appear here once at least{" "}
      {COMMUNITY_MIN_CONTRIBUTORS} CoasterTrak members have logged them.
    </p>
  );
}

function StatTile({
  label,
  value,
  detail,
  emptyText,
}: {
  label: string;
  value: string | null;
  detail?: string;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200/70 bg-white px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      {value ? (
        <dd className="mt-1">
          <span className="text-2xl font-semibold text-slate-900">{value}</span>
          {detail ? <span className="block text-sm text-slate-600">{detail}</span> : null}
        </dd>
      ) : (
        <dd className="mt-1 text-sm text-slate-500">{emptyText}</dd>
      )}
    </div>
  );
}

export function CoasterCommunityStats({
  coasterName,
  stats,
}: {
  coasterName: string;
  /** Null when the stats source is unavailable; undefined when this coaster has no qualifying data. */
  stats: CommunityCoasterStats | null | undefined;
}) {
  if (stats === null) return <GuideOnly />;
  if (!hasCommunityStats(stats)) {
    return (
      <CommunityShell>
        <NotEnoughYet subject={coasterName} />
      </CommunityShell>
    );
  }

  return (
    <CommunityShell>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Logged by"
          value={stats.riderCount != null ? formatCount(stats.riderCount) : null}
          detail={stats.riderCount != null ? (stats.riderCount === 1 ? "member" : "members") : undefined}
          emptyText="Not enough riders yet"
        />
        <StatTile
          label="Average rating"
          value={stats.averageRating != null ? `${formatAverageRating(stats.averageRating)} / 5` : null}
          detail={stats.ratingCount != null ? `from ${formatRatingCount(stats.ratingCount)}` : undefined}
          emptyText="Not enough ratings yet"
        />
        <StatTile
          label="On wishlists"
          value={stats.wishlistCount != null ? formatCount(stats.wishlistCount) : null}
          detail={stats.wishlistCount != null ? (stats.wishlistCount === 1 ? "member" : "members") : undefined}
          emptyText="Not enough wishlists yet"
        />
      </dl>
    </CommunityShell>
  );
}

function CommunityList({
  title,
  entries,
  describe,
  emptyText,
}: {
  title: string;
  entries: ParkCommunityEntry<Coaster>[];
  describe: (stats: CommunityCoasterStats) => string;
  emptyText: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-amber-200/70 bg-white px-4 py-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      {entries.length > 0 ? (
        <ol className="mt-2 space-y-2 text-sm">
          {entries.map(({ coaster, stats }, index) => (
            <li key={coaster.id} className="flex items-baseline gap-2">
              <span className="w-4 shrink-0 text-right text-xs font-semibold text-slate-400">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <Link
                  href={`/coasters/${coasterSlug(coaster.name, coaster.id)}`}
                  className="font-semibold text-slate-900 underline-offset-2 hover:text-amber-800 hover:underline"
                >
                  {cleanCoasterName(coaster.name)}
                </Link>
                <span className="block text-slate-600">{describe(stats)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

export function ParkCommunityStats({
  parkName,
  coasters,
  statsById,
}: {
  parkName: string;
  coasters: Coaster[];
  statsById: ReadonlyMap<number, CommunityCoasterStats> | null;
}) {
  if (statsById === null) return <GuideOnly />;
  const { mostLogged, highestRated } = rankParkCommunityCoasters(coasters, statsById);

  if (mostLogged.length === 0 && highestRated.length === 0) {
    return (
      <CommunityShell>
        <NotEnoughYet subject={`rides at ${parkName}`} />
      </CommunityShell>
    );
  }

  return (
    <CommunityShell>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CommunityList
          title="Most logged"
          entries={mostLogged}
          describe={(stats) => `Logged by ${formatRiderCount(stats.riderCount!)}`}
          emptyText="Not enough riders yet"
        />
        <CommunityList
          title="Highest rated"
          entries={highestRated}
          describe={(stats) =>
            `${formatAverageRating(stats.averageRating!)} / 5 from ${formatRatingCount(stats.ratingCount!)}`
          }
          emptyText="Not enough ratings yet"
        />
      </div>
    </CommunityShell>
  );
}
