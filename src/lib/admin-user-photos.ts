import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET, avatarObjectPath } from "@/lib/profile-photos";
import { RIDE_PHOTO_BUCKET, parseRidePhotoPath } from "@/lib/ride-photos";

export async function adminClearProfileAvatar(
  service: SupabaseClient,
  userId: string,
): Promise<{ error: string | null }> {
  const { error: updateError } = await service
    .from("profiles")
    .update({ avatar_path: null })
    .eq("user_id", userId);
  if (updateError) {
    return { error: "Could not clear profile photo." };
  }

  const { error: storageError } = await service.storage.from(AVATAR_BUCKET).remove([avatarObjectPath(userId)]);
  if (storageError && !/not found|not exist/i.test(storageError.message)) {
    return { error: "Profile photo was cleared, but the file could not be deleted." };
  }
  return { error: null };
}

export async function adminClearRidePhotos(
  service: SupabaseClient,
  userId: string,
): Promise<{ error: string | null }> {
  const { data: rides, error: ridesError } = await service
    .from("rides")
    .select("photo_path")
    .eq("user_id", userId)
    .not("photo_path", "is", null);
  if (ridesError) {
    return { error: "Could not clear ride photos." };
  }

  const { error: updateError } = await service
    .from("rides")
    .update({ photo_path: null })
    .eq("user_id", userId)
    .not("photo_path", "is", null);
  if (updateError) {
    return { error: "Could not clear ride photos." };
  }

  const paths = new Set<string>();
  for (const row of rides ?? []) {
    if (parseRidePhotoPath(row.photo_path)) {
      paths.add(row.photo_path as string);
    }
  }
  const { data: files } = await service.storage.from(RIDE_PHOTO_BUCKET).list(userId, { limit: 1000 });
  for (const file of files ?? []) {
    if (file.name) paths.add(`${userId}/${file.name}`);
  }
  if (paths.size > 0) {
    await service.storage.from(RIDE_PHOTO_BUCKET).remove([...paths]);
  }
  return { error: null };
}
