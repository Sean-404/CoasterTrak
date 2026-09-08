import { NextResponse } from "next/server";
import { listGuessCandidates } from "@/lib/catalog-server";
import { haversineKm } from "@/lib/geo";
import {
  formatGuessDistance,
  guessDistanceLabel,
  guessScoreFromKm,
  readGuessToken,
} from "@/lib/guess-round";
import { coasterSlug, parkSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

type ScoreBody = {
  token?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  giveUp?: unknown;
};

export async function POST(request: Request) {
  let body: ScoreBody;
  try {
    body = (await request.json()) as ScoreBody;
  } catch {
    return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  }

  if (typeof body.token !== "string" || !body.token) {
    return NextResponse.json({ error: "Invalid guess." }, { status: 400 });
  }

  const giveUp = body.giveUp === true;
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const hasPin =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  if (!giveUp && !hasPin) {
    return NextResponse.json({ error: "Drop a pin on the map first." }, { status: 400 });
  }

  const coasterId = readGuessToken(body.token);
  if (!coasterId) {
    return NextResponse.json({ error: "This round expired. Load another photo." }, { status: 400 });
  }

  const candidates = await listGuessCandidates();
  const ride = candidates.find((row) => row.coasterId === coasterId);
  if (!ride) {
    return NextResponse.json({ error: "This ride is no longer in the guess pool." }, { status: 404 });
  }

  const distanceKm = hasPin ? haversineKm(latitude, longitude, ride.latitude, ride.longitude) : null;

  return NextResponse.json({
    gaveUp: giveUp,
    distanceKm,
    distanceLabel: distanceKm == null ? null : formatGuessDistance(distanceKm),
    resultLabel: giveUp ? "Gave up" : guessDistanceLabel(distanceKm ?? Infinity),
    score: giveUp || distanceKm == null ? 0 : guessScoreFromKm(distanceKm),
    coasterName: ride.coasterName,
    parkName: ride.parkName,
    country: ride.country,
    latitude: ride.latitude,
    longitude: ride.longitude,
    coasterHref: `/coasters/${coasterSlug(ride.coasterName, ride.coasterId)}`,
    parkHref: `/parks/${parkSlug(ride.parkName, ride.parkId)}`,
  });
}
