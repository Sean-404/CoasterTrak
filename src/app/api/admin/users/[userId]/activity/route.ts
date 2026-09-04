import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { AVATAR_BUCKET, AVATAR_SIGNED_TTL_SECONDS, parseAvatarPath } from "@/lib/profile-photos";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

export const runtime = "nodejs";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  avatar_path: string | null;
  stats_visibility: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  favorite_ride_id: number | null;
  favorite_park_id: number | null;
  updated_at: string | null;
};

type RideRow = {
  coaster_id: number;
  rating: number | null;
  ridden_at: string | null;
  coasters: {
    park_id: number | null;
    name: string | null;
    coaster_type: string | null;
    manufacturer: string | null;
    status: string | null;
    parks: { name: string | null; country: string | null } | null;
  } | null;
};

type SummaryRow = {
  coaster_id: number;
  total_rides: number | null;
  first_ridden_on: string | null;
  last_ridden_on: string | null;
};

export type AdminUserRide = {
  coasterId: number;
  name: string;
  parkId: number | null;
  parkName: string | null;
  country: string | null;
  coasterType: string | null;
  manufacturer: string | null;
  status: string | null;
  rating: number | null;
  riddenAt: string | null;
  totalRides: number;
  firstRiddenOn: string | null;
  lastRiddenOn: string | null;
};

export type AdminUserActivityResponse = {
  user: {
    userId: string;
    email: string | null;
    displayName: string | null;
    countryCode: string | null;
    avatarKey: string | null;
    avatarUrl: string | null;
    statsVisibility: string | null;
    bannedAt: string | null;
    banReason: string | null;
    authBanned: boolean;
    createdAt: string | null;
    lastSignInAt: string | null;
  };
  stats: {
    uniqueCredits: number;
    totalRides: number;
    parks: number;
    countries: number;
    wishlist: number;
    datedEvents: number;
  };
  rides: AdminUserRide[];
};

function isAuthBanned(bannedUntil?: string | null): boolean {
  if (!bannedUntil) return false;
  const until = Date.parse(bannedUntil);
  return Number.isFinite(until) && until > Date.now();
}

function sortRides(a: AdminUserRide, b: AdminUserRide): number {
  const aDate = a.lastRiddenOn ?? a.riddenAt ?? "";
  const bDate = b.lastRiddenOn ?? b.riddenAt ?? "";
  if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return a.name.localeCompare(b.name);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const { userId } = await context.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId,
    )
  ) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const { data: authData, error: authError } = await ctx.service.auth.admin.getUserById(userId);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const authUser: User = authData.user;

  const [profileRes, ridesRes, summariesRes, wishlistRes, eventsRes] = await Promise.all([
    ctx.service
      .from("profiles")
      .select(
        "user_id, display_name, country_code, avatar_key, avatar_path, stats_visibility, banned_at, ban_reason, favorite_ride_id, favorite_park_id, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    fetchAllPages<RideRow>(SUPABASE_PAGE_SIZE, (from, to) =>
      ctx.service
        .from("rides")
        .select(
          "coaster_id, rating, ridden_at, coasters(park_id, name, coaster_type, manufacturer, status, parks(name, country))",
        )
        .eq("user_id", userId)
        .order("coaster_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<SummaryRow>(SUPABASE_PAGE_SIZE, (from, to) =>
      ctx.service
        .from("ride_credit_summaries")
        .select("coaster_id, total_rides, first_ridden_on, last_ridden_on")
        .eq("user_id", userId)
        .order("coaster_id", { ascending: true })
        .range(from, to),
    ),
    ctx.service
      .from("wishlist")
      .select("coaster_id", { count: "exact", head: true })
      .eq("user_id", userId),
    ctx.service
      .from("ride_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("ridden_on", "is", null),
  ]);

  if (ridesRes.error) {
    return NextResponse.json({ error: "Could not load rides." }, { status: 500 });
  }

  const profile = (profileRes.data as ProfileRow | null) ?? null;
  let avatarUrl: string | null = null;
  if (profile?.avatar_path && parseAvatarPath(profile.avatar_path)) {
    const { data: signed } = await ctx.service.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(profile.avatar_path, AVATAR_SIGNED_TTL_SECONDS);
    avatarUrl = signed?.signedUrl ?? null;
  }

  const summaryByCoaster = new Map(
    (summariesRes.data ?? []).map((row) => [
      row.coaster_id,
      {
        totalRides: Math.max(1, row.total_rides ?? 1),
        firstRiddenOn: row.first_ridden_on,
        lastRiddenOn: row.last_ridden_on,
      },
    ]),
  );

  const parks = new Set<string>();
  const countries = new Set<string>();
  let totalRides = 0;

  const rides: AdminUserRide[] = (ridesRes.data ?? []).map((row) => {
    const fixed = row.coasters ? applyCoasterKnownFixes(row.coasters) : null;
    const parkName = fixed?.parks?.name?.trim() || null;
    const country = fixed?.parks?.country?.trim() || null;
    if (parkName) parks.add(parkName);
    if (country) countries.add(country);
    const summary = summaryByCoaster.get(row.coaster_id);
    const quantity = summary?.totalRides ?? 1;
    totalRides += quantity;
    return {
      coasterId: row.coaster_id,
      name: fixed?.name?.trim() || `Coaster #${row.coaster_id}`,
      parkId: fixed?.park_id ?? null,
      parkName,
      country,
      coasterType: fixed?.coaster_type ?? null,
      manufacturer: fixed?.manufacturer ?? null,
      status: fixed?.status ?? null,
      rating: typeof row.rating === "number" ? row.rating : null,
      riddenAt: row.ridden_at,
      totalRides: quantity,
      firstRiddenOn: summary?.firstRiddenOn ?? null,
      lastRiddenOn: summary?.lastRiddenOn ?? null,
    };
  });

  rides.sort(sortRides);

  const payload: AdminUserActivityResponse = {
    user: {
      userId,
      email: authUser.email ?? null,
      displayName: profile?.display_name ?? null,
      countryCode: profile?.country_code ?? null,
      avatarKey: profile?.avatar_key ?? null,
      avatarUrl,
      statsVisibility: profile?.stats_visibility ?? null,
      bannedAt: profile?.banned_at ?? null,
      banReason: profile?.ban_reason ?? null,
      authBanned: isAuthBanned(authUser.banned_until),
      createdAt: authUser.created_at ?? null,
      lastSignInAt: authUser.last_sign_in_at ?? null,
    },
    stats: {
      uniqueCredits: rides.length,
      totalRides,
      parks: parks.size,
      countries: countries.size,
      wishlist: wishlistRes.count ?? 0,
      datedEvents: eventsRes.count ?? 0,
    },
    rides,
  };

  return NextResponse.json(payload);
}
