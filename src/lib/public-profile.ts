import { getSupabaseServerClient } from "@/lib/supabase-server";
import { signAvatarUrls } from "@/lib/profile-photos";
import { SITE_URL, siteHref } from "@/lib/site-url";

export type PublicProfileSummary = {
  userId: string;
  displayName: string;
  countryCode: string | null;
  avatarKey: string | null;
  avatarUrl: string | null;
  favoriteRideName: string | null;
  favoriteParkName: string | null;
  uniqueCredits: number;
  totalRides: number;
  parksVisited: number;
};

/** Path segment for /u/[username] — encode spaces and punctuation. */
export function publicProfilePath(displayName: string): string {
  return `/u/${encodeURIComponent(displayName.trim())}`;
}

export function publicProfileHref(displayName: string, origin: string = SITE_URL): string {
  return siteHref(publicProfilePath(displayName), origin);
}

export function invitePath(userId: string): string {
  return `/invite/${encodeURIComponent(userId)}`;
}

export function inviteHref(userId: string, origin: string = SITE_URL): string {
  return siteHref(invitePath(userId), origin);
}

/** Escape `%` `_` `\` so ilike is an exact case-insensitive match. */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function getPublicProfileByDisplayName(
  username: string,
): Promise<PublicProfileSummary | null> {
  const trimmed = username.trim();
  if (!trimmed || trimmed.length > 24) return null;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: rows, error } = await supabase
    .from("profiles")
    .select(
      "user_id, display_name, country_code, avatar_key, avatar_path, favorite_ride_id, favorite_park_id, stats_visibility, banned_at",
    )
    .eq("stats_visibility", "public")
    .is("banned_at", null)
    .not("display_name", "is", null)
    .ilike("display_name", escapeIlikeExact(trimmed))
    .limit(8);

  if (error || !rows?.length) return null;

  const profile = rows.find(
    (row) => (row.display_name as string)?.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (!profile?.display_name || !profile.user_id) return null;

  const userId = profile.user_id as string;
  const displayName = (profile.display_name as string).trim();

  const [{ data: summaries }, favRide, favPark, avatarMap] = await Promise.all([
    supabase
      .from("ride_credit_summaries")
      .select("coaster_id, total_rides")
      .eq("user_id", userId),
    profile.favorite_ride_id
      ? supabase
          .from("coasters")
          .select("name")
          .eq("id", profile.favorite_ride_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profile.favorite_park_id
      ? supabase
          .from("parks")
          .select("name")
          .eq("id", profile.favorite_park_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    signAvatarUrls(supabase, [profile.avatar_path as string | null]),
  ]);

  const rideList = summaries ?? [];
  const uniqueCredits = rideList.length;
  const totalRides = rideList.reduce(
    (sum, row) => sum + Math.max(1, Number(row.total_rides) || 1),
    0,
  );

  let parksVisited = 0;
  if (rideList.length > 0) {
    const coasterIds = rideList.map((r) => r.coaster_id as number);
    const { data: coasters } = await supabase
      .from("coasters")
      .select("park_id")
      .in("id", coasterIds);
    parksVisited = new Set((coasters ?? []).map((c) => c.park_id).filter(Boolean)).size;
  }

  return {
    userId,
    displayName,
    countryCode: (profile.country_code as string | null) ?? null,
    avatarKey: (profile.avatar_key as string | null) ?? null,
    avatarUrl: profile.avatar_path
      ? (avatarMap.get(profile.avatar_path as string) ?? null)
      : null,
    favoriteRideName: favRide.data?.name?.trim() || null,
    favoriteParkName: favPark.data?.name?.trim() || null,
    uniqueCredits,
    totalRides,
    parksVisited,
  };
}

export async function getPublicProfileByUserId(
  userId: string,
): Promise<Pick<PublicProfileSummary, "userId" | "displayName"> | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("profiles")
    .select("user_id, display_name, stats_visibility, banned_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.display_name || data.banned_at) return null;
  // Invites work even if stats are friends/private — only name is shown on invite page.
  return {
    userId: data.user_id as string,
    displayName: (data.display_name as string).trim(),
  };
}

/** Lightweight public profile count for sitemap (cap to keep crawl small). */
export async function listPublicProfilesForSitemap(limit = 100): Promise<
  Array<{ displayName: string; updatedAt: string | null }>
> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("profiles")
    .select("display_name, updated_at")
    .eq("stats_visibility", "public")
    .is("banned_at", null)
    .not("display_name", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  return (data ?? [])
    .map((row) => ({
      displayName: (row.display_name as string | null)?.trim() ?? "",
      updatedAt: (row.updated_at as string | null) ?? null,
    }))
    .filter((row) => row.displayName.length > 0);
}

export async function countRegisteredProfiles(): Promise<number | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { count, error } = await supabase
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .is("banned_at", null)
    .not("display_name", "is", null);

  if (error) return null;
  return count ?? 0;
}
