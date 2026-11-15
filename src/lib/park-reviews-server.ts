import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getParkById } from "@/lib/catalog-server";
import { parkNote, PARK_NOTES } from "@/lib/catalog-notes";
import {
  PARK_REVIEWS_INDEX_MIN,
  isParkReviewStatus,
  reviewAuthorName,
  type OwnParkReview,
  type ProfileParkReview,
  type PublicParkReview,
  type ReviewerTrackRecord,
} from "@/lib/park-reviews";
import { parkSlug } from "@/lib/slug";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Bust with `revalidateParkReviews` after a review is approved, hidden or deleted. */
export const PARK_REVIEWS_CACHE_TAG = "park-reviews";

type ReviewRow = {
  id: number;
  user_id: string;
  park_id: number;
  rating: number | null;
  body: string;
  visited_year: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  moderated_at: string | null;
  moderated_by: string | null;
};

type ProfileRow = { user_id: string; display_name: string | null; banned_at: string | null };

const REVIEW_COLUMNS =
  "id,user_id,park_id,rating,body,visited_year,status,created_at,updated_at,moderated_at,moderated_by";

/** Display names and bans for a set of users, keyed by user id. */
export async function loadReviewAuthors(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await service
    .from("profiles")
    .select("user_id,display_name,banned_at")
    .in("user_id", unique);
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.user_id, row]));
}

