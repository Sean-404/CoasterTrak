import { NextResponse } from "next/server";
import { listGuessCandidates } from "@/lib/catalog-server";
import { compactImageUrl } from "@/lib/image-url";
import { pickGuessCandidate, readGuessToken, signGuessToken } from "@/lib/guess-round";

export const dynamic = "force-dynamic";

const GUESS_IMAGE_WIDTH = 960;

export async function GET(request: Request) {
  const candidates = await listGuessCandidates();
  if (!candidates.length) {
    return NextResponse.json({ error: "No rides with photos are available yet." }, { status: 404 });
  }

  const excludeToken = new URL(request.url).searchParams.get("exclude");
  const avoidCoasterId = excludeToken ? readGuessToken(excludeToken) : null;
  const picked = pickGuessCandidate(candidates, { avoidCoasterId });
  if (!picked) {
    return NextResponse.json({ error: "No rides with photos are available yet." }, { status: 404 });
  }

  const token = signGuessToken(picked.coasterId);
  if (!token) {
    return NextResponse.json({ error: "Guess rounds are not configured." }, { status: 503 });
  }

  return NextResponse.json({
    token,
    imageUrl: compactImageUrl(picked.imageUrl, GUESS_IMAGE_WIDTH) ?? picked.imageUrl,
  });
}
