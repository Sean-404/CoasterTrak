"use client";

/* eslint-disable @next/next/no-img-element */

import {
  memo,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type CoasterThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  sizeClassName?: string;
  allowPreview?: boolean;
  showMissingLabel?: boolean;
  onPreview?: (payload: { name: string; imageUrl: string }) => void;
};

const FALLBACK_SWATCH = { bg: "#dbeafe", fg: "#1d4ed8", border: "#93c5fd" } as const;
type ImageStatus = "idle" | "loading" | "loaded" | "error";
const IMAGE_STATUS_CACHE = new Map<string, Exclude<ImageStatus, "idle" | "loading">>();
const IMAGE_REQUESTED_URLS = new Set<string>();

export const CoasterThumbnail = memo(function CoasterThumbnail({
  name,
  imageUrl,
  sizeClassName = "h-14 w-14",
  allowPreview = true,
  showMissingLabel = false,
  onPreview,
}: CoasterThumbnailProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>(() => {
    if (!imageUrl) return "idle";
    const cached = IMAGE_STATUS_CACHE.get(imageUrl);
    return cached ?? "loading";
  });
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const openedFromPointerRef = useRef(false);
  const safeUrl = imageUrl ?? null;
  const canStartLoading =
    Boolean(safeUrl) &&
    (isNearViewport ||
      Boolean(safeUrl && (IMAGE_STATUS_CACHE.has(safeUrl) || IMAGE_REQUESTED_URLS.has(safeUrl))));
  const showImage =
    Boolean(safeUrl) &&
    canStartLoading &&
    (imageStatus === "loading" || imageStatus === "loaded");
  const showUnavailableFallback = !safeUrl || imageStatus === "error";
  const trimmed = name.trim();
  const canPortal = typeof window !== "undefined";
  const fallbackSwatch = FALLBACK_SWATCH;

  useEffect(() => {
    setIsNearViewport(false);
  }, [safeUrl]);

  useEffect(() => {
    if (!safeUrl || imageStatus === "loaded") return;
    if (typeof window === "undefined") return;
    const node = containerRef.current;
    if (!node || typeof window.IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }
    let cancelled = false;
    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          if (!cancelled) setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [safeUrl, imageStatus]);

  useEffect(() => {
    if (!safeUrl) {
      setImageStatus("idle");
      return;
    }
    const cached = IMAGE_STATUS_CACHE.get(safeUrl);
    if (cached) {
      setImageStatus(cached);
      return;
    }
    if (!canStartLoading) setImageStatus("idle");
    else {
      IMAGE_REQUESTED_URLS.add(safeUrl);
      setImageStatus("loading");
    }
  }, [safeUrl, canStartLoading]);

  useEffect(() => {
    if (!previewOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewOpen]);

  const triggerPreview = () => {
    if (!safeUrl) return;
    if (onPreview) {
      onPreview({ name: trimmed || "Coaster image", imageUrl: safeUrl });
      return;
    }
    setPreviewOpen(true);
  };

  const handlePointerDownCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.nativeEvent.stopImmediatePropagation === "function") {
      event.nativeEvent.stopImmediatePropagation();
    }
    openedFromPointerRef.current = true;
    triggerPreview();
  };

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (openedFromPointerRef.current) {
      openedFromPointerRef.current = false;
      return;
    }
    // Keyboard activation (Enter/Space) lands here with no pointerdown first.
    triggerPreview();
  };

  return (
    <>
      {showImage && allowPreview ? (
        <button
          ref={(node) => {
            containerRef.current = node;
          }}
          type="button"
          onPointerDownCapture={handlePointerDownCapture}
          onClick={handleClick}
          aria-label={`Open image for ${trimmed || "coaster"}`}
          className={`${sizeClassName} shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition hover:brightness-95 active:scale-[0.98] active:brightness-90`}
        >
          <img
            src={imageUrl ?? undefined}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => {
              if (!safeUrl) return;
              IMAGE_STATUS_CACHE.set(safeUrl, "loaded");
              setImageStatus("loaded");
            }}
            onError={() => {
              if (!safeUrl) return;
              IMAGE_STATUS_CACHE.set(safeUrl, "error");
              setImageStatus("error");
            }}
            className="h-full w-full object-cover"
          />
        </button>
      ) : showUnavailableFallback ? (
        <div
          ref={(node) => {
            containerRef.current = node;
          }}
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
              onLoad={() => {
                if (!safeUrl) return;
                IMAGE_STATUS_CACHE.set(safeUrl, "loaded");
                setImageStatus("loaded");
              }}
              onError={() => {
                if (!safeUrl) return;
                IMAGE_STATUS_CACHE.set(safeUrl, "error");
                setImageStatus("error");
              }}
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
                  NO IMG
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          ref={(node) => {
            containerRef.current = node;
          }}
          className={`${sizeClassName} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100`}
          aria-hidden
        />
      )}

      {canPortal &&
        previewOpen &&
        safeUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            onClick={(event) => {
              if (event.target === event.currentTarget) setPreviewOpen(false);
            }}
          >
            <button
              type="button"
              className="absolute right-4 top-4 min-h-10 min-w-10 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-white active:scale-95"
              onClick={() => setPreviewOpen(false)}
            >
              Close
            </button>
            <img
              src={safeUrl}
              alt={trimmed || "Coaster image"}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              referrerPolicy="no-referrer"
              onClick={(event) => event.stopPropagation()}
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
