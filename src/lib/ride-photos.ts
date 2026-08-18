import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareJpegImage } from "@/lib/image-prepare";

export const RIDE_PHOTO_BUCKET = "ride-photos";
export const RIDE_PHOTO_MAX_EDGE = 1280;
export const RIDE_PHOTO_MAX_BYTES = 1_800_000;
export const RIDE_PHOTO_THUMB_EDGE = 96;
export const RIDE_PHOTO_THUMB_MAX_BYTES = 40_000;
export const RIDE_PHOTO_SIGNED_TTL_SECONDS = 60 * 60 * 4;
export const RIDE_PHOTO_CACHE_CONTROL = "604800";
export const RIDE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/*";
export const RIDE_PHOTO_THUMB_TRANSFORM = {
  width: RIDE_PHOTO_THUMB_EDGE,
  height: RIDE_PHOTO_THUMB_EDGE,
  resize: "cover" as const,
  quality: 60,
};

export type SignedRidePhoto = {
  fullUrl: string;
  thumbUrl: string;
};

type CachedSignedRidePhoto = SignedRidePhoto & { expiresAt: number };

const SIGNED_PHOTO_CACHE = new Map<string, CachedSignedRidePhoto>();
const SIGNED_PHOTO_CACHE_SKEW_MS = 2 * 60 * 1000;
let transformSupportPromise: Promise<boolean> | null = null;

const PHOTO_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)\.jpg$/i;

export type StatsVisibility = "private" | "friends" | "public";

export function isStatsVisibility(value: unknown): value is StatsVisibility {
  return value === "private" || value === "friends" || value === "public";
}

export function canViewOtherUserStats(visibility: unknown, isFriend: boolean): boolean {
  if (!isStatsVisibility(visibility)) return false;
  if (visibility === "public") return true;
  return visibility === "friends" && isFriend;
}

export function ridePhotoObjectPath(userId: string, coasterId: number): string {
  return `${userId}/${coasterId}.jpg`;
}

export function ridePhotoThumbPath(userId: string, coasterId: number): string {
  return `${userId}/${coasterId}.thumb.jpg`;
}

export function ridePhotoThumbPathFor(path: string | null | undefined): string | null {
  const parsed = parseRidePhotoPath(path);
  return parsed ? ridePhotoThumbPath(parsed.userId, parsed.coasterId) : null;
}

export function parseRidePhotoPath(
  path: string | null | undefined,
): { userId: string; coasterId: number } | null {
  if (!path) return null;
  const match = PHOTO_PATH_RE.exec(path.trim());
  if (!match) return null;
  const coasterId = Number(match[2]);
  if (!Number.isInteger(coasterId) || coasterId <= 0) return null;
  return { userId: match[1].toLowerCase(), coasterId };
}

export function friendlyRidePhotoError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("not allowed") || lower.includes("unauthorized")) {
    return "Could not save that photo. Please sign in and try again.";
  }
  if (lower.includes("maximum allowed size") || lower.includes("payload too large") || lower.includes("too large")) {
    return "That photo is too large. Try a smaller JPEG or PNG.";
  }
  if (lower.includes("mime") || lower.includes("invalid") || lower.includes("not supported")) {
    return "Use a JPEG, PNG, or WebP photo.";
  }
  return message || "Could not save that photo. Please try again.";
}

export async function prepareRidePhoto(
  file: File,
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  return prepareJpegImage(file, {
    maxEdge: RIDE_PHOTO_MAX_EDGE,
    maxBytes: RIDE_PHOTO_MAX_BYTES,
  });
}

async function signStoragePaths(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { data, error } = await supabase.storage
      .from(RIDE_PHOTO_BUCKET)
      .createSignedUrls(chunk, RIDE_PHOTO_SIGNED_TTL_SECONDS);
    if (error || !data) continue;
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) {
        signed.set(row.path, row.signedUrl);
      }
    }
  }
  return signed;
}

async function ridePhotoTransformsSupported(
  supabase: SupabaseClient,
  samplePath: string,
): Promise<boolean> {
  if (!transformSupportPromise) {
    transformSupportPromise = (async () => {
      const { data } = await supabase.storage.from(RIDE_PHOTO_BUCKET).createSignedUrl(samplePath, 120, {
        transform: RIDE_PHOTO_THUMB_TRANSFORM,
      });
      if (!data?.signedUrl) return false;
      try {
        const res = await fetch(data.signedUrl, { method: "GET", cache: "no-store" });
        return res.ok && (res.headers.get("content-type") || "").startsWith("image/");
      } catch {
        transformSupportPromise = null;
        return false;
      }
    })();
  }
  return transformSupportPromise;
}

async function signTransformedThumbUrls(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const chunkSize = 20;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const rows = await Promise.all(
      chunk.map(async (path) => {
        const { data, error } = await supabase.storage
          .from(RIDE_PHOTO_BUCKET)
          .createSignedUrl(path, RIDE_PHOTO_SIGNED_TTL_SECONDS, { transform: RIDE_PHOTO_THUMB_TRANSFORM });
        return { path, url: !error && data?.signedUrl ? data.signedUrl : null };
      }),
    );
    for (const row of rows) {
      if (row.url) signed.set(row.path, row.url);
    }
  }
  return signed;
}

function cachedRidePhoto(path: string): SignedRidePhoto | null {
  const hit = SIGNED_PHOTO_CACHE.get(path);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) SIGNED_PHOTO_CACHE.delete(path);
    return null;
  }
  return { fullUrl: hit.fullUrl, thumbUrl: hit.thumbUrl };
}

function rememberRidePhoto(path: string, value: SignedRidePhoto) {
  SIGNED_PHOTO_CACHE.set(path, {
    ...value,
    expiresAt: Date.now() + RIDE_PHOTO_SIGNED_TTL_SECONDS * 1000 - SIGNED_PHOTO_CACHE_SKEW_MS,
  });
}

export async function signRidePhotoUrls(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const signed = await signRidePhotoVariants(supabase, paths);
  return new Map([...signed.entries()].map(([path, urls]) => [path, urls.fullUrl]));
}

export async function signRidePhotoVariants(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
): Promise<Map<string, SignedRidePhoto>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(parseRidePhotoPath(path))))];
  const result = new Map<string, SignedRidePhoto>();
  const missing: string[] = [];
  for (const path of unique) {
    const cached = cachedRidePhoto(path);
    if (cached) result.set(path, cached);
    else missing.push(path);
  }
  if (missing.length === 0) return result;

  const thumbPaths = missing
    .map((path) => ({ path, thumbPath: ridePhotoThumbPathFor(path) }))
    .filter((row): row is { path: string; thumbPath: string } => Boolean(row.thumbPath));

  const [fullSigned, storedThumbs] = await Promise.all([
    signStoragePaths(supabase, missing),
    signStoragePaths(
      supabase,
      thumbPaths.map((row) => row.thumbPath),
    ),
  ]);

  const needsTransform = thumbPaths
    .filter((row) => !storedThumbs.has(row.thumbPath))
    .map((row) => row.path);
  let transformed = new Map<string, string>();
  if (needsTransform.length > 0 && (await ridePhotoTransformsSupported(supabase, needsTransform[0]!))) {
    transformed = await signTransformedThumbUrls(supabase, needsTransform);
  }

  for (const path of missing) {
    const fullUrl = fullSigned.get(path);
    if (!fullUrl) continue;
    const thumbPath = ridePhotoThumbPathFor(path);
    const thumbUrl =
      (thumbPath ? storedThumbs.get(thumbPath) : undefined) || transformed.get(path) || fullUrl;
    const value = { fullUrl, thumbUrl };
    rememberRidePhoto(path, value);
    result.set(path, value);
  }
  return result;
}

export async function uploadRidePhoto(
  supabase: SupabaseClient,
  userId: string,
  coasterId: number,
  file: File,
): Promise<
  | { ok: true; photoPath: string; photoUrl: string; photoThumbUrl: string }
  | { ok: false; message: string }
> {
  const prepared = await prepareRidePhoto(file);
  if (!prepared.ok) return prepared;

  const thumbPrepared = await prepareJpegImage(file, {
    maxEdge: RIDE_PHOTO_THUMB_EDGE,
    maxBytes: RIDE_PHOTO_THUMB_MAX_BYTES,
    square: true,
  });

  const photoPath = ridePhotoObjectPath(userId, coasterId);
  const thumbPath = ridePhotoThumbPath(userId, coasterId);
  const { error: uploadError } = await supabase.storage.from(RIDE_PHOTO_BUCKET).upload(photoPath, prepared.blob, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: RIDE_PHOTO_CACHE_CONTROL,
  });
  if (uploadError) {
    return { ok: false, message: friendlyRidePhotoError(uploadError.message) };
  }
  if (thumbPrepared.ok) {
    await supabase.storage.from(RIDE_PHOTO_BUCKET).upload(thumbPath, thumbPrepared.blob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: RIDE_PHOTO_CACHE_CONTROL,
    });
  }

  const { error: updateError } = await supabase
    .from("rides")
    .update({ photo_path: photoPath })
    .eq("user_id", userId)
    .eq("coaster_id", coasterId);
  if (updateError) {
    return { ok: false, message: friendlyRidePhotoError(updateError.message) };
  }

  SIGNED_PHOTO_CACHE.delete(photoPath);
  const signed = await signRidePhotoVariants(supabase, [photoPath]);
  const urls = signed.get(photoPath);
  return {
    ok: true,
    photoPath,
    photoUrl: urls?.fullUrl ?? "",
    photoThumbUrl: urls?.thumbUrl ?? urls?.fullUrl ?? "",
  };
}

export async function removeRidePhoto(
  supabase: SupabaseClient,
  userId: string,
  coasterId: number,
  photoPath?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = parseRidePhotoPath(photoPath)?.userId === userId ? photoPath! : ridePhotoObjectPath(userId, coasterId);
  const { error: updateError } = await supabase
    .from("rides")
    .update({ photo_path: null })
    .eq("user_id", userId)
    .eq("coaster_id", coasterId);
  if (updateError) {
    return { ok: false, message: friendlyRidePhotoError(updateError.message) };
  }
  const thumbPath = ridePhotoThumbPathFor(path);
  SIGNED_PHOTO_CACHE.delete(path);
  await supabase.storage.from(RIDE_PHOTO_BUCKET).remove(thumbPath ? [path, thumbPath] : [path]);
  return { ok: true };
}
