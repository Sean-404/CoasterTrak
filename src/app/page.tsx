import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

function CoasterSilhouette() {
  const track = "rgba(255,255,255,0.14)";
  const support = "rgba(255,255,255,0.08)";

  return (
    <svg
      viewBox="0 0 1440 260"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-x-0 bottom-0 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Support structures */}
      <g stroke={support} strokeWidth="2" fill="none">
        {/* Lift hill cross-bracing */}
        <line x1="92" y1="218" x2="92" y2="252" />
        <line x1="118" y1="200" x2="118" y2="252" />
        <line x1="92" y1="218" x2="118" y2="200" />
        <line x1="144" y1="178" x2="144" y2="252" />
        <line x1="118" y1="200" x2="144" y2="178" />
        <line x1="170" y1="155" x2="170" y2="252" />
        <line x1="144" y1="178" x2="170" y2="155" />

        {/* After first drop */}
        <line x1="312" y1="218" x2="312" y2="252" />
        <line x1="328" y1="218" x2="328" y2="252" />

        {/* After camelback */}
        <line x1="474" y1="218" x2="474" y2="252" />
        <line x1="490" y1="218" x2="490" y2="252" />

        {/* Loop base */}
        <line x1="508" y1="218" x2="508" y2="252" />
        <line x1="672" y1="218" x2="672" y2="252" />

        {/* After second hill */}
        <line x1="838" y1="218" x2="838" y2="252" />
        <line x1="854" y1="218" x2="854" y2="252" />

        {/* Tail supports */}
        <line x1="1036" y1="212" x2="1036" y2="252" />
        <line x1="1150" y1="212" x2="1150" y2="252" />
        <line x1="1300" y1="212" x2="1300" y2="252" />
      </g>

      {/* Ground line */}
      <line x1="0" y1="252" x2="1440" y2="252" stroke={support} strokeWidth="1" />

      {/* === TRACK === */}

      {/* Segment 1: flat approach → lift hill → dramatic first drop */}
      <path
        d="M 0 218 L 80 218 L 196 18 C 198 130 288 218 316 218"
        stroke={track}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Segment 2: camelback hill → into loop base */}
      <path
        d="M 316 218 C 346 28 448 28 476 218 L 590 218"
        stroke={track}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Loop circle (sits on the track at x=590, y=218) */}
      <circle
        cx="590"
        cy="142"
        r="76"
        stroke={track}
        strokeWidth="3"
        fill="none"
      />

      {/* Segment 3: out of loop → second camelback → bunny hops → flat exit */}
      <path
        d="M 590 218 L 672 218 C 702 28 806 28 838 218 Q 866 152 894 145 Q 922 138 946 208 Q 970 148 996 141 Q 1022 134 1044 208 L 1440 208"
        stroke={track}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Coaster car silhouette — sitting at the top of the lift hill */}
      <g transform="translate(178, 8) rotate(-59)">
        <rect x="-14" y="-5" width="28" height="10" rx="3" fill={track} />
        <rect x="-10" y="-8" width="8" height="4" rx="1" fill={track} />
        <rect x="2" y="-8" width="8" height="4" rx="1" fill={track} />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 pb-32 pt-20 text-white">
        <CoasterSilhouette />
        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-400">
            Your ride tracker
          </div>
          <h1 className="font-bungee mt-4 text-5xl leading-tight text-white sm:text-6xl lg:text-7xl">
            Track Every<br />
            <span className="text-amber-400">Coaster Ride</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-300">
            Explore parks worldwide on an interactive map, build your bucket list, and track your coaster stats.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/map"
              className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-amber-400 active:scale-95"
            >
              Open map &rarr;
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
            >
              Create account
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          <FeatureCard
            icon={<MapIcon />}
            title="World Map"
            description="Find coasters at parks across every continent with live queue times from Queue-Times.com."
            href="/map"
          />
          <FeatureCard
            icon={<WishlistIcon />}
            title="Wishlist"
            description="Save the rides you want to do and check them off one by one as you conquer them."
            href="/wishlist"
          />
          <FeatureCard
            icon={<StatsIcon />}
            title="Stats"
            description="See how many coasters you've ridden, track your history, and measure your progress."
            href="/stats"
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-amber-300 hover:shadow-md"
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-500 transition group-hover:bg-amber-100">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
    </Link>
  );
}

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function WishlistIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
