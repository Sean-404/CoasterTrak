"use client";

import { useEffect, useState } from "react";
import { PhotoCredit } from "@/components/photo-credit";
import { commonsFileName, commonsFilePageUrl, type PhotoCredit as PhotoCreditData } from "@/lib/commons-credit";

/** Credits by Commons file name, shared by every lightbox on the page. */
const CREDIT_CACHE = new Map<string, PhotoCreditData>();

type PhotoCreditLoaderProps = {
  imageUrl: string | null | undefined;
  tone?: "light" | "dark";
  className?: string;
  linkSource?: boolean;
};

/**
 * Client-side photo credit for Commons photos shown in lightboxes and games. Shows the
 * Commons file link straight away and fills in author and licence once they load.
 * Renders nothing for photos that are not on Commons (e.g. members' own ride photos).
 */
export function PhotoCreditLoader({ imageUrl, tone = "light", className, linkSource }: PhotoCreditLoaderProps) {
  const fileName = commonsFileName(imageUrl);
  const [, setLoadedCount] = useState(0);

  useEffect(() => {
    if (!fileName || CREDIT_CACHE.has(fileName)) return;
    const controller = new AbortController();
    fetch(`/api/catalog/photo-credit?file=${encodeURIComponent(fileName)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ credit: PhotoCreditData | null }>) : null))
      .then((payload) => {
        if (!payload?.credit) return;
        CREDIT_CACHE.set(fileName, payload.credit);
        setLoadedCount((n) => n + 1);
      })
      .catch(() => {
        /* aborted or offline: the file link still credits the photo */
      });
    return () => controller.abort();
  }, [fileName]);

  if (!fileName) return null;
  const credit = CREDIT_CACHE.get(fileName) ?? {
    author: null,
    license: null,
    licenseUrl: null,
    sourceUrl: commonsFilePageUrl(fileName),
  };
  return <PhotoCredit credit={credit} tone={tone} className={className} linkSource={linkSource} />;
}
