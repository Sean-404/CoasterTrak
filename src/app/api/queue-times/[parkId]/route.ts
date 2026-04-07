import { NextResponse } from "next/server";

type QueueRide = {
  id: number;
  name: string;
  is_open: boolean;
  wait_time: number;
  last_updated: string;
};

type QueueTimesResponse = {
  lands?: { rides?: QueueRide[] }[];
  rides?: QueueRide[];
};

export async function GET(_: Request, context: { params: Promise<{ parkId: string }> }) {
  const { parkId } = await context.params;
  const parsedId = Number.parseInt(parkId, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid park id" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://queue-times.com/parks/${parsedId}/queue_times.json`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch queue times" }, { status: response.status });
    }

    const payload = (await response.json()) as QueueTimesResponse;
    const rides = [...(payload.rides ?? []), ...(payload.lands?.flatMap((land) => land.rides ?? []) ?? [])];

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      rides: rides.map((ride) => ({
        id: ride.id,
        name: ride.name,
        isOpen: ride.is_open,
        waitTime: ride.wait_time,
        lastUpdated: ride.last_updated,
      })),
      source: "https://queue-times.com/",
    });
  } catch {
    return NextResponse.json({ error: "Queue times unavailable" }, { status: 502 });
  }
}
