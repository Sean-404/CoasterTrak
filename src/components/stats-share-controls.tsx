"use client";

import { getFontEmbedCSS, toBlob } from "html-to-image";
import { useCallback, useRef, useState } from "react";
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

export function StatsShareControls({ card, disabled, onFeedback }: StatsShareControlsProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const buildBlob = useCallback(async () => {
    const node = cardRef.current;
    if (!node) throw new Error("Share card is not ready.");

    // Load Bungee explicitly for capture (next/font CSS var can fail to embed).
    try {
      await document.fonts.load('400 28px "Bungee"');
    } catch {
      // Fall through — system fallback still renders.
    }
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const images = Array.from(node.querySelectorAll("img"));
    await Promise.all(
      images.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) return;
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      }),
    );

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
      cacheBust: true,
      pixelRatio: 1,
      width: STATS_SHARE_CARD_SIZE,
      height: STATS_SHARE_CARD_SIZE,
      fontEmbedCSS,
      style: {
        transform: "none",
        left: "0",
        top: "0",
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
      const file = new File([blob], "coastertrak-stats.png", { type: "image/png" });
      const canShareFile =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [file] }));

      if (canShareFile) {
        try {
          await navigator.share({
            files: [file],
            title: "My CoasterTrak stats",
            text: "My roller coaster stats on CoasterTrak",
          });
          onFeedback("Stats card shared.");
          return;
        } catch (error) {
          // User cancel should not fall through to download noise.
          if (error instanceof DOMException && error.name === "AbortError") {
            onFeedback("Share cancelled.");
            return;
          }
        }
      }

      downloadBlob(blob, "coastertrak-stats.png");
      onFeedback("Stats card downloaded.");
    } catch {
      onFeedback("Could not create the stats card. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [buildBlob, busy, disabled, onFeedback]);

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void shareOrDownload()}
        className="cursor-pointer rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Creating card…" : "Share card"}
      </button>

      {/* Off-screen artboard for PNG capture */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-0 left-[-10000px] overflow-hidden"
        style={{ width: STATS_SHARE_CARD_SIZE, height: STATS_SHARE_CARD_SIZE }}
      >
        <StatsShareCard ref={cardRef} {...card} />
      </div>
    </>
  );
}
