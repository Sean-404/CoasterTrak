import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareJpegImage } from "@/lib/image-prepare";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_EDGE = 512;
export const AVATAR_MAX_BYTES = 400_000;
export const AVATAR_SIGNED_TTL_SECONDS = 60 * 60 * 4;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/*";

const AVATAR_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/avatar\.jpg$/i;

export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

export function parseAvatarPath(path: string | null | undefined): { userId: string } | null {
  if (!path) return null;
  const match = AVATAR_PATH_RE.exec(path.trim());
  if (!match) return null;
  return { userId: match[1].toLowerCase() };
}

export function friendlyAvatarError(message: string): string {
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

export async function signAvatarUrls(
  supabase: SupabaseClient,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(parseAvatarPath(path))))];
  const signed = new Map<string, string>();
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(chunk, AVATAR_SIGNED_TTL_SECONDS);
    if (error || !data) continue;
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) {
        signed.set(row.path, row.signedUrl);
      }
    }
  }
  return signed;
}

export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<{ ok: true; avatarPath: string; avatarUrl: string } | { ok: false; message: string }> {
  const prepared = await prepareJpegImage(file, {
    maxEdge: AVATAR_MAX_EDGE,
    maxBytes: AVATAR_MAX_BYTES,
    square: true,
  });
  if (!prepared.ok) return prepared;

  const avatarPath = avatarObjectPath(userId);
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, prepared.blob, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (uploadError) {
    return { ok: false, message: friendlyAvatarError(uploadError.message) };
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_path: avatarPath })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (updateError) {
    return { ok: false, message: friendlyAvatarError(updateError.message) };
  }
  if (!updated) {
    return { ok: false, message: "Save your display name first, then add a photo." };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, AVATAR_SIGNED_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return { ok: true, avatarPath, avatarUrl: "" };
  }
  return { ok: true, avatarPath, avatarUrl: signed.signedUrl };
}

export async function removeAvatar(
  supabase: SupabaseClient,
  userId: string,
  avatarPath?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = parseAvatarPath(avatarPath)?.userId === userId ? avatarPath! : avatarObjectPath(userId);
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("user_id", userId);
  if (updateError) {
    return { ok: false, message: friendlyAvatarError(updateError.message) };
  }
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  return { ok: true };
}
