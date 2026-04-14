"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

type CoasterThumbnailProps = {
  name: string;
  imageUrl?: string | null;
  sizeClassName?: string;
};

export function CoasterThumbnail({
  name,
  imageUrl,
  sizeClassName = "h-14 w-14",
}: CoasterThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;
  const initial = useMemo(() => {
    const trimmed = name.trim();
    return trimmed ? trimmed[0]!.toUpperCase() : "R";
  }, [name]);

  return (
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
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-500">
          {initial}
        </div>
      )}
    </div>
  );
}
