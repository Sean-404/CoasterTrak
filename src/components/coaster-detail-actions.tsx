"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CoasterActions } from "@/components/coaster-actions";
import { normalizeLifecycleStatus } from "@/lib/coaster-status";
import { getSupabaseUserSafe } from "@/lib/supabase";

export function CoasterDetailActions({
  coasterId,
  status,
  closingYear,
}: {
  coasterId: number;
  status: string;
  closingYear?: number | null;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const isDefunct =
    normalizeLifecycleStatus(status, { closingYear: closingYear ?? null }) === "Defunct";

  useEffect(() => {
    let cancelled = false;
    void getSupabaseUserSafe().then((user) => {
      if (!cancelled) setSignedIn(Boolean(user));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Track this ride</p>
      {signedIn === false ? (
        <p className="mt-1 text-sm text-slate-600">
          Add to your wishlist, mark as ridden, or log another ride.{" "}
          <Link href="/login" className="font-semibold text-amber-700 hover:underline">
            Sign in
          </Link>{" "}
          to save credits across devices.
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-600">
          Add to your wishlist, mark as ridden, or log another ride. Tap − on a logged day if you made a mistake.
        </p>
      )}
      <CoasterActions coasterId={coasterId} disableWishlist={isDefunct} variant="prominent" />
    </div>
  );
}
