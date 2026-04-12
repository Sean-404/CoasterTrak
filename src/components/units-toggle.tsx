"use client";

import { UNITS_CYCLE, UNITS_LABEL, type Units } from "@/lib/units";

type Props = {
  units: Units;
  onChange: (units: Units) => void;
};

export function UnitsToggle({ units, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
      {UNITS_CYCLE.map((u) => (
        <button
          key={u}
          onClick={() => onChange(u)}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            u === units
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {UNITS_LABEL[u]}
        </button>
      ))}
    </div>
  );
}
