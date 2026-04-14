"use client";

/* eslint-disable @next/next/no-img-element */

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type CoasterThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  sizeClassName?: string;
  allowPreview?: boolean;
};

export const CoasterThumbnail = memo(function CoasterThumbnail({
  name,
  imageUrl,
  sizeClassName = "h-14 w-14",
  allowPreview = true,
}: CoasterThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const safeUrl = imageUrl ?? null;
  const showImage = Boolean(safeUrl) && failedUrl !== safeUrl;
  const trimmed = name.trim();
  const initial = trimmed ? trimmed[0]!.toUpperCase() : "R";
  const canPortal = typeof window !== "undefined";

  useEffect(() => {
    if (!previewOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewOpen]);

  return (
    <>
      {showImage && allowPreview ? (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          aria-label={`Open image for ${trimmed || "coaster"}`}
          className={`${sizeClassName} shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:brightness-95`}
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
          className={`${sizeClassName} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100`}
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
            <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-500">
              {initial}
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
              className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-900 hover:bg-white"
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
