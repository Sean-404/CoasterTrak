"use client";

/* eslint-disable @next/next/no-img-element */

import { memo, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type CoasterThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  sizeClassName?: string;
  allowPreview?: boolean;
  showMissingLabel?: boolean;
};

const FALLBACK_SWATCHES = [
  { bg: "#dbeafe", fg: "#1d4ed8", border: "#93c5fd" },
  { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" },
  { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  { bg: "#f3e8ff", fg: "#6d28d9", border: "#c4b5fd" },
  { bg: "#e0f2fe", fg: "#0f766e", border: "#67e8f9" },
] as const;

function swatchForName(name: string) {
  const normalized = name.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_SWATCHES[hash % FALLBACK_SWATCHES.length] ?? FALLBACK_SWATCHES[0];
}

export const CoasterThumbnail = memo(function CoasterThumbnail({
  name,
  imageUrl,
  sizeClassName = "h-14 w-14",
  allowPreview = true,
  showMissingLabel = false,
}: CoasterThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const safeUrl = imageUrl ?? null;
  const showImage = Boolean(safeUrl) && failedUrl !== safeUrl;
  const trimmed = name.trim();
  const initial = trimmed ? trimmed[0]!.toUpperCase() : "R";
  const canPortal = typeof window !== "undefined";
  const fallbackSwatch = swatchForName(trimmed || "coaster");

  useEffect(() => {
    if (!previewOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewOpen]);

  const openPreview = (event: MouseEvent<HTMLButtonElement>) => {
    // Keep Leaflet popup/map handlers from treating this as a map click/drag.
    event.preventDefault();
    event.stopPropagation();
    setPreviewOpen(true);
  };

  return (
    <>
      {showImage && allowPreview ? (
        <button
          type="button"
          onClick={openPreview}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          aria-label={`Open image for ${trimmed || "coaster"}`}
          className={`${sizeClassName} shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:brightness-95 active:scale-[0.98] active:brightness-90`}
        >
          <img
            src={imageUrl ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(safeUrl)}
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <div
          className={`${sizeClassName} relative shrink-0 overflow-hidden rounded-lg border`}
          style={{
            backgroundColor: fallbackSwatch.bg,
            borderColor: fallbackSwatch.border,
          }}
          title={`${trimmed || "Coaster"} image unavailable`}
          aria-hidden
        >
          {showImage ? (
            <img
              src={imageUrl ?? undefined}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedUrl(safeUrl)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center justify-center gap-0.5 px-1.5 text-center">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="h-5 w-5"
                  style={{ color: fallbackSwatch.fg }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 17c1.8-3.2 3.8-3.2 5.6 0s3.8 3.2 5.6 0 3.8-3.2 5.6 0" />
                  <rect x="8" y="10.5" width="5.5" height="3" rx="0.8" />
                  <circle cx="9.4" cy="14.8" r="0.9" fill="currentColor" stroke="none" />
                  <circle cx="12.1" cy="14.8" r="0.9" fill="currentColor" stroke="none" />
                  <path d="M8.8 9.7c.7-1.3 1.7-1.9 3-1.9s2.3.6 3 1.9" />
                </svg>
                {showMissingLabel ? (
                  <span
                    className="whitespace-nowrap rounded bg-white/85 px-1 py-[1px] text-[8px] font-medium uppercase leading-none tracking-wide"
                    style={{ color: fallbackSwatch.fg }}
                  >
                    No img
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold leading-none" style={{ color: fallbackSwatch.fg }}>
                    {initial}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {canPortal &&
        previewOpen &&
        imageUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setPreviewOpen(false)}
          >
            <button
              type="button"
              className="absolute right-4 top-4 min-h-10 min-w-10 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white active:scale-95"
              onClick={() => setPreviewOpen(false)}
            >
              Close
            </button>
            <img
              src={imageUrl}
              alt={trimmed || "Coaster image"}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}, (prev, next) =>
  prev.name === next.name &&
  prev.imageUrl === next.imageUrl &&
  prev.sizeClassName === next.sizeClassName &&
  prev.allowPreview === next.allowPreview
);
