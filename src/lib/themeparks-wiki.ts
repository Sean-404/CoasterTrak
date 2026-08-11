/**
 * ThemeParks.wiki API client (catalog / entity tree only — not wait times).
 * @see https://api.themeparks.wiki/
 */

export const THEMEPARKS_WIKI_BASE = "https://api.themeparks.wiki/v1";
export const THEMEPARKS_WIKI_USER_AGENT =
  "CoasterTrakData/0.1 (https://github.com/coastertrak; catalog verification)";

export type ThemeParksEntityType =
  | "DESTINATION"
  | "PARK"
  | "ATTRACTION"
  | "RESTAURANT"
  | "SHOW"
  | "HOTEL"
  | string;

export type ThemeParksDestinationPark = {
  id: string;
  name: string;
};

export type ThemeParksDestination = {
  id: string;
  name: string;
  parks: ThemeParksDestinationPark[];
};

export type ThemeParksChildEntity = {
  id: string;
  name: string;
  entityType: ThemeParksEntityType;
  externalId?: string | null;
  parentId?: string | null;
  slug?: string | null;
  location?: { latitude?: number; longitude?: number } | null;
};

export type ThemeParksChildrenResponse = {
  id: string;
  name: string;
  entityType: ThemeParksEntityType;
  timezone?: string;
  children: ThemeParksChildEntity[];
};

async function themeParksFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${THEMEPARKS_WIKI_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": THEMEPARKS_WIKI_USER_AGENT,
    },
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
    throw new Error(`ThemeParks.wiki rate limited; retry after ${retryAfter}s`);
  }
  if (!res.ok) {
    throw new Error(`ThemeParks.wiki ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchThemeParksDestinations(): Promise<ThemeParksDestination[]> {
  const body = await themeParksFetch<{ destinations: ThemeParksDestination[] }>(
    "/destinations",
  );
  return body.destinations ?? [];
}

export async function fetchThemeParksParkChildren(
  parkEntityId: string,
): Promise<ThemeParksChildrenResponse> {
  return themeParksFetch<ThemeParksChildrenResponse>(
    `/entity/${encodeURIComponent(parkEntityId)}/children`,
  );
}

export function themeParksAttractions(
  children: ThemeParksChildEntity[],
): ThemeParksChildEntity[] {
  return children.filter((c) => c.entityType === "ATTRACTION");
}
