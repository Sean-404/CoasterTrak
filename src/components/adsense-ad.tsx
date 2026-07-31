"use client";

import Script from "next/script";
import { useEffect, useId, useState } from "react";

const ADSENSE_CLIENT = "ca-pub-2576999274764112";
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";

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

/**
 * Manual AdSense unit. Only renders when NEXT_PUBLIC_ADSENSE_ENABLED=true
 * and a slot id is provided. Loads the AdSense script on demand for this page
 * only — never from the root layout — so thin/auth screens stay ad-free.
 */
export function AdsenseAd({
  slot,
  className,
  format = "rectangle",
  fullWidthResponsive = false,
}: AdsenseAdProps) {
  const instanceId = useId();
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!ADS_ENABLED || !slot || !scriptReady || typeof window === "undefined") {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore duplicate push errors on hot reloads/navigation.
    }
  }, [slot, instanceId, scriptReady]);

  if (!ADS_ENABLED || !slot) {
    return null;
  }

  return (
    <div className={className}>
      <Script
        id="adsense-script"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        strategy="afterInteractive"
        crossOrigin="anonymous"
        onLoad={() => setScriptReady(true)}
      />
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
