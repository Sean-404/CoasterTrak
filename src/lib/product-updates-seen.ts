import { latestProductUpdate } from "@/lib/product-updates";

export const UPDATES_SEEN_STORAGE_KEY = "coastertrak:updates-seen:v1";
export const UPDATES_SEEN_EVENT = "coastertrak:updates-seen";

export function readSeenUpdateId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(UPDATES_SEEN_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function markUpdatesSeen(latestId?: string | null): void {
  if (typeof window === "undefined") return;
  const id = latestId ?? latestProductUpdate()?.id ?? null;
  if (!id) return;
  try {
    localStorage.setItem(UPDATES_SEEN_STORAGE_KEY, id);
    window.dispatchEvent(new CustomEvent(UPDATES_SEEN_EVENT, { detail: { id } }));
  } catch {
    // Ignore quota / private mode failures.
  }
}
