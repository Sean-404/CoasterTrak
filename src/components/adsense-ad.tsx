"use client";

import { useEffect, useId } from "react";

const ADSENSE_CLIENT = "ca-pub-2576999274764112";

type AdsenseAdProps = {
  slot?: string;
  className?: string;
  format?: "horizontal" | "vertical" | "rectangle" | "auto";
  fullWidthResponsive?: boolean;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdsenseAd({
  slot,
  className,
  format = "rectangle",
  fullWidthResponsive = false,
}: AdsenseAdProps) {
  const instanceId = useId();

  useEffect(() => {
    if (!slot || typeof window === "undefined") {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore duplicate push errors on hot reloads/navigation.
    }
  }, [slot, instanceId]);

  if (!slot) {
    return null;
  }

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
      />
    </div>
  );
}
