"use client";

type StarRatingProps = {
  value: number | null;
  onChange?: (value: number | null) => void;
  /** Interactive editing (own stats). When false, stars are display-only. */
  editable?: boolean;
  /** Visual size of each star button/icon. */
  size?: "sm" | "md" | "lg";
  /** Optional label announced for screen readers. */
  label?: string;
  disabled?: boolean;
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-4 w-4",
  md: "h-7 w-7",
  lg: "h-9 w-9",
} as const;

const HIT_CLASS = {
  sm: "min-h-7 min-w-7 p-1",
  md: "min-h-11 min-w-11 p-2",
  lg: "min-h-12 min-w-12 p-2",
} as const;

function StarIcon({
  filled,
  className,
  muted = false,
}: {
  filled: boolean;
  className: string;
  muted?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`${className} ${filled ? "text-amber-500" : muted ? "text-slate-200" : "text-slate-300"}`}
      fill="currentColor"
      aria-hidden
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function StarRating({
  value,
  onChange,
  editable = false,
  size = "md",
  label = "Rating",
  disabled = false,
  className = "",
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5] as const;
  const rating = value != null && value >= 1 && value <= 5 ? value : 0;

  if (!editable) {
    return (
      <div
        className={`inline-flex items-center gap-px text-amber-500 ${className}`}
        role="img"
        aria-label={rating > 0 ? `${label}: ${rating} out of 5` : `${label}: not rated`}
      >
        {stars.map((star) => (
          <StarIcon
            key={star}
            filled={star <= rating}
            muted
            className={SIZE_CLASS[size]}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="group"
      aria-label={label}
    >
      {stars.map((star) => {
        const filled = star <= rating;
        const isClear = rating === star;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={
              isClear
                ? `Clear rating (${star} stars)`
                : `Rate ${star} out of 5`
            }
            aria-pressed={filled}
            onClick={() => {
              if (!onChange || disabled) return;
              // Tap the same star again to clear.
              onChange(isClear ? null : star);
            }}
            className={`${HIT_CLASS[size]} inline-flex items-center justify-center rounded-lg transition hover:bg-amber-50 active:scale-95 disabled:cursor-wait disabled:opacity-60`}
          >
            <StarIcon filled={filled} className={SIZE_CLASS[size]} />
          </button>
        );
      })}
    </div>
  );
}
