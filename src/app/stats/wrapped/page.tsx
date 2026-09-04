"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AppPageHeading } from "@/components/app-page-heading";
import { MonthWrappedCard } from "@/components/month-wrapped-card";
import { SiteHeader } from "@/components/site-header";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import {
  buildWrappedSummary,
  currentYearMonth,
  periodDateRange,
  type MonthWrappedRideMeta,
  type MonthWrappedSummary,
} from "@/lib/month-wrapped";
import { canViewOtherUserStats } from "@/lib/ride-photos";
import { loadDatedRideEventsInRange } from "@/lib/ride-log";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type RideMetaRow = {
  coaster_id: number;
  rating: number | null;
  coasters: {
    park_id: number | null;
    name: string | null;
    speed_mph: number | null;
    height_ft: number | null;
    parks: { name: string | null; country: string | null } | null;
  } | null;
};

function StatsWrappedInner() {
  const searchParams = useSearchParams();
  const requestedUserId = searchParams.get("user");

  const [userId, setUserId] = useState<string | null>(null);
  const [activeStatsUserId, setActiveStatsUserId] = useState<string | null>(null);
  const [shareDisplayName, setShareDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [friendAccessDenied, setFriendAccessDenied] = useState(false);
  const [viewingPublicProfile, setViewingPublicProfile] = useState(false);
  const [rideMeta, setRideMeta] = useState<RideMetaRow[]>([]);
  const [wrappedPeriod, setWrappedPeriod] = useState(() => currentYearMonth());
  const [wrappedSummary, setWrappedSummary] = useState<MonthWrappedSummary | null>(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);
  const [wrappedError, setWrappedError] = useState<string | null>(null);

  const isOwnStatsView = !activeStatsUserId || (!!userId && userId === activeStatsUserId);
  const statsHref = requestedUserId
    ? `/stats?user=${encodeURIComponent(requestedUserId)}`
    : "/stats";

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoading(true);
    setFriendAccessDenied(false);
    setViewingPublicProfile(false);
    setRideMeta([]);
    setShareDisplayName(null);
    setWrappedSummary(null);
    setWrappedError(null);

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const targetUserId = requestedUserId && requestedUserId !== user.id ? requestedUserId : user.id;
      setActiveStatsUserId(targetUserId);

      const profileQuery = supabase
        .from("profiles")
        .select("display_name, stats_visibility")
        .eq("user_id", targetUserId)
        .maybeSingle();
      const friendshipQuery =
        targetUserId !== user.id
          ? supabase
              .from("friendships")
              .select("id")
              .eq("status", "accepted")
              .or(
                `and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`,
              )
              .limit(1)
          : Promise.resolve({ data: [{ id: 1 }], error: null });

      const [profilePreview, friendshipRes] = await Promise.all([profileQuery, friendshipQuery]);
      const displayName =
        typeof profilePreview.data?.display_name === "string" ? profilePreview.data.display_name : null;
      setShareDisplayName(displayName);

      if (targetUserId !== user.id) {
        const isFriend = !friendshipRes.error && (friendshipRes.data?.length ?? 0) > 0;
        const visibility = profilePreview.data?.stats_visibility;
        if (!profilePreview.data || !canViewOtherUserStats(visibility, isFriend)) {
          setFriendAccessDenied(true);
          setLoading(false);
          return;
        }
        setViewingPublicProfile(!isFriend && visibility === "public");
      }

      const ridesRes = await supabase
        .from("rides")
        .select(
          "coaster_id, rating, coasters(park_id, name, speed_mph, height_ft, parks(name, country))",
        )
        .eq("user_id", targetUserId);

      const rows = ((ridesRes.data ?? []) as unknown as RideMetaRow[]).map((row) => {
        if (!row.coasters) return row;
        const fixed = applyCoasterKnownFixes({
          name: row.coasters.name?.trim() || `Coaster ${row.coaster_id}`,
          height_ft: row.coasters.height_ft,
          speed_mph: row.coasters.speed_mph,
        });
        return {
          ...row,
          coasters: {
            ...row.coasters,
            name: fixed.name,
            height_ft: fixed.height_ft ?? row.coasters.height_ft,
            speed_mph: fixed.speed_mph ?? row.coasters.speed_mph,
          },
        };
      });
      setRideMeta(rows);
      setLoading(false);
    });
  }, [requestedUserId]);

  useEffect(() => {
    if (loading || friendAccessDenied || !activeStatsUserId) {
      setWrappedSummary(null);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const range = periodDateRange(wrappedPeriod);
    if (!range) return;

    let cancelled = false;
    setWrappedLoading(true);
    setWrappedError(null);

    void loadDatedRideEventsInRange(supabase, activeStatsUserId, range.start, range.end).then(
      ({ events, error }) => {
        if (cancelled) return;
        if (error) {
          setWrappedError("Could not load dated rides for this period.");
          setWrappedSummary(null);
          setWrappedLoading(false);
          return;
        }
        const metaByCoasterId = new Map<number, MonthWrappedRideMeta>();
        for (const ride of rideMeta) {
          const c = ride.coasters;
          metaByCoasterId.set(ride.coaster_id, {
            coasterId: ride.coaster_id,
            name: c?.name?.trim() || `Coaster ${ride.coaster_id}`,
            rating: ride.rating,
            parkId: c?.park_id ?? null,
            parkName: c?.parks?.name ?? null,
            parkCountry: c?.parks?.country ?? null,
            speedMph: c?.speed_mph ?? null,
            heightFt: c?.height_ft ?? null,
          });
        }
        setWrappedSummary(buildWrappedSummary(wrappedPeriod, events, metaByCoasterId));
        setWrappedLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [loading, friendAccessDenied, activeStatsUserId, wrappedPeriod, rideMeta]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <div className="mb-6">
            <Link
              href={statsHref}
              className="text-sm font-medium text-amber-800 hover:text-amber-900"
            >
              ← Back to stats
            </Link>
            <AppPageHeading className="mt-2">
              {isOwnStatsView ? "Wrapped" : `${shareDisplayName ?? "Friend"}'s Wrapped`}
            </AppPageHeading>
            {!isOwnStatsView && (
              <p className="mt-1 text-sm text-slate-500">
                {viewingPublicProfile
                  ? "This profile is public, so signed-in users can see ride highlights by month or year."
                  : "Viewing a friend profile from your accepted friends list."}
              </p>
            )}
          </div>

          {friendAccessDenied ? (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {shareDisplayName
                ? `${shareDisplayName} keeps their stats private.`
                : "This profile is private or could not be found."}
            </p>
          ) : loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <MonthWrappedCard
              period={wrappedPeriod}
              onPeriodChange={setWrappedPeriod}
              summary={wrappedSummary}
              loading={wrappedLoading}
              error={wrappedError}
              isOwnStats={isOwnStatsView}
            />
          )}
        </AuthGate>
      </main>
    </div>
  );
}

export default function StatsWrappedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen">
          <SiteHeader />
          <main className="mx-auto max-w-4xl p-6">
            <p className="text-sm text-slate-500">Loading…</p>
          </main>
        </div>
      }
    >
      <StatsWrappedInner />
    </Suspense>
  );
}
