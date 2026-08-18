"use client";

import { getFontEmbedCSS, toBlob } from "html-to-image";
import { useCallback, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  StatsShareCard,
  STATS_SHARE_CARD_SIZE,
  type StatsShareCardProps,
} from "@/components/stats-share-card";

type StatsShareControlsProps = {
  card: StatsShareCardProps;
  disabled?: boolean;
  onFeedback: (message: string) => void;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function absoluteAssetUrl(src: string) {
  if (src.startsWith("data:") || src.startsWith("blob:") || /^https?:\/\//i.test(src)) {
    return src;
  }
  if (typeof window === "undefined") return src;
  return new URL(src, window.location.origin).href;
}

/** Inline images as data URLs so Safari/html-to-image doesn't drop them. */
async function inlineImagesAsDataUrls(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try {
        const res = await fetch(absoluteAssetUrl(src), { cache: "force-cache" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        img.removeAttribute("crossorigin");
        img.src = dataUrl;
        if (typeof img.decode === "function") {
          try {
            await img.decode();
          } catch {
            // Ignore decode errors; capture can still proceed.
          }
        }
      } catch {
        // Leave original src; capture may still work on desktop.
      }
    }),
  );
}

function isAppleShareClient() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
}

export function ShareCardCapture({
  disabled,
  onFeedback,
  filename,
  shareTitle,
  shareText,
  successShared,
  successDownloaded,
  failMessage,
  buttonLabel = "Share card",
  renderCard,
}: {
  disabled?: boolean;
  onFeedback: (message: string) => void;
  filename: string;
  shareTitle: string;
  shareText: string;
  successShared: string;
  successDownloaded: string;
  failMessage: string;
  buttonLabel?: string;
  renderCard: (ref: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const buildBlob = useCallback(async () => {
    const node = cardRef.current;
    if (!node) throw new Error("Share card is not ready.");

    try {
      await document.fonts.load('400 28px "Bungee"');
    } catch {
      // Fall through — system fallback still renders.
    }
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await inlineImagesAsDataUrls(node);

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(node);
    } catch {
      fontEmbedCSS = undefined;
    }

    const blob = await toBlob(node, {
      cacheBust: false,
      pixelRatio: 1,
      width: STATS_SHARE_CARD_SIZE,
      height: STATS_SHARE_CARD_SIZE,
      fontEmbedCSS,
      style: {
        transform: "none",
        left: "0",
        top: "0",
        opacity: "1",
      },
    });
    if (!blob) throw new Error("Could not render share card.");
    return blob;
  }, []);

  const shareOrDownload = useCallback(async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const blob = await buildBlob();
      const file = new File([blob], filename, { type: "image/png" });
      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }));

      if (canShareFile) {
        try {
          const shareData: ShareData = isAppleShareClient()
            ? { files: [file] }
            : {
                files: [file],
                title: shareTitle,
                text: shareText,
              };
          await navigator.share(shareData);
          onFeedback(successShared);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            onFeedback("Share cancelled.");
            return;
          }
        }
      }

      downloadBlob(blob, filename);
      onFeedback(successDownloaded);
    } catch {
      onFeedback(failMessage);
    } finally {
      setBusy(false);
    }
  }, [
    buildBlob,
    busy,
    disabled,
    failMessage,
    filename,
    onFeedback,
    shareText,
    shareTitle,
    successDownloaded,
    successShared,
  ]);

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void shareOrDownload()}
        className="cursor-pointer rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Creating card…" : buttonLabel}
      </button>

      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 overflow-hidden"
        style={{
          width: STATS_SHARE_CARD_SIZE,
          height: STATS_SHARE_CARD_SIZE,
          opacity: 0.01,
          zIndex: -1,
        }}
      >
        {renderCard(cardRef)}
      </div>
    </>
  );
}

export function StatsShareControls({ card, disabled, onFeedback }: StatsShareControlsProps) {
  return (
    <ShareCardCapture
      disabled={disabled}
      onFeedback={onFeedback}
      filename="coastertrak-stats.png"
      shareTitle="My CoasterTrak stats"
      shareText="My roller coaster stats on CoasterTrak"
      successShared="Stats card shared."
      successDownloaded="Stats card downloaded."
      failMessage="Could not create the stats card. Please try again."
      renderCard={(ref) => <StatsShareCard ref={ref} {...card} />}
    />
  );
}
