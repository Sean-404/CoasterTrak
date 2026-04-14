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
  onPreview?: (payload: { name: string; imageUrl: string }) => void;
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
  onPreview,
}: CoasterThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const safeUrl = imageUrl ?? null;
  const showImage = Boolean(safeUrl) && failedUrl !== safeUrl;
  const trimmed = name.trim();
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
    if (onPreview && safeUrl) {
      onPreview({ name: trimmed || "Coaster image", imageUrl: safeUrl });
      return;
    }
    setPreviewOpen(true);
  };

  return (
    <>
      {showImage && allowPreview ? (
        <button
          type="button"
          onClick={openPreview}
          onClickCapture={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
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
              <div className="flex flex-col items-center justify-center gap-1 px-1 text-center">
                <img
                  src="/rollercoaster_icon.png"
                  alt=""
                  aria-hidden
                  className="h-4 w-4 object-contain"
                />
                <span
                  className="whitespace-nowrap rounded bg-white/85 px-1 py-[1px] text-[8px] font-semibold uppercase leading-none tracking-wide"
                  style={{ color: fallbackSwatch.fg }}
                >
                  {showMissingLabel ? "No photo" : "No img"}
                </span>
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
  prev.allowPreview === next.allowPreview &&
  prev.showMissingLabel === next.showMissingLabel &&
  prev.onPreview === next.onPreview
);
