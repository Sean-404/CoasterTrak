import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isNextResponse, requireAdmin, type AdminRequestContext } from "@/lib/admin-api";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase-fetch-all";

export const runtime = "nodejs";

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  updated_at: string | null;
};

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  country_code: string | null;
  avatar_key: string | null;
  banned_at: string | null;
  ban_reason: string | null;
  auth_banned: boolean;
  has_profile: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  updated_at: string | null;
};

const PROFILE_SELECT =
  "user_id, display_name, country_code, avatar_key, banned_at, ban_reason, updated_at";

const AUTH_PAGE_SIZE = 1000;

function isAuthBanned(bannedUntil?: string | null): boolean {
  if (!bannedUntil) return false;
  const until = Date.parse(bannedUntil);
  return Number.isFinite(until) && until > Date.now();
}

function mergeAuthAndProfile(authUser: User, profile: ProfileRow | undefined): AdminUserRow {
  return {
    user_id: authUser.id,
    email: authUser.email ?? null,
    display_name: profile?.display_name ?? null,
    country_code: profile?.country_code ?? null,
    avatar_key: profile?.avatar_key ?? null,
    banned_at: profile?.banned_at ?? null,
    ban_reason: profile?.ban_reason ?? null,
    auth_banned: isAuthBanned(authUser.banned_until),
    has_profile: Boolean(profile),
    created_at: authUser.created_at ?? null,
    last_sign_in_at: authUser.last_sign_in_at ?? null,
    updated_at: profile?.updated_at ?? authUser.updated_at ?? null,
  };
}

function sortAdminUsers(a: AdminUserRow, b: AdminUserRow): number {
  const aName = a.display_name?.trim().toLowerCase() ?? "";
  const bName = b.display_name?.trim().toLowerCase() ?? "";
  if (aName && bName && aName !== bName) return aName.localeCompare(bName);
  if (aName && !bName) return -1;
  if (!aName && bName) return 1;
  const aEmail = a.email?.toLowerCase() ?? "";
  const bEmail = b.email?.toLowerCase() ?? "";
  if (aEmail !== bEmail) return aEmail.localeCompare(bEmail);
  return a.user_id.localeCompare(b.user_id);
}

async function listAllAuthUsers(
  service: AdminRequestContext["service"],
): Promise<{ users: User[]; error: string | null }> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) {
      return { users, error: error.message || "Could not list auth users." };
    }
    const batch = data.users ?? [];
    users.push(...batch);
    if (batch.length < AUTH_PAGE_SIZE) break;
  }
  return { users, error: null };
}

async function listAllProfiles(
  service: AdminRequestContext["service"],
): Promise<{ profiles: ProfileRow[]; error: string | null }> {
  const { data, error } = await fetchAllPages<ProfileRow>(SUPABASE_PAGE_SIZE, (from, to) =>
    service
      .from("profiles")
      .select(PROFILE_SELECT)
      .order("user_id", { ascending: true })
      .range(from, to),
  );
  if (error) {
    return { profiles: [], error: error.message || "Could not list profiles." };
  }
  return { profiles: data, error: null };
}

function matchesQuery(user: AdminUserRow, q: string, uuidLike: boolean): boolean {
  if (uuidLike) return user.user_id.toLowerCase() === q.toLowerCase();
  const needle = q.toLowerCase();
  if (user.email?.toLowerCase().includes(needle)) return true;
  if (user.display_name?.toLowerCase().includes(needle)) return true;
  return false;
}

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

  if (q && q.length < 2 && !uuidLike) {
    return NextResponse.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  }

  const [authResult, profileResult] = await Promise.all([
    listAllAuthUsers(ctx.service),
    listAllProfiles(ctx.service),
  ]);

  if (authResult.error) {
    return NextResponse.json({ error: "Could not list auth users." }, { status: 500 });
  }
  if (profileResult.error) {
    return NextResponse.json({ error: "Could not list profiles." }, { status: 500 });
  }

  const profilesById = new Map(profileResult.profiles.map((row) => [row.user_id, row]));
  let users = authResult.users
    .map((authUser) => mergeAuthAndProfile(authUser, profilesById.get(authUser.id)))
    .sort(sortAdminUsers);

  if (q) {
    users = users.filter((user) => matchesQuery(user, q, uuidLike));
  }

  return NextResponse.json({ users });
}