const getApprovedReviewRowsCached = unstable_cache(
  async (): Promise<PublicParkReviewWithPark[]> => {
    const service = getSupabaseServerClient();
    if (!service) return [];
    const { data, error } = await service
      .from("park_reviews")
      .select(REVIEW_COLUMNS)
      .eq("status", "approved")
      .order("moderated_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(`park_reviews read failed: ${error.message}`);
    const rows = (data ?? []) as ReviewRow[];
    const authors = await loadReviewAuthors(
      service,
      rows.map((r) => r.user_id),
    );
    return rows
      .filter((row) => !authors.get(row.user_id)?.banned_at)
      .map((row) => ({
        parkId: row.park_id,
        userId: row.user_id,
        id: row.id,
        authorName: reviewAuthorName(authors.get(row.user_id)?.display_name),
        rating: row.rating,
        body: row.body,
        visitedYear: row.visited_year,
        publishedAt: row.moderated_at ?? row.updated_at,
      }));
  },
  ["park-reviews-approved-v2"],
  // Moderation busts the tag; the weekly fallback matches the catalog caches.
  { revalidate: 604800, tags: [PARK_REVIEWS_CACHE_TAG] },
);

/** Server-only shape: parkId and userId never leave the server except as links. */
type PublicParkReviewWithPark = PublicParkReview & { parkId: number; userId: string };

/**
 * Every approved review, or null when they could not be loaded (e.g. the migration has not
 * been applied yet), in which case pages hide the reviews list rather than failing.
 */
async function getApprovedReviews(): Promise<PublicParkReviewWithPark[] | null> {
  try {
    return await getApprovedReviewRowsCached();
  } catch (error) {
    console.warn("[park-reviews]", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Approved reviews for one park, newest first; null when reviews are unavailable. */
export async function getApprovedReviewsForPark(parkId: number): Promise<PublicParkReview[] | null> {
  const all = await getApprovedReviews();
  if (!all) return null;
  return all
    .filter((r) => r.parkId === parkId)
    .map((r) => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      body: r.body,
      visitedYear: r.visitedYear,
      publishedAt: r.publishedAt,
    }));
}

/** Park name and page link for a review, resolved through the cached catalog. */
async function withPark<T extends { parkId: number }>(rows: T[]): Promise<Array<T & { parkName: string; parkHref: string | null }>> {
  const parks = new Map<number, Awaited<ReturnType<typeof getParkById>>>();
  for (const id of new Set(rows.map((r) => r.parkId))) parks.set(id, await getParkById(id));
  return rows.map((row) => {
    const park = parks.get(row.parkId);
    return {
      ...row,
      parkName: park?.name ?? "Unknown park",
      parkHref: park ? `/parks/${parkSlug(park.name, park.id)}` : null,
    };
  });
}

/** A member's approved reviews for their profile, newest first; null when reviews are unavailable. */
export async function getApprovedReviewsByUser(userId: string): Promise<ProfileParkReview[] | null> {
  const all = await getApprovedReviews();
  if (!all) return null;
  const mine = all
    .filter((r) => r.userId === userId)
    .map((r) => ({
      id: r.id,
      parkId: r.parkId,
      rating: r.rating,
      body: r.body,
      visitedYear: r.visitedYear,
      publishedAt: r.publishedAt,
      status: "approved" as const,
    }));
  return (await withPark(mine)).map((r) => ({
    id: r.id,
    parkName: r.parkName,
    parkHref: r.parkHref,
    rating: r.rating,
    body: r.body,
    visitedYear: r.visitedYear,
    publishedAt: r.publishedAt,
    status: r.status,
  }));
}

/** Every review the signed-in member wrote, in any status, for their own stats page. */
export async function getOwnReviews(service: SupabaseClient, userId: string): Promise<ProfileParkReview[]> {
  const { data, error } = await service
    .from("park_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`park_reviews read failed: ${error.message}`);
  const rows = ((data ?? []) as ReviewRow[]).map((row) => ({
    id: row.id,
    parkId: row.park_id,
    rating: row.rating,
    body: row.body,
    visitedYear: row.visited_year,
    publishedAt: row.status === "approved" ? (row.moderated_at ?? row.updated_at) : row.updated_at,
    status: isParkReviewStatus(row.status) ? row.status : ("pending" as const),
  }));
  return (await withPark(rows)).map((r) => ({
    id: r.id,
    parkName: r.parkName,
    parkHref: r.parkHref,
    rating: r.rating,
    body: r.body,
    visitedYear: r.visitedYear,
    publishedAt: r.publishedAt,
    status: r.status,
  }));
}

/** Approved review count per park id. */
export async function getApprovedReviewCounts(): Promise<Map<number, number>> {
  const all = (await getApprovedReviews()) ?? [];
  const counts = new Map<number, number>();
  for (const review of all) counts.set(review.parkId, (counts.get(review.parkId) ?? 0) + 1);
  return counts;
}

/**
 * Park pages with original content of their own (a hand-written note, or enough approved
 * member reviews). While catalog pages are blocked from crawlers, these are the park pages
 * robots.txt and the sitemap open back up.
 */
export async function listParksWithOriginalContent(): Promise<{ id: number; name: string }[]> {
  const counts = await getApprovedReviewCounts();
  const ids = new Set<number>(Object.keys(PARK_NOTES).map(Number));
  for (const [parkId, count] of counts) {
    if (count >= PARK_REVIEWS_INDEX_MIN) ids.add(parkId);
  }

  const parks: { id: number; name: string }[] = [];
  for (const id of ids) {
    if (!parkNote(id) && (counts.get(id) ?? 0) < PARK_REVIEWS_INDEX_MIN) continue;
    const park = await getParkById(id);
    if (park) parks.push({ id: park.id, name: park.name });
  }
  return parks.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * How a member's other reviews have fared, for the trusted-reviewer rule. The review being
 * saved is left out, so editing an approved review does not count it twice.
 */
export async function loadReviewerTrackRecord(
  service: SupabaseClient,
  userId: string,
  excludeParkId: number,
): Promise<ReviewerTrackRecord> {
  const base = () =>
    service
      .from("park_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("park_id", excludeParkId);
  const [approved, hidden, profile] = await Promise.all([
    base().eq("status", "approved").not("moderated_by", "is", null),
    service.from("park_reviews").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "hidden"),
    service.from("profiles").select("banned_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (approved.error) throw new Error(approved.error.message);
  if (hidden.error) throw new Error(hidden.error.message);
  return {
    moderatorApproved: approved.count ?? 0,
    hidden: hidden.count ?? 0,
    banned: Boolean((profile.data as { banned_at: string | null } | null)?.banned_at),
  };
}

export function toOwnParkReview(row: ReviewRow): OwnParkReview {
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    visitedYear: row.visited_year,
    status: isParkReviewStatus(row.status) ? row.status : "pending",
    updatedAt: row.updated_at,
  };
}

export async function loadOwnReview(
  service: SupabaseClient,
  userId: string,
  parkId: number,
): Promise<OwnParkReview | null> {
  const { data, error } = await service
    .from("park_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("park_id", parkId)
    .maybeSingle();
  if (error) throw new Error(`park_reviews read failed: ${error.message}`);
  return data ? toOwnParkReview(data as ReviewRow) : null;
}

/**
 * Refresh everything that shows approved reviews: the shared cache, the park page, and
 * robots.txt and the sitemap, whose park allow-list depends on review counts.
 */
export async function revalidateParkReviews(parkId: number): Promise<void> {
  revalidateTag(PARK_REVIEWS_CACHE_TAG, "max");
  revalidatePath("/robots.txt");
  revalidatePath("/sitemap.xml");
  const park = await getParkById(parkId);
  if (park) revalidatePath(`/parks/${parkSlug(park.name, park.id)}`);
}

/**
 * After a ban or unban: refresh the park pages that carry this member's approved reviews.
 * Never throws, so a missing migration cannot break the ban itself.
 */
export async function revalidateReviewsByUser(service: SupabaseClient, userId: string): Promise<void> {
  try {
    const { data, error } = await service
      .from("park_reviews")
      .select("park_id")
      .eq("user_id", userId)
      .eq("status", "approved");
    if (error) throw new Error(error.message);
    const parkIds = [...new Set(((data ?? []) as { park_id: number }[]).map((r) => r.park_id))];
    for (const parkId of parkIds) await revalidateParkReviews(parkId);
  } catch (error) {
    console.warn("[park-reviews] revalidate after ban", error instanceof Error ? error.message : error);
  }
}

export type { ReviewRow };
export { REVIEW_COLUMNS };
