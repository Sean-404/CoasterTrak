import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareJpegImage } from "@/lib/image-prepare";

export const RIDE_PHOTO_BUCKET = "ride-photos";
export const RIDE_PHOTO_MAX_EDGE = 1280;
export const RIDE_PHOTO_MAX_BYTES = 1_800_000;
export const RIDE_PHOTO_SIGNED_TTL_SECONDS = 60 * 60 * 4;
export const RIDE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/*";

const PHOTO_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)\.jpg$/i;

export type StatsVisibility = "friends" | "public";

export function isStatsVisibility(value: unknown): value is StatsVisibility {
  return value === "friends" || value === "public";
}

export function ridePhotoObjectPath(userId: string, coasterId: number): string {
  return `${userId}/${coasterId}.jpg`;
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

export async function signRidePhotoUrls(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(parseRidePhotoPath(path))))];
  const signed = new Map<string, string>();
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
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

export async function uploadRidePhoto(
  supabase: SupabaseClient,
  userId: string,
  coasterId: number,
  file: File,
): Promise<{ ok: true; photoPath: string; photoUrl: string } | { ok: false; message: string }> {
  const prepared = await prepareRidePhoto(file);
  if (!prepared.ok) return prepared;

  const photoPath = ridePhotoObjectPath(userId, coasterId);
  const { error: uploadError } = await supabase.storage.from(RIDE_PHOTO_BUCKET).upload(photoPath, prepared.blob, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (uploadError) {
    return { ok: false, message: friendlyRidePhotoError(uploadError.message) };
  }

  const { error: updateError } = await supabase
    .from("rides")
    .update({ photo_path: photoPath })
    .eq("user_id", userId)
    .eq("coaster_id", coasterId);
  if (updateError) {
    return { ok: false, message: friendlyRidePhotoError(updateError.message) };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(RIDE_PHOTO_BUCKET)
    .createSignedUrl(photoPath, RIDE_PHOTO_SIGNED_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return { ok: true, photoPath, photoUrl: "" };
  }
  return { ok: true, photoPath, photoUrl: signed.signedUrl };
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
  await supabase.storage.from(RIDE_PHOTO_BUCKET).remove([path]);
  return { ok: true };
}
