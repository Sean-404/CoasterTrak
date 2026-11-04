import { AFFILIATE_DISCLOSURE, resolveAffiliateLink } from "@/lib/affiliates";

type PlanYourVisitProps = {
  parkId: number;
  parkName: string;
  parkIsDefunct: boolean;
};

/**
 * Affiliate ticket link for park pages only: keep it off My Stats and logging screens.
 * Renders nothing unless NEXT_PUBLIC_AFFILIATES_ENABLED=true and the park has a confirmed, tracked link.
 * The disclosure sits above the link so it is read first, in body-size text.
 */
export function PlanYourVisit({ parkId, parkName, parkIsDefunct }: PlanYourVisitProps) {
  const link = resolveAffiliateLink(parkId, parkIsDefunct);
  if (!link) return null;

  return (
    <aside
      aria-labelledby="plan-your-visit-heading"
      className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 id="plan-your-visit-heading" className="text-base font-semibold text-slate-900">
        Plan your visit
      </h2>
      <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700">{AFFILIATE_DISCLOSURE}</p>
      <a
        href={link.href}
        target="_blank"
        rel="sponsored noopener"
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-900 transition hover:bg-amber-400 sm:inline-flex sm:w-auto"
      >
        Find {parkName} tickets on {link.partnerName}
      </a>
    </aside>
  );
}
