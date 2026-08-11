export type CatalogStatPill = {
  label: string;
  value: string;
  tone?: "default" | "amber" | "green" | "red" | "slate";
};

const TONE_CLASS: Record<NonNullable<CatalogStatPill["tone"]>, string> = {
  default: "border-slate-200 bg-slate-50 text-slate-700",
  slate: "border-slate-200 bg-white text-slate-700",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  green: "border-green-200 bg-green-50 text-green-800",
  red: "border-red-200 bg-red-50 text-red-700",
};

export function CatalogStatPills({
  pills,
  className = "",
}: {
  pills: CatalogStatPill[];
  className?: string;
}) {
  if (pills.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {pills.map((pill) => {
        const tone = pill.tone ?? "default";
        return (
          <span
            key={`${pill.label}-${pill.value}`}
            className={`inline-flex max-w-full items-baseline gap-1.5 rounded-full border px-3 py-1 text-sm leading-tight ${TONE_CLASS[tone]}`}
          >
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-70">
              {pill.label}
            </span>
            <span className="truncate font-semibold">{pill.value}</span>
          </span>
        );
      })}
    </div>
  );
}
