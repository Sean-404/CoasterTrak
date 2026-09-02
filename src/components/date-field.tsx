"use client";

import { localDateISO } from "@/lib/ride-history";

type DateFieldProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
};

/** Native date input tuned for iOS Safari width/overflow quirks. */
export function DateField({
  id,
  label = "Ride date",
  value,
  onChange,
  min = "1950-01-01",
  max = localDateISO(),
  disabled = false,
  className = "",
}: DateFieldProps) {
  return (
    <label htmlFor={id} className={`block min-w-0 ${className}`.trim()}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="relative mt-1 min-w-0">
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value || localDateISO())}
          className="date-field relative min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-11 text-base leading-normal text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </label>
  );
}
