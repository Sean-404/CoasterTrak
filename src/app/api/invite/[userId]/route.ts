import { NextResponse } from "next/server";
import { getPublicProfileByUserId } from "@/lib/public-profile";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

/** Public, minimal inviter name for signed-out invite pages. */
export async function GET(_request: Request, context: RouteContext) {
  const { userId: raw } = await context.params;
  const userId = decodeURIComponent(raw);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "Invalid invite." }, { status: 400 });
  }

  const profile = await getPublicProfileByUserId(userId);
  if (!profile) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  return NextResponse.json({ displayName: profile.displayName });
}
