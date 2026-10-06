"use client";

import Link from "next/link";

type StatsOnboardingProps = {
  creditCount: number;
  hasDisplayName: boolean;
  statsVisibility: string | null;
};

/**
 * Lightweight first-session checklist on Stats until the rider has a few credits.
 */
export function StatsOnboardingChecklist({
  creditCount,
  hasDisplayName,
  statsVisibility,
}: StatsOnboardingProps) {
  if (creditCount >= 5 && hasDisplayName) return null;

  const steps = [
    {
      done: hasDisplayName,
      label: "Set a display name",
      href: "/account",
      detail: "Needed for friends and a public profile URL.",
    },
    {
      done: creditCount >= 1,
      label: "Log your first credit",
      href: "/map",
      detail: "Open Discover, find a ride you have done, mark it ridden.",
    },
    {
      done: creditCount >= 5,
      label: "Log 5 credits",
      href: "/map",
      detail: "A small tally unlocks share cards and better park leftovers.",
    },
    {
      done: statsVisibility === "public",
      label: "Optional: make stats public",
      href: "/account",
      detail: "Public profiles get a shareable /u/yourname link.",
    },
  ];

  return (
    <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Get started</h2>
      <p className="mt-1 text-xs text-slate-600">
        A short checklist so your first session turns into a real credit log.
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex gap-2 text-sm">
            <span
              className={
                step.done
                  ? "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white"
                  : "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] text-slate-400"
              }
              aria-hidden
            >
              {step.done ? "✓" : ""}
            </span>
            <div>
              {step.done ? (
                <span className="font-medium text-slate-500 line-through">{step.label}</span>
              ) : (
                <Link href={step.href} className="font-semibold text-amber-800 underline-offset-2 hover:underline">
                  {step.label}
                </Link>
              )}
              <p className="text-xs text-slate-600">{step.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
