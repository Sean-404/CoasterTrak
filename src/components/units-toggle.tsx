"use client";

import { UNITS_CYCLE, UNITS_LABEL, type Units } from "@/lib/units";

type Props = {
  units: Units;
  onChange: (units: Units) => void;
  variant?: "light" | "dark";
};

export function UnitsToggle({ units, onChange, variant = "light" }: Props) {
  const track =
    variant === "dark"
      ? "border-white/10 bg-white/10"
      : "border-slate-200 bg-slate-100";
  const active =
    variant === "dark"
      ? "bg-white/20 text-white shadow-sm"
      : "bg-white text-slate-900 shadow-sm";
  const inactive =
    variant === "dark"
      ? "text-slate-400 hover:text-white"
      : "text-slate-500 hover:text-slate-700";

  return (
    <div className={`flex rounded-lg border p-0.5 text-xs font-medium ${track}`}>
      {UNITS_CYCLE.map((u) => (
        <button
          key={u}
          onClick={() => onChange(u)}
          className={`rounded-md px-2.5 py-1 transition-colors ${u === units ? active : inactive}`}
        >
          {UNITS_LABEL[u]}
        </button>
      ))}
    </div>
  );
}
