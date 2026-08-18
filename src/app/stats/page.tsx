"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { AppPageHeading } from "@/components/app-page-heading";
import { applyRideCredit } from "@/components/coaster-actions";
import { CoasterThumbnail } from "@/components/coaster-thumbnail";
import { ProfileAvatar } from "@/components/profile-avatar";
import { RiddenRideSheet } from "@/components/ridden-ride-sheet";
import { SiteHeader } from "@/components/site-header";
import { StarRating } from "@/components/star-rating";
import { StatsShareControls } from "@/components/stats-share-controls";
import { StatsComparePanel } from "@/components/stats-compare-panel";
import type { StatsShareCardProps } from "@/components/stats-share-card";
import {
  ACHIEVEMENT_COUNT,
  achievementRarityCardClass,
  achievementRarityLabel,
  achievementRarityPillClass,
  evaluateAchievementsWithUnlockTimes,
  filterAndSortAchievements,
  type AchievementRide,
} from "@/lib/achievements";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { isThrillCoaster, normalizeCoasterDedupKey } from "@/lib/coaster-dedup";
import { continentIdForCountryLabel } from "@/lib/country-continent";
import { cleanCoasterName, formatParkLabel, matchesSearchQuery } from "@/lib/display";
import { compactImageUrl } from "@/lib/image-url";
import { effectiveCoasterType } from "@/lib/wikidata-coaster-inference";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { loadRideCreditSummaries, logRideEvents, summariesByCoasterId } from "@/lib/ride-log";
import {
  canViewOtherUserStats,
  removeRidePhoto,
  signRidePhotoVariants,
} from "@/lib/ride-photos";
import { signAvatarUrls } from "@/lib/profile-photos";
import {
  buildStatsCopyText,
  formatRideCount,
  type RideCreditSummary,
} from "@/lib/ride-history";
import { useUnits } from "@/components/providers";
import { fmtLength, fmtHeight, fmtSpeed, fmtDuration } from "@/lib/units";
import { UnitsToggle } from "@/components/units-toggle";
import { toCompareCredit } from "@/lib/stats-compare";

type RideCoaster = {
  id?: number;
  park_id?: number;
  name: string;
  wikidata_id?: string | null;
  image_url?: string | null;
  coaster_type: string;
  manufacturer: string | null;
  length_ft: number | null;
  speed_mph: number | null;
  height_ft: number | null;
  inversions: number | null;
  /** Ride duration (track time), seconds */
  duration_s: number | null;
  status?: string;
  opening_year?: number | null;
  closing_year?: number | null;
  parks?: { name: string; country: string } | null;
};

type RideRow = {
  coaster_id: number;
  rating: number | null;
  ridden_at?: string | null;
  total_rides: number;
  first_ridden_on: string | null;
  last_ridden_on: string | null;
  photo_path?: string | null;
  photoUrl?: string | null;
  photoThumbUrl?: string | null;
  coasters?: RideCoaster | null;
};

type RideSort = "name" | "rating" | "recent" | "rides";
type RideCountFilter = "any" | "1" | "2+" | "3+" | "5+" | "10+";

function rideCountMatches(totalRides: number, filter: RideCountFilter): boolean {
  const n = Math.max(1, totalRides);
  if (filter === "any") return true;
  if (filter === "1") return n === 1;
  if (filter === "2+") return n >= 2;
  if (filter === "3+") return n >= 3;
  if (filter === "5+") return n >= 5;
  return n >= 10;
}

