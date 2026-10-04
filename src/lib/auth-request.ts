import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AuthedRequestContext = {
  user: User;
  accessToken: string;
  service: NonNullable<ReturnType<typeof getSupabaseServerClient>>;
};

export async function requireBearerUser(
  request: Request,
): Promise<AuthedRequestContext | NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getSupabaseServerClient();
  if (!service) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  return { user: data.user, accessToken, service };
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
