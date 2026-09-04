"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPageHeading } from "@/components/app-page-heading";
import { ProfileAvatar } from "@/components/profile-avatar";
import { SiteHeader } from "@/components/site-header";
import { isAdminUser } from "@/lib/admin";
import { coasterSlug, parkSlug } from "@/lib/slug";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import type { AdminUserActivityResponse } from "@/app/api/admin/users/[userId]/activity/route";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDay(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" });
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function AdminUserActivityPage() {
  const params = useParams<{ userId: string }>();
  const userId = typeof params.userId === "string" ? params.userId : "";

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AdminUserActivityResponse | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await getSupabaseUserSafe();
      const isAdmin = isAdminUser(user);
      if (cancelled) return;
      setAllowed(isAdmin);
      if (!isAdmin) {
        setLoading(false);
        return;
      }
      if (!userId) {
        setError("Missing user id.");
        setLoading(false);
        return;
      }
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Not signed in.");
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/activity`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = (await response.json().catch(() => ({}))) as AdminUserActivityResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || `Request failed (${response.status})`);
        }
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load user.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const filteredRides = useMemo(() => {
    const rides = data?.rides ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return rides;
    return rides.filter((ride) => {
      const hay = `${ride.name} ${ride.parkName ?? ""} ${ride.country ?? ""} ${ride.manufacturer ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.rides, filter]);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="mb-3">
          <Link href="/admin" className="text-sm font-semibold text-amber-700 hover:underline">
            ← Admin users
          </Link>
        </p>
        <AppPageHeading>User activity</AppPageHeading>
        <p className="mt-1 text-sm text-slate-500">
          Admin-only view of credits and ride logs (bypasses profile visibility).
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : !allowed ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            You do not have admin access.{" "}
            <Link href="/" className="font-semibold text-amber-700 hover:underline">
              Back home
            </Link>
          </div>
        ) : error ? (
          <p className="mt-8 text-sm text-red-600">{error}</p>
        ) : data ? (
          <div className="mt-6 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <ProfileAvatar
                  avatarKey={data.user.avatarKey}
                  imageUrl={data.user.avatarUrl}
                  name={data.user.displayName || data.user.email}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-slate-900">
                    {data.user.displayName?.trim() || "(no display name)"}
                  </h2>
                  <p className="mt-0.5 break-all text-sm text-slate-700">
                    {data.user.email?.trim() || "(no email)"}
                  </p>
                  <p className="mt-0.5 break-all text-xs text-slate-500">{data.user.userId}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Stats visibility: {data.user.statsVisibility ?? "—"}
                    {data.user.bannedAt || data.user.authBanned
                      ? ` · Banned${data.user.banReason ? ` (${data.user.banReason})` : ""}`
                      : " · Active"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Signed up {formatWhen(data.user.createdAt)} · Last sign-in{" "}
                    {formatWhen(data.user.lastSignInAt)}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Credits", value: data.stats.uniqueCredits },
                { label: "Total rides", value: data.stats.totalRides },
                { label: "Parks", value: data.stats.parks },
                { label: "Countries", value: data.stats.countries },
                { label: "Wishlist", value: data.stats.wishlist },
                { label: "Dated logs", value: data.stats.datedEvents },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center shadow-sm"
                >
                  <p className="text-lg font-semibold text-slate-900">{stat.value}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Logged credits</h3>
                  <p className="text-xs text-slate-500">
                    {filteredRides.length} of {data.rides.length} shown · newest activity first
                  </p>
                </div>
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter rides…"
                  className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 sm:w-56"
                />
              </div>

              {filteredRides.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No rides match.</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {filteredRides.map((ride) => (
                    <li
                      key={ride.coasterId}
                      className="flex flex-wrap items-start justify-between gap-2 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/coasters/${coasterSlug(ride.name, ride.coasterId)}`}
                          className="font-medium text-slate-900 hover:text-amber-800 hover:underline"
                        >
                          {ride.name}
                        </Link>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {ride.parkId != null && ride.parkName ? (
                            <Link
                              href={`/parks/${parkSlug(ride.parkName, ride.parkId)}`}
                              className="hover:text-amber-800 hover:underline"
                            >
                              {ride.parkName}
                            </Link>
                          ) : (
                            (ride.parkName ?? "Unknown park")
                          )}
                          {ride.country ? ` · ${ride.country}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[ride.coasterType, ride.manufacturer, ride.status]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-slate-500">
                        <p>
                          {ride.totalRides}×
                          {ride.rating != null ? ` · ★ ${ride.rating}` : ""}
                        </p>
                        <p className="mt-0.5">Last {formatDay(ride.lastRiddenOn ?? ride.riddenAt)}</p>
                        {ride.firstRiddenOn && ride.firstRiddenOn !== ride.lastRiddenOn ? (
                          <p className="mt-0.5">First {formatDay(ride.firstRiddenOn)}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
