"use client";

import { useEffect, useState } from "react";
import { ProfileReviews } from "@/components/profile-reviews";
import type { ProfileParkReview } from "@/lib/park-reviews";
import { authedJson } from "@/lib/park-reviews-client";

type Props = {
  userId: string;
  isOwn: boolean;
};

/** Park reviews on a stats page: your own in every status, or a friend's published ones. */
export function StatsProfileReviews({ userId, isOwn }: Props) {
  const [loaded, setLoaded] = useState<{ userId: string; reviews: ProfileParkReview[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    authedJson<{ reviews: ProfileParkReview[] }>(`/api/park-reviews/by-user?userId=${encodeURIComponent(userId)}`)
      .then((payload) => {
        if (!cancelled) setLoaded({ userId, reviews: payload.reviews });
      })
      .catch(() => {
        /* reviews are optional on this page; leave the section out */
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!loaded || loaded.userId !== userId) return null;
  return (
    <ProfileReviews
      reviews={loaded.reviews}
      heading={isOwn ? "Your park reviews" : "Park reviews"}
      emptyText={isOwn ? "You have not reviewed a park yet. Open any park page to write one." : undefined}
    />
  );
}