function recencyTimestamp(ride: RideRow): number {
  if (ride.last_ridden_on) {
    const t = Date.parse(`${ride.last_ridden_on}T00:00:00`);
    return Number.isFinite(t) ? t : 0;
  }
  if (ride.ridden_at) {
    const t = Date.parse(ride.ridden_at);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

type ProfileRow = {
  display_name: string | null;
  avatar_key: string | null;
  avatar_path: string | null;
  favorite_ride_id: number | null;
  favorite_park_id: number | null;
  stats_visibility?: string | null;
};

type ParkRow = {
  name: string | null;
  country: string | null;
};

type FavoriteCoasterRow = {
  name: string | null;
  parks: ParkRow | ParkRow[] | null;
};

type RiddenRideRowProps = {
  ride: RideRow;
  selected: boolean;
  canEdit: boolean;
  onOpen: (coasterId: number) => void;
};

const RiddenRideRow = memo(function RiddenRideRow({
  ride,
  selected,
  canEdit,
  onOpen,
}: RiddenRideRowProps) {
  const { units } = useUnits();
  const parkName = (ride.coasters?.parks?.name ?? "").trim();
  const typeLabel = effectiveCoasterType(
    ride.coasters?.coaster_type,
    ride.coasters?.manufacturer,
  );
  const coasterName = cleanCoasterName(ride.coasters?.name ?? `Coaster ${ride.coaster_id}`);
  const metaParts = [parkName || null, typeLabel || null].filter(Boolean);
  const c = ride.coasters;
  const statParts = [
    fmtHeight(c?.height_ft, units),
    fmtSpeed(c?.speed_mph, units),
    fmtLength(c?.length_ft, units),
    c?.inversions != null && c.inversions > 0 ? `${c.inversions} inv` : null,
    fmtDuration(c?.duration_s),
  ].filter(Boolean);
  return (
    <li className="border-b border-slate-100 last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:84px]">
      <button
        type="button"
        onClick={() => onOpen(ride.coaster_id)}
        aria-current={selected ? "true" : undefined}
        aria-label={
          ride.rating != null
            ? `${coasterName}, ${ride.rating} out of 5 stars`
            : canEdit
              ? `${coasterName}, tap to rate`
              : `${coasterName}, not rated`
        }
        className={`flex w-full min-w-0 items-center gap-2.5 py-2 text-left transition hover:bg-slate-50 active:bg-slate-100 ${
          selected ? "bg-amber-50/70" : ""
        }`}
        style={{ height: RIDE_ROW_HEIGHT_PX }}
      >
        <CoasterThumbnail
          name={coasterName}
          imageUrl={compactImageUrl(ride.photoThumbUrl || ride.photoUrl || ride.coasters?.image_url)}
          sizeClassName="h-10 w-10"
          showMissingLabel
          allowPreview={false}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-semibold text-slate-900">
            {coasterName}
          </p>
          {metaParts.length > 0 && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {metaParts.join(" · ")}
            </p>
          )}
          {statParts.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] tabular-nums text-slate-400">
              {statParts.join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {ride.total_rides > 1 && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
              ×{ride.total_rides}
            </span>
          )}
          {/* Compact on narrow screens so stars/sort don't get clipped */}
          <span
            className={`text-xs font-semibold tabular-nums sm:hidden ${
              ride.rating != null ? "text-amber-600" : "text-slate-300"
            }`}
            aria-hidden
          >
            {ride.rating != null ? `${ride.rating}★` : "☆"}
          </span>
          <span className="hidden sm:inline-flex">
            <StarRating value={ride.rating} size="sm" label={`${coasterName} rating`} />
          </span>
          <span className="text-slate-300" aria-hidden>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </span>
        </div>
      </button>
    </li>
  );
}, (prev, next) =>
  prev.ride === next.ride &&
  prev.ride.total_rides === next.ride.total_rides &&
  prev.selected === next.selected &&
  prev.canEdit === next.canEdit &&
  prev.onOpen === next.onOpen
);

/** Virtualized ride rows — room for name + park/type + compact stats. */
const RIDE_ROW_HEIGHT_PX = 84;
const INITIAL_VISIBLE_RIDES = 80;
const LOAD_MORE_RIDES_STEP = 80;
// Keep a larger buffer mounted to avoid thumbnail remount/reload churn while scrolling.
const RIDE_ROW_OVERSCAN = 24;
const RIDE_LIST_FALLBACK_VIEWPORT_PX = 352;

function firstPark(park: ParkRow | ParkRow[] | null | undefined): ParkRow | null {
  if (!park) return null;
  return Array.isArray(park) ? (park[0] ?? null) : park;
}

function rideToCompareCredit(ride: RideRow) {
  const c = ride.coasters;
  const park = firstPark(c?.parks);
  return toCompareCredit({
    coasterId: ride.coaster_id,
    name: c?.name ?? `Coaster ${ride.coaster_id}`,
    parkId: c?.park_id ?? null,
    parkName: park?.name ?? null,
    country: park?.country ?? null,
    coasterType: c?.coaster_type,
    manufacturer: c?.manufacturer,
    lengthFt: c?.length_ft,
    speedMph: c?.speed_mph,
    heightFt: c?.height_ft,
    inversions: c?.inversions,
    durationS: c?.duration_s,
    totalRides: ride.total_rides,
    status: c?.status,
  });
}

function imageFallbackKeys(parkId: number, coasterName: string): string[] {
  const base = normalizeCoasterDedupKey(coasterName);
  const keys = new Set<string>([`${parkId}:${base}`]);
  const stripped = base
    .replace(/megacoaster$/i, "")
    .replace(/hypercoaster$/i, "")
    .replace(/gigacoaster$/i, "")
    .replace(/stratacoaster$/i, "")
    .replace(/rollercoaster$/i, "")
    .replace(/coaster$/i, "");
  if (stripped && stripped !== base) keys.add(`${parkId}:${stripped}`);
  return [...keys];
}

async function fillMissingRideImages(
  rows: RideRow[],
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
): Promise<RideRow[]> {
  const missing = rows.filter(
    (r) => r.coasters?.image_url == null && r.coasters?.park_id != null && r.coasters?.name,
  );
  if (missing.length === 0) return rows;

  const parkIds = [...new Set(missing.map((r) => r.coasters!.park_id!))];
  const wikidataIds = [
    ...new Set(
      missing
        .map((r) => r.coasters?.wikidata_id?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [parkScopedRes, wikidataRes] = await Promise.all([
    supabase
      .from("coasters")
      .select("park_id, name, wikidata_id, image_url")
      .in("park_id", parkIds)
      .not("image_url", "is", null),
    wikidataIds.length > 0
      ? supabase
          .from("coasters")
          .select("park_id, name, wikidata_id, image_url")
          .in("wikidata_id", wikidataIds)
          .not("image_url", "is", null)
      : Promise.resolve({
          data: [] as Array<{ park_id: number; name: string; wikidata_id: string | null; image_url: string | null }>,
          error: null,
        }),
  ]);
  if (parkScopedRes.error) return rows;
  if (wikidataRes.error) return rows;
  const data = [...(parkScopedRes.data ?? []), ...(wikidataRes.data ?? [])];
  if (data.length === 0) return rows;

  const imageByKey = new Map<string, string>();
  const imageByWikidataId = new Map<string, string>();
  for (const entry of data as Array<{ park_id: number; name: string; wikidata_id: string | null; image_url: string | null }>) {
    if (!entry.image_url) continue;
    const qid = entry.wikidata_id?.trim().toUpperCase();
    if (qid && !imageByWikidataId.has(qid)) imageByWikidataId.set(qid, entry.image_url);
    for (const key of imageFallbackKeys(entry.park_id, entry.name)) {
      if (!imageByKey.has(key)) imageByKey.set(key, entry.image_url);
    }
  }

  return rows.map((r) => {
    const coaster = r.coasters;
    if (!coaster || coaster.image_url || coaster.park_id == null) return r;
    const qid = coaster.wikidata_id?.trim().toUpperCase();
    let fallback = qid ? imageByWikidataId.get(qid) : undefined;
    for (const key of imageFallbackKeys(coaster.park_id, coaster.name)) {
      const hit = imageByKey.get(key);
      if (hit) {
        fallback = hit;
        break;
      }
    }
    if (!fallback) return r;
    return { ...r, coasters: { ...coaster, image_url: fallback } };
  });
}

function StatsPageContent() {
  const searchParams = useSearchParams();
  const requestedUserId = searchParams.get("user")?.trim() || null;
  const compareRequested = searchParams.get("compare") === "1";
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [userId, setUserId] = useState<string | null>(null);
  const [activeStatsUserId, setActiveStatsUserId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [savingRating, setSavingRating] = useState(false);
  const [loggingRide, setLoggingRide] = useState(false);
  const [selectedCoasterId, setSelectedCoasterId] = useState<number | null>(null);
  const [rideSort, setRideSort] = useState<RideSort>("name");
  const [rideCountFilter, setRideCountFilter] = useState<RideCountFilter>("any");
  const [fetchError, setFetchError] = useState(false);
  const [friendAccessDenied, setFriendAccessDenied] = useState(false);
  const [viewingPublicProfile, setViewingPublicProfile] = useState(false);
  const [includeFamilyRides, setIncludeFamilyRides] = useState(false);
  const [visibleRideCount, setVisibleRideCount] = useState(INITIAL_VISIBLE_RIDES);
  const [rideListScrollTop, setRideListScrollTop] = useState(0);
  const [rideListViewportHeight, setRideListViewportHeight] = useState(0);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [shareDisplayName, setShareDisplayName] = useState<string | null>(null);
  const [profileAvatarKey, setProfileAvatarKey] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [favoriteRideLabel, setFavoriteRideLabel] = useState("Not set");
  const [favoriteParkLabel, setFavoriteParkLabel] = useState("Not set");
  const [friendCount, setFriendCount] = useState(0);
  const rideListRef = useRef<HTMLUListElement | null>(null);
  const rideListRafRef = useRef<number | null>(null);
  const { units, setUnits } = useUnits();
  const isOwnStatsView = !activeStatsUserId || (!!userId && userId === activeStatsUserId);
  const viewingOther = Boolean(userId && requestedUserId && requestedUserId !== userId);
  const compareMode = viewingOther && compareRequested && !friendAccessDenied;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setFetchError(false);
    setFriendAccessDenied(false);
    setViewingPublicProfile(false);
    setRides([]);
    setShareDisplayName(null);
    setProfileAvatarKey(null);
    setProfileAvatarUrl(null);
    setFavoriteRideLabel("Not set");
    setFavoriteParkLabel("Not set");
    setFriendCount(0);

    void getSupabaseUserSafe().then(async (user) => {
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const targetUserId = requestedUserId && requestedUserId !== user.id ? requestedUserId : user.id;
      setActiveStatsUserId(targetUserId);

      const profileQuery = supabase
        .from("profiles")
        .select("display_name, avatar_key, avatar_path, favorite_ride_id, favorite_park_id, stats_visibility")
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
      if (targetUserId !== user.id) {
        const isFriend = !friendshipRes.error && (friendshipRes.data?.length ?? 0) > 0;
        const visibility = profilePreview.data?.stats_visibility;
        if (!profilePreview.data || !canViewOtherUserStats(visibility, isFriend)) {
          setShareDisplayName(
            typeof profilePreview.data?.display_name === "string" ? profilePreview.data.display_name : null,
          );
          setRides([]);
          setFriendAccessDenied(true);
          setLoading(false);
          return;
        }
        setViewingPublicProfile(!isFriend && visibility === "public");
      }

      const [ridesRes, friendCountRes, summariesRes] = await Promise.all([
        supabase
          .from("rides")
          .select(
            "coaster_id, rating, ridden_at, photo_path, coasters(park_id, name, wikidata_id, image_url, coaster_type, manufacturer, length_ft, speed_mph, height_ft, inversions, duration_s, parks(name, country))",
          )
          .eq("user_id", targetUserId),
        supabase.rpc("accepted_friend_count", { target: targetUserId }),
        loadRideCreditSummaries(supabase, targetUserId),
      ]);
      const profileRes = profilePreview;

      if (ridesRes.error) {
        setFetchError(true);
      }

      setFriendCount(typeof friendCountRes.data === "number" ? friendCountRes.data : 0);
      const rows = (ridesRes.data ?? []) as unknown as RideRow[];
      const summaryMap = summariesByCoasterId(summariesRes.summaries);
      const mapped = rows.map((r) => {
        const summary = summaryMap.get(r.coaster_id);
        return {
          ...r,
          rating: typeof r.rating === "number" ? r.rating : null,
          ridden_at: r.ridden_at ?? null,
          total_rides: summary?.totalRides ?? 1,
          first_ridden_on: summary?.firstRiddenOn ?? null,
          last_ridden_on: summary?.lastRiddenOn ?? null,
          coasters: r.coasters ? applyCoasterKnownFixes(r.coasters) : null,
        };
      });
      const photoUrls = await signRidePhotoVariants(
        supabase,
        mapped.map((ride) => ride.photo_path),
      );
      const withPhotos = mapped.map((ride) => {
        const signed = ride.photo_path ? photoUrls.get(ride.photo_path) : undefined;
        return {
          ...ride,
          photoUrl: signed?.fullUrl ?? null,
          photoThumbUrl: signed?.thumbUrl ?? signed?.fullUrl ?? null,
        };
      });
      const hydrated = await fillMissingRideImages(withPhotos, supabase);
      setRides(hydrated);

      const profile = (profileRes.data as ProfileRow | null) ?? null;
      const displayName = profile?.display_name?.trim() || null;
      setShareDisplayName(displayName);
      setProfileAvatarKey(profile?.avatar_key ?? null);
      if (profile?.avatar_path) {
        const signed = await signAvatarUrls(supabase, [profile.avatar_path]);
        setProfileAvatarUrl(signed.get(profile.avatar_path) ?? null);
      } else {
        setProfileAvatarUrl(null);
      }
      let nextFavoriteRideLabel = "Not set";
      let nextFavoriteParkLabel = "Not set";

      if (profile?.favorite_ride_id != null) {
        const { data: favoriteRide } = await supabase
          .from("coasters")
          .select("name, parks(name, country)")
          .eq("id", profile.favorite_ride_id)
          .maybeSingle();
        const rideRow = (favoriteRide as FavoriteCoasterRow | null) ?? null;
        const rideName = cleanCoasterName(rideRow?.name ?? "");
        const ridePark = firstPark(rideRow?.parks);
        const rideParkLabel = formatParkLabel(ridePark?.name ?? undefined, ridePark?.country ?? undefined);
        if (rideName && rideParkLabel) {
          nextFavoriteRideLabel = `${rideName} (${rideParkLabel})`;
        } else if (rideName) {
          nextFavoriteRideLabel = rideName;
        }
      }

      if (profile?.favorite_park_id != null) {
        const { data: favoritePark } = await supabase
          .from("parks")
          .select("name, country")
          .eq("id", profile.favorite_park_id)
          .maybeSingle();
        const parkRow = (favoritePark as ParkRow | null) ?? null;
        const parkLabel = formatParkLabel(parkRow?.name ?? undefined, parkRow?.country ?? undefined);
        if (parkLabel) nextFavoriteParkLabel = parkLabel;
      }

      setFavoriteRideLabel(nextFavoriteRideLabel);
      setFavoriteParkLabel(nextFavoriteParkLabel);
      setLoading(false);
    });
  }, [requestedUserId]);

  const uniqueRides = useMemo(() => {
    const seen = new Set<number>();
    return rides.filter((r) => {
      if (seen.has(r.coaster_id)) return false;
      seen.add(r.coaster_id);
      return true;
    });
  }, [rides]);

  const theirCompareCredits = useMemo(
    () => uniqueRides.map(rideToCompareCredit),
    [uniqueRides],
  );

  /** Same rules as /achievements: every logged credit counts (including family rides). */
  const unlockedAchievements = useMemo(() => {
    const achievementRides: AchievementRide[] = uniqueRides.map((r) => ({
      coaster_id: r.coaster_id,
      ridden_at: r.ridden_at ?? null,
      coasters: r.coasters
        ? {
            park_id: r.coasters.park_id ?? 0,
            name: r.coasters.name,
            wikidata_id: r.coasters.wikidata_id ?? null,
            coaster_type: r.coasters.coaster_type,
            manufacturer: r.coasters.manufacturer ?? null,
            length_ft: r.coasters.length_ft ?? null,
            speed_mph: r.coasters.speed_mph ?? null,
            height_ft: r.coasters.height_ft ?? null,
            inversions: r.coasters.inversions ?? null,
            duration_s: r.coasters.duration_s ?? null,
            parks: r.coasters.parks ?? null,
          }
        : null,
    }));
    return filterAndSortAchievements(
      evaluateAchievementsWithUnlockTimes(achievementRides, {
        friendCount,
        friendAcceptedAt: [],
      }),
      "unlocked",
      "rarity-desc",
    );
  }, [uniqueRides, friendCount]);

  const filteredUniqueRides = useMemo(() => {
    if (includeFamilyRides) return uniqueRides;
    return uniqueRides.filter((r) => {
      const c = r.coasters;
      if (!c) return false;
      return isThrillCoaster(
        {
          id: c.id ?? r.coaster_id,
          park_id: c.park_id ?? 0,
          name: c.name,
          coaster_type: c.coaster_type,
          manufacturer: c.manufacturer ?? null,
          status: c.status ?? "Operating",
          length_ft: c.length_ft ?? null,
          speed_mph: c.speed_mph ?? null,
          height_ft: c.height_ft ?? null,
          inversions: c.inversions ?? null,
          duration_s: c.duration_s ?? null,
          opening_year: c.opening_year ?? null,
          closing_year: c.closing_year ?? null,
        },
        c.parks?.name ?? null,
      );
    });
  }, [includeFamilyRides, uniqueRides]);

  const countriesVisited = useMemo(
    () => new Set(filteredUniqueRides.map((r) => r.coasters?.parks?.country).filter(Boolean)).size,
    [filteredUniqueRides],
  );

  const parksVisited = useMemo(
    () =>
      new Set(
        filteredUniqueRides
          .map((r) => formatParkLabel(r.coasters?.parks?.name, r.coasters?.parks?.country))
          .filter(Boolean),
      ).size,
    [filteredUniqueRides],
  );

  const topParks = useMemo(() => {
    const counter = new Map<string, number>();
    for (const ride of filteredUniqueRides) {
      const label = formatParkLabel(ride.coasters?.parks?.name, ride.coasters?.parks?.country);
      if (!label) continue;
      counter.set(label, (counter.get(label) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filteredUniqueRides]);

  /** Unique countries from ridden coasters, with ride counts, most rides first */
  const countriesWithRideCounts = useMemo(() => {
    const counter = new Map<string, number>();
    for (const ride of filteredUniqueRides) {
      const country = ride.coasters?.parks?.country;
      if (!country) continue;
      counter.set(country, (counter.get(country) ?? 0) + 1);
    }
    return [...counter.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  }, [filteredUniqueRides]);

  type RecordEntry = { name: string; park: string; value: number };

  const personalRecords = useMemo(() => {
    function best(
      field: keyof Pick<RideCoaster, "length_ft" | "speed_mph" | "height_ft" | "inversions" | "duration_s">,
    ): RecordEntry | null {
      let top: RecordEntry | null = null;
      for (const r of filteredUniqueRides) {
        const v = r.coasters?.[field];
        if (v == null) continue;
        if (top === null || v > top.value) {
          top = {
            name: cleanCoasterName(r.coasters?.name ?? ""),
            park: formatParkLabel(r.coasters?.parks?.name, r.coasters?.parks?.country),
            value: v,
          };
        }
      }
      return top;
    }
    return {
      longest: best("length_ft"),
      tallest: best("height_ft"),
      fastest: best("speed_mph"),
      mostInversions: best("inversions"),
      longestDuration: best("duration_s"),
      mostRidden: (() => {
        let top: RecordEntry | null = null;
        for (const r of filteredUniqueRides) {
          const v = r.total_rides ?? 1;
          if (v <= 1) continue;
          if (top === null || v > top.value) {
            top = {
              name: cleanCoasterName(r.coasters?.name ?? ""),
              park: formatParkLabel(r.coasters?.parks?.name, r.coasters?.parks?.country),
              value: v,
            };
          }
        }
        return top;
      })(),
    };
  }, [filteredUniqueRides]);

  const hasAnyRecord = Object.values(personalRecords).some(Boolean);

  const [rideFilter, setRideFilter] = useState("");

  const filteredRides = useMemo(() => {
    const searched = filteredUniqueRides.filter((r) => {
      if (!rideCountMatches(r.total_rides || 1, rideCountFilter)) return false;
      if (!rideFilter.trim()) return true;
      const c = r.coasters;
      return (
        matchesSearchQuery(cleanCoasterName(c?.name ?? ""), rideFilter) ||
        matchesSearchQuery(c?.parks?.name ?? "", rideFilter) ||
        matchesSearchQuery(c?.parks?.country ?? "", rideFilter) ||
        matchesSearchQuery(c?.coaster_type ?? "", rideFilter) ||
        matchesSearchQuery(effectiveCoasterType(c?.coaster_type, c?.manufacturer), rideFilter) ||
        matchesSearchQuery(c?.manufacturer ?? "", rideFilter)
      );
    });

    const sorted = [...searched];
    if (rideSort === "rating") {
      sorted.sort((a, b) => {
        const ar = a.rating ?? -1;
        const br = b.rating ?? -1;
        if (br !== ar) return br - ar;
        return cleanCoasterName(a.coasters?.name ?? "").localeCompare(
          cleanCoasterName(b.coasters?.name ?? ""),
        );
      });
    } else if (rideSort === "recent") {
      sorted.sort((a, b) => {
        const at = recencyTimestamp(a);
        const bt = recencyTimestamp(b);
        if (bt !== at) return bt - at;
        return cleanCoasterName(a.coasters?.name ?? "").localeCompare(
          cleanCoasterName(b.coasters?.name ?? ""),
        );
      });
    } else if (rideSort === "rides") {
      sorted.sort((a, b) => {
        const ac = a.total_rides || 1;
        const bc = b.total_rides || 1;
        if (bc !== ac) return bc - ac;
        return cleanCoasterName(a.coasters?.name ?? "").localeCompare(
          cleanCoasterName(b.coasters?.name ?? ""),
        );
      });
    } else {
      sorted.sort((a, b) =>
        cleanCoasterName(a.coasters?.name ?? "").localeCompare(
          cleanCoasterName(b.coasters?.name ?? ""),
        ),
      );
    }
    return sorted;
  }, [filteredUniqueRides, rideCountFilter, rideFilter, rideSort]);

  const selectedRide = useMemo(
    () => (selectedCoasterId == null ? null : rides.find((r) => r.coaster_id === selectedCoasterId) ?? null),
    [rides, selectedCoasterId],
  );

  const displayedRides = useMemo(
    () => filteredRides.slice(0, visibleRideCount),
    [filteredRides, visibleRideCount],
  );

  useEffect(() => {
    const list = rideListRef.current;
    if (!list) return;

    const updateViewportHeight = () => {
      setRideListViewportHeight(list.clientHeight);
    };
    updateViewportHeight();

    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(list);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (rideListRafRef.current != null) {
        cancelAnimationFrame(rideListRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (rideListRef.current) {
      rideListRef.current.scrollTop = 0;
    }
    const raf = window.requestAnimationFrame(() => {
      setRideListScrollTop(0);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [rideFilter, rideCountFilter, includeFamilyRides, rideSort]);

  const virtualizedRideRows = useMemo(() => {
    const total = displayedRides.length;
    if (total === 0) {
      return {
        rows: [] as RideRow[],
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const viewport = rideListViewportHeight || RIDE_LIST_FALLBACK_VIEWPORT_PX;
    const rawStart = Math.floor(rideListScrollTop / RIDE_ROW_HEIGHT_PX) - RIDE_ROW_OVERSCAN;
    const start = Math.max(0, Math.min(rawStart, total - 1));
    const visibleCount =
      Math.ceil(viewport / RIDE_ROW_HEIGHT_PX) + RIDE_ROW_OVERSCAN * 2;
    const end = Math.min(total, start + visibleCount);

    return {
      rows: displayedRides.slice(start, end),
      topSpacerHeight: start * RIDE_ROW_HEIGHT_PX,
      bottomSpacerHeight: Math.max(0, (total - end) * RIDE_ROW_HEIGHT_PX),
    };
  }, [displayedRides, rideListScrollTop, rideListViewportHeight]);

  const openRideSheet = useCallback((coasterId: number) => {
    setSelectedCoasterId(coasterId);
  }, []);

  const closeRideSheet = useCallback(() => {
    if (savingRating || removing !== null || loggingRide) return;
    setSelectedCoasterId(null);
  }, [loggingRide, removing, savingRating]);

  const rateRide = useCallback(async (coasterId: number, rating: number | null) => {
    if (!isOwnStatsView) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId || savingRating || removing !== null || loggingRide) return;
    setSavingRating(true);
    const { error } = await supabase
      .from("rides")
      .update({ rating })
      .eq("user_id", userId)
      .eq("coaster_id", coasterId);
    if (!error) {
      setRides((prev) =>
        prev.map((ride) => (ride.coaster_id === coasterId ? { ...ride, rating } : ride)),
      );
    }
    setSavingRating(false);
  }, [isOwnStatsView, loggingRide, removing, savingRating, userId]);

  const addRide = useCallback(async (coasterId: number, quantity: number, riddenOn: string) => {
    if (!isOwnStatsView) return { ok: false as const, message: "You can only edit your own rides." };
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId || loggingRide || removing !== null || savingRating) {
      return { ok: false as const, message: "Please wait a moment and try again." };
    }
    setLoggingRide(true);
    const result = await logRideEvents(supabase, { coasterId, riddenOn, quantity });
    if (result.ok) {
      applyRideCredit(coasterId, result.summary);
      setRides((prev) =>
        prev.map((ride) =>
          ride.coaster_id === coasterId
            ? {
                ...ride,
                total_rides: result.summary.totalRides,
                first_ridden_on: result.summary.firstRiddenOn,
                last_ridden_on: result.summary.lastRiddenOn,
              }
            : ride,
        ),
      );
    }
    setLoggingRide(false);
    return result;
  }, [isOwnStatsView, loggingRide, removing, savingRating, userId]);

  const applyHistoryChange = useCallback((coasterId: number, summary: RideCreditSummary | null) => {
    applyRideCredit(coasterId, summary);
    if (!summary) {
      setRides((prev) => prev.filter((ride) => ride.coaster_id !== coasterId));
      setSelectedCoasterId((currentId) => (currentId === coasterId ? null : currentId));
      return;
    }
    setRides((prev) =>
      prev.map((ride) =>
        ride.coaster_id === coasterId
          ? {
              ...ride,
              total_rides: summary.totalRides,
              first_ridden_on: summary.firstRiddenOn,
              last_ridden_on: summary.lastRiddenOn,
            }
          : ride,
      ),
    );
  }, []);

  const applyPhotoChange = useCallback(
    (coasterId: number, next: { photoPath: string | null; photoUrl: string | null; photoThumbUrl?: string | null }) => {
      setRides((prev) =>
        prev.map((ride) =>
          ride.coaster_id === coasterId
            ? {
                ...ride,
                photo_path: next.photoPath,
                photoUrl: next.photoUrl,
                photoThumbUrl: next.photoThumbUrl ?? next.photoUrl,
              }
            : ride,
        ),
      );
    },
    [],
  );

  const removeRide = useCallback(async (coasterId: number, name: string) => {
    if (!isOwnStatsView) return;
    const current = rides.find((ride) => ride.coaster_id === coasterId);
    const count = current?.total_rides ?? 1;
    const confirmMessage =
      count > 1
        ? `Remove "${name}" and all ${count} logged rides?`
        : `Remove "${name}" from your ridden list?`;
    if (!confirm(confirmMessage)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId || removing !== null || savingRating || loggingRide) return;
    setRemoving(coasterId);
    const { error } = await supabase.from("rides").delete().eq("user_id", userId).eq("coaster_id", coasterId);
    if (!error) {
      applyRideCredit(coasterId, null);
      if (current?.photo_path) {
        void removeRidePhoto(supabase, userId, coasterId, current.photo_path);
      }
      setRides((prev) => prev.filter((r) => r.coaster_id !== coasterId));
      setSelectedCoasterId((currentId) => (currentId === coasterId ? null : currentId));
    }
    setRemoving(null);
  }, [isOwnStatsView, loggingRide, removing, rides, savingRating, userId]);

  const totalTrackLengthFt = useMemo(
    () => filteredUniqueRides.reduce((sum, ride) => sum + (ride.coasters?.length_ft ?? 0), 0),
    [filteredUniqueRides],
  );
  const totalRideDurationS = useMemo(
    () => filteredUniqueRides.reduce((sum, ride) => sum + (ride.coasters?.duration_s ?? 0), 0),
    [filteredUniqueRides],
  );
  const totalInversions = useMemo(
    () => filteredUniqueRides.reduce((sum, ride) => sum + (ride.coasters?.inversions ?? 0), 0),
    [filteredUniqueRides],
  );
  const averageSpeedMph = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const ride of filteredUniqueRides) {
      const speed = ride.coasters?.speed_mph;
      if (speed == null) continue;
      sum += speed;
      count += 1;
    }
    return count > 0 ? sum / count : 0;
  }, [filteredUniqueRides]);
  const continentsVisited = useMemo(
    () => {
      const continentIds = new Set<string>();
      for (const ride of filteredUniqueRides) {
        const continentId = continentIdForCountryLabel(ride.coasters?.parks?.country);
        if (continentId) continentIds.add(continentId);
      }
      return continentIds.size;
    },
    [filteredUniqueRides],
  );

  const totalRides = useMemo(
    () => filteredUniqueRides.reduce((sum, ride) => sum + (ride.total_rides || 1), 0),
    [filteredUniqueRides],
  );

  const statCards = [
    { label: "Coaster credits", value: filteredUniqueRides.length.toLocaleString() },
    { label: "Total rides", value: totalRides.toLocaleString() },
    { label: "Parks visited", value: parksVisited.toLocaleString() },
    { label: "Countries visited", value: countriesVisited.toLocaleString() },
    { label: "Continents visited", value: continentsVisited.toLocaleString() },
    { label: "Total ride time", value: fmtDuration(totalRideDurationS) ?? `${Math.round(totalRideDurationS).toLocaleString()} s` },
    { label: "Total inversions", value: Math.round(totalInversions).toLocaleString() },
    {
      label: "Average speed",
      value:
        averageSpeedMph > 0
          ? (fmtSpeed(Math.round(averageSpeedMph), units) ?? `${Math.round(averageSpeedMph).toLocaleString()} mph`)
          : "—",
    },
    { label: "Total track length", value: fmtLength(totalTrackLengthFt, units) ?? `${Math.round(totalTrackLengthFt).toLocaleString()} ft` },
  ];

  async function copyStatsSummary() {
    const summary = buildStatsCopyText({
      displayName: shareDisplayName,
      includeFamilyRides,
      uniqueCoasters: filteredUniqueRides.length,
      totalRides,
      parksVisited,
      countriesVisited,
      continentsVisited,
      totalTrackLength: fmtLength(totalTrackLengthFt, units) ?? `${Math.round(totalTrackLengthFt).toLocaleString()} ft`,
      totalRideTime: fmtDuration(totalRideDurationS) ?? `${Math.round(totalRideDurationS).toLocaleString()} s`,
      totalInversions: Math.round(totalInversions).toLocaleString(),
      averageSpeed:
        averageSpeedMph > 0
          ? (fmtSpeed(Math.round(averageSpeedMph), units) ?? `${Math.round(averageSpeedMph).toLocaleString()} mph`)
          : "N/A",
      favoriteRideLabel,
      favoriteParkLabel,
      mostRidden: personalRecords.mostRidden
        ? { name: personalRecords.mostRidden.name, rides: personalRecords.mostRidden.value }
        : null,
      fastest: personalRecords.fastest
        ? `${cleanCoasterName(personalRecords.fastest.name)} (${fmtSpeed(personalRecords.fastest.value, units) ?? `${personalRecords.fastest.value} mph`})`
        : null,
      tallest: personalRecords.tallest
        ? `${cleanCoasterName(personalRecords.tallest.name)} (${fmtHeight(personalRecords.tallest.value, units) ?? `${personalRecords.tallest.value} ft`})`
        : null,
      longest: personalRecords.longest
        ? `${cleanCoasterName(personalRecords.longest.name)} (${fmtLength(personalRecords.longest.value, units) ?? `${personalRecords.longest.value} ft`})`
        : null,
      mostInversions: personalRecords.mostInversions
        ? `${cleanCoasterName(personalRecords.mostInversions.name)} (${personalRecords.mostInversions.value})`
        : null,
      longestRide: personalRecords.longestDuration
        ? `${cleanCoasterName(personalRecords.longestDuration.name)} (${fmtDuration(personalRecords.longestDuration.value) ?? `${personalRecords.longestDuration.value}s`})`
        : null,
    });

    try {
      await navigator.clipboard.writeText(summary);
      setShareFeedback("Stats copied. Share it with your friends.");
    } catch {
      setShareFeedback("Could not copy stats. Please try again.");
    }
  }

  const shareCardProps = useMemo<StatsShareCardProps>(() => {
    const records = [
      personalRecords.mostRidden
        ? {
            label: "Most ridden",
            value: `${personalRecords.mostRidden.value}×`,
            detail: cleanCoasterName(personalRecords.mostRidden.name),
          }
        : null,
      personalRecords.tallest
        ? {
            label: "Tallest",
            value: fmtHeight(personalRecords.tallest.value, units) ?? `${personalRecords.tallest.value} ft`,
            detail: cleanCoasterName(personalRecords.tallest.name),
          }
        : null,
      personalRecords.fastest
        ? {
            label: "Fastest",
            value: fmtSpeed(personalRecords.fastest.value, units) ?? `${personalRecords.fastest.value} mph`,
            detail: cleanCoasterName(personalRecords.fastest.name),
          }
        : null,
      personalRecords.longest
        ? {
            label: "Longest",
            value: fmtLength(personalRecords.longest.value, units) ?? `${personalRecords.longest.value} ft`,
            detail: cleanCoasterName(personalRecords.longest.name),
          }
        : null,
      personalRecords.mostInversions
        ? {
            label: "Most inversions",
            value: String(personalRecords.mostInversions.value),
            detail: cleanCoasterName(personalRecords.mostInversions.name),
          }
        : null,
    ].filter((row): row is NonNullable<typeof row> => row != null);

    return {
      displayName: shareDisplayName?.trim() || "My stats",
      coasters: filteredUniqueRides.length,
      totalRides,
      parks: parksVisited,
      countries: countriesVisited,
      achievementsUnlocked: unlockedAchievements.length,
      achievementsTotal: ACHIEVEMENT_COUNT,
      records,
      filterNote: includeFamilyRides ? "Including family rides" : "Thrill rides focus",
    };
  }, [
    countriesVisited,
    filteredUniqueRides.length,
    includeFamilyRides,
    parksVisited,
    personalRecords.fastest,
    personalRecords.longest,
    personalRecords.mostInversions,
    personalRecords.mostRidden,
    personalRecords.tallest,
    shareDisplayName,
    totalRides,
    units,
    unlockedAchievements.length,
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <AuthGate>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {!loading && !friendAccessDenied ? (
                <ProfileAvatar
                  avatarKey={profileAvatarKey}
                  imageUrl={profileAvatarUrl}
                  name={shareDisplayName}
                  size="lg"
                  title={shareDisplayName ? `${shareDisplayName}'s photo` : "Profile photo"}
                />
              ) : null}
              <div>
              <AppPageHeading>
                {isOwnStatsView ? "My stats" : `${shareDisplayName ?? "Friend"}'s stats`}
              </AppPageHeading>
              {!isOwnStatsView && (
                <p className="mt-1 text-sm text-slate-500">
                  {viewingPublicProfile
                    ? "This profile is public, so signed-in users can see ride stats and photos."
                    : "Viewing a friend profile from your accepted friends list."}
                </p>
              )}
              {!loading && !friendAccessDenied && (
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p>
                    <span className="font-medium text-slate-800">Favorite ride:</span>{" "}
                    {favoriteRideLabel}
                  </p>
                  <p>
                    <span className="font-medium text-slate-800">Favorite park:</span>{" "}
                    {favoriteParkLabel}
                  </p>
                </div>
              )}
              </div>
            </div>
            {!loading && isOwnStatsView && filteredUniqueRides.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <StatsShareControls
                  card={shareCardProps}
                  onFeedback={setShareFeedback}
                />
                <button
                  type="button"
                  onClick={() => void copyStatsSummary()}
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Copy text
                </button>
              </div>
            )}
          </div>
          {shareFeedback && (
            <p className="mb-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">{shareFeedback}</p>
          )}
          {fetchError && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              Something went wrong loading your data. Please refresh the page.
            </p>
          )}
          {friendAccessDenied && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {shareDisplayName
                ? `${shareDisplayName} keeps their stats private.`
                : "This profile is private or could not be found. You can view stats for accepted friends, or for users who have made their profile public."}
            </p>
          )}
          {!friendAccessDenied && (
            <>
              {viewingOther && requestedUserId && (
                <nav
                  className="mb-4 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
                  aria-label="Stats views"
                >
                  <Link
                    href={`/stats?user=${encodeURIComponent(requestedUserId)}`}
                    scroll={false}
                    aria-current={!compareMode ? "page" : undefined}
                    className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                      compareMode
                        ? "text-slate-600 hover:bg-slate-50"
                        : "bg-amber-100 text-slate-900"
                    }`}
                  >
                    Stats
                  </Link>
                  <Link
                    href={`/stats?user=${encodeURIComponent(requestedUserId)}&compare=1`}
                    scroll={false}
                    aria-current={compareMode ? "page" : undefined}
                    className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                      compareMode
                        ? "bg-amber-100 text-slate-900"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Compare
                  </Link>
                </nav>
              )}
              {viewingOther && !friendAccessDenied && userId && !loading ? (
                <div hidden={!compareMode} className={compareMode ? "mb-4" : undefined}>
                  <StatsComparePanel
                    myUserId={userId}
                    theirName={shareDisplayName ?? "Friend"}
                    theirCredits={theirCompareCredits}
                    includeFamilyRides={includeFamilyRides}
                    onIncludeFamilyRidesChange={setIncludeFamilyRides}
                  />
                </div>
              ) : compareMode ? (
                <p className="mb-4 text-sm text-slate-500">Loading comparison…</p>
              ) : null}
              {!compareMode && (
            <>
              {!loading && uniqueRides.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium text-slate-700">Ride filters</p>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={includeFamilyRides}
                      onChange={(e) => setIncludeFamilyRides(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-400"
                    />
                    Include kiddie / family-style rides
                  </label>
                </div>
              )}

              {/* Credits list — first so users can rate or log more rides */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-3 font-semibold text-slate-900">Coaster credits</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading&hellip;</p>
                ) : filteredUniqueRides.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {isOwnStatsView ? (
                      <>
                        No rides logged yet. Mark rides as ridden from the map or your{" "}
                        <Link href="/wishlist" className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800">
                          wishlist
                        </Link>
                        .
                      </>
                    ) : (
                      "No rides logged yet."
                    )}
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      {filteredUniqueRides.length > 3 && (
                        <input
                          type="search"
                          value={rideFilter}
                          onChange={(e) => setRideFilter(e.target.value)}
                          placeholder="Filter rides…"
                          aria-label="Filter rides"
                          className="min-w-0 w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                        <select
                          value={rideCountFilter}
                          onChange={(e) => setRideCountFilter(e.target.value as RideCountFilter)}
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 sm:w-auto"
                          aria-label="Filter by times ridden"
                        >
                          <option value="any">Any count</option>
                          <option value="1">Ridden once</option>
                          <option value="2+">2+ times</option>
                          <option value="3+">3+ times</option>
                          <option value="5+">5+ times</option>
                          <option value="10+">10+ times</option>
                        </select>
                        <select
                          value={rideSort}
                          onChange={(e) => setRideSort(e.target.value as RideSort)}
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 sm:w-auto"
                          aria-label="Sort rides"
                        >
                          <option value="name">Sort: Name</option>
                          <option value="rating">Sort: Rating</option>
                          <option value="recent">Sort: Recent</option>
                          <option value="rides">Sort: Times ridden</option>
                        </select>
                      </div>
                    </div>
                    {(rideCountFilter !== "any" || rideFilter.trim()) && (
                      <p className="mb-2 text-xs text-slate-500">
                        {filteredRides.length === 1
                          ? "1 match"
                          : `${filteredRides.length.toLocaleString()} matches`}
                      </p>
                    )}
                    <ul
                      ref={rideListRef}
                      onScroll={(event) => {
                        const nextTop = event.currentTarget.scrollTop;
                        if (rideListRafRef.current != null) return;
                        rideListRafRef.current = window.requestAnimationFrame(() => {
                          setRideListScrollTop(nextTop);
                          rideListRafRef.current = null;
                        });
                      }}
                      className="max-h-[min(50vh,22rem)] overflow-y-auto overflow-x-hidden overscroll-contain pb-1 [scrollbar-gutter:stable]"
                    >
                      {filteredRides.length === 0 && (
                        <li className="py-2 text-xs text-slate-400">No matches</li>
                      )}
                      {virtualizedRideRows.topSpacerHeight > 0 && (
                        <li
                          aria-hidden
                          style={{ height: `${virtualizedRideRows.topSpacerHeight}px` }}
                        />
                      )}
                      {virtualizedRideRows.rows.map((ride) => {
                        return (
                          <RiddenRideRow
                            key={ride.coaster_id}
                            ride={ride}
                            selected={selectedCoasterId === ride.coaster_id}
                            canEdit={isOwnStatsView}
                            onOpen={openRideSheet}
                          />
                        );
                      })}
                      {virtualizedRideRows.bottomSpacerHeight > 0 && (
                        <li
                          aria-hidden
                          style={{ height: `${virtualizedRideRows.bottomSpacerHeight}px` }}
                        />
                      )}
                    </ul>
                    {filteredRides.length > displayedRides.length && (
                      <div className="mt-3 flex justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleRideCount((count) =>
                              Math.min(count + LOAD_MORE_RIDES_STEP, filteredRides.length),
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Load more rides
                        </button>
                      </div>
                    )}
                    <RiddenRideSheet
                      ride={selectedRide}
                      open={selectedRide != null}
                      canEdit={isOwnStatsView}
                      savingRating={savingRating}
                      removing={removing === selectedRide?.coaster_id}
                      loggingRide={loggingRide}
                      ownerUserId={isOwnStatsView ? userId : null}
                      onClose={closeRideSheet}
                      onRate={rateRide}
                      onRemove={removeRide}
                      onAddRide={isOwnStatsView ? addRide : undefined}
                      onPhotoChange={isOwnStatsView ? applyPhotoChange : undefined}
                      onHistoryChanged={
                        isOwnStatsView && selectedRide
                          ? (summary) => applyHistoryChange(selectedRide.coaster_id, summary)
                          : undefined
                      }
                    />
                  </>
                )}
              </section>

              <h2 className="mt-6 mb-3 font-semibold text-slate-900">Overall stats</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statCards.map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">
                      {loading ? <span className="text-slate-300">&mdash;</span> : value}
                    </p>
                  </div>
                ))}
              </div>

          {/* Personal records */}
          {(loading || hasAnyRecord) && (
            <div className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Personal records</h2>
                <UnitsToggle units={units} onChange={setUnits} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
                {(
                  [
                    {
                      key: "longest",
                      label: "Longest",
                      record: personalRecords.longest,
                      format: (v: number) => fmtLength(v, units) ?? `${v.toLocaleString()} ft`,
                      icon: (
                        // arrows-right-left: horizontal span / track length
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z" clipRule="evenodd" />
                        </svg>
                      ),
                    },
                    {
                      key: "tallest",
                      label: "Tallest",
                      record: personalRecords.tallest,
                      format: (v: number) => fmtHeight(v, units) ?? `${v} ft`,
                      icon: (
                        // arrow-up: height
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                        </svg>
                      ),
                    },
                    {
                      key: "fastest",
                      label: "Fastest",
                      record: personalRecords.fastest,
                      format: (v: number) => fmtSpeed(v, units) ?? `${v} mph`,
                      icon: (
                        // speedometer: dial ring + needle + hub
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 13A8 8 0 1 1 18 13L15.5 13A5.5 5.5 0 1 0 4.5 13Z" />
                          <path d="M9.5 12.5 10.5 13.5 14.5 9.5Z" />
                          <circle cx="10" cy="13" r="1.2" />
                        </svg>
                      ),
                    },
                    {
                      key: "mostInversions",
                      label: "Most inversions",
                      record: personalRecords.mostInversions,
                      format: (v: number) => `${v}`,
                      icon: (
                        // arrow-path: full 360° loop — inversions
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                        </svg>
                      ),
                    },
                    {
                      key: "longestDuration",
                      label: "Longest ride",
                      record: personalRecords.longestDuration,
                      format: (v: number) => fmtDuration(v) ?? `${v}s`,
                      icon: (
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5.69l3.22 3.22a.75.75 0 101.06-1.06l-2.78-2.78V5z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ),
                    },
                    {
                      key: "mostRidden",
                      label: "Most ridden",
                      record: personalRecords.mostRidden,
                      format: (v: number) => formatRideCount(v),
                      icon: (
                        // square-2-stack: the same ride, logged more than once
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path d="M2 4.25A2.25 2.25 0 014.25 2h6.5A2.25 2.25 0 0113 4.25V5.5H9.25A3.75 3.75 0 005.5 9.25V13H4.25A2.25 2.25 0 012 10.75v-6.5z" />
                          <path d="M9.25 7A2.25 2.25 0 007 9.25v6.5A2.25 2.25 0 009.25 18h6.5A2.25 2.25 0 0018 15.75v-6.5A2.25 2.25 0 0015.75 7h-6.5z" />
                        </svg>
                      ),
                    },
                  ] as const
                ).map(({ key, label, record, format, icon }) => (
                  <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex items-center gap-2 text-amber-500">
                      {icon}
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
                    </div>
                    {loading ? (
                      <p className="mt-2 text-slate-300">&mdash;</p>
                    ) : record ? (
                      <>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{format(record.value)}</p>
                        <p className="mt-0.5 text-xs font-medium leading-snug text-slate-700 break-words">
                          {record.name}
                        </p>
                        {record.park && (
                          <p className="mt-0.5 text-xs leading-snug text-slate-400 break-words">{record.park}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-400">—</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

              {/* Top parks and countries */}
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
              {/* Top parks */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-3 font-semibold text-slate-900">Top parks</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading&hellip;</p>
                ) : topParks.length === 0 ? (
                  <p className="text-sm text-slate-500">No rides logged yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {topParks.map(([name, count], i) => (
                      <li key={name} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                            {i + 1}
                          </span>
                          <span className="truncate text-sm text-slate-700">{name}</span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-900">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Countries visited */}
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="mb-3 font-semibold text-slate-900">Countries visited</h2>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading&hellip;</p>
                ) : countriesWithRideCounts.length === 0 ? (
                  <p className="text-sm text-slate-500">No country data for your rides yet.</p>
                ) : (
                  <ul className="max-h-[min(40vh,14rem)] space-y-2.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                    {countriesWithRideCounts.map(([country, count]) => (
                      <li key={country} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-slate-700">{country}</span>
                        <span className="shrink-0 text-sm tabular-nums text-slate-500">
                          {count} {count === 1 ? "ride" : "rides"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              </div>

          {/* Own stats: count snippet → full list lives on /achievements.
              Friends: show unlocked badges only (no other place to see them). */}
          {isOwnStatsView ? (
            (loading || uniqueRides.length > 0 || friendCount > 0) && (
              <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">Achievements</h2>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                      {loading ? (
                        <span className="text-slate-300">&mdash;</span>
                      ) : (
                        <>
                          {unlockedAchievements.length}
                          <span className="text-lg font-semibold text-slate-400">
                            {" "}
                            / {ACHIEVEMENT_COUNT}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">unlocked</p>
                  </div>
                  <Link
                    href="/achievements"
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
                  >
                    View all
                  </Link>
                </div>
              </section>
            )
          ) : (
            (loading || unlockedAchievements.length > 0 || uniqueRides.length > 0) && (
              <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-3">
                  <h2 className="font-semibold text-slate-900">Unlocked achievements</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {loading
                      ? "Loading…"
                      : `${unlockedAchievements.length} / ${ACHIEVEMENT_COUNT} unlocked · Locked progress stays private`}
                  </p>
                </div>
                {loading ? (
                  <p className="text-sm text-slate-400">&mdash;</p>
                ) : unlockedAchievements.length === 0 ? (
                  <p className="text-sm text-slate-500">No unlocked achievements to show yet.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {unlockedAchievements.map((a) => (
                      <li
                        key={a.id}
                        className={`rounded-lg border px-3 py-2.5 ${achievementRarityCardClass(a.rarity)}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{a.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{a.description}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${achievementRarityPillClass(a.rarity)}`}
                          >
                            {achievementRarityLabel(a.rarity)}
                          </span>
                        </div>
                        {a.unlockedAt ? (
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            Unlocked{" "}
                            {new Date(a.unlockedAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          )}
            </>
              )}
            </>
          )}
        </AuthGate>
      </main>
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50">
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <p className="text-sm text-slate-500">Loading stats…</p>
          </main>
        </div>
      }
    >
      <StatsPageContent />
    </Suspense>
  );
}
