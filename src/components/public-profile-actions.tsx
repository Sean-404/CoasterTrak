"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { invitePath } from "@/lib/public-profile";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type FriendStatus = "none" | "pending" | "accepted" | "blocked" | "self";

type Props = {
  userId: string;
  displayName: string;
};

export function PublicProfileActions({ userId, displayName }: Props) {
  const [viewerId, setViewerId] = useState<string | null | undefined>(undefined);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>("none");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const user = await getSupabaseUserSafe();
      if (cancelled) return;

      if (!user) {
        setViewerId(null);
        setFriendStatus("none");
        return;
      }

      setViewerId(user.id);
      if (user.id === userId) {
        setFriendStatus("self");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setFriendStatus("none");
        return;
      }

      const { data: existing } = await supabase
        .from("friendships")
        .select("status")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`,
        )
        .maybeSingle();

      if (cancelled) return;

      const status = existing?.status;
      if (status === "accepted" || status === "pending" || status === "blocked") {
        setFriendStatus(status);
      } else {
        setFriendStatus("none");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const statsHref = `/stats?user=${encodeURIComponent(userId)}`;
  const compareHref = `${statsHref}&compare=1`;
  const inviteHref = invitePath(userId);

  if (viewerId === undefined) {
    return (
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-slate-100" />
        <div className="mt-4 flex gap-3">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 w-36 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </section>
    );
  }

  if (viewerId === null) {
    return (
      <section className="mt-10 rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
        <h2 className="text-xl font-semibold text-slate-900">Track your own credits</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          CoasterTrak is a free browser coaster credit tracker. Sign up to log unique rides, plan park leftovers,
          and compare tallies with {displayName}.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(inviteHref)}`}
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Sign up free
          </Link>
          <Link
            href={inviteHref}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            Accept invite / add friend
          </Link>
          <Link
            href="/guides/what-is-a-coaster-credit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            What is a credit?
          </Link>
        </div>
      </section>
    );
  }

  if (friendStatus === "self") {
    return (
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-900">This is your public profile</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          This is the page people see when you share your link. Full ride lists and photos live on My Stats.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/stats"
            className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Open My Stats
          </Link>
          <Link
            href="/account"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            Account &amp; visibility
          </Link>
          <Link
            href="/friends"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
          >
            Invite friends
          </Link>
        </div>
      </section>
    );
  }

  const friendLabel =
    friendStatus === "accepted"
      ? "Already friends"
      : friendStatus === "pending"
        ? "Request pending"
        : friendStatus === "blocked"
          ? null
          : "Add friend";

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-slate-900">Explore {displayName}&apos;s credits</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        Open full stats for ride lists and photos, or compare your tallies side by side.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={statsHref}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
        >
          View full stats
        </Link>
        <Link
          href={compareHref}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
        >
          Compare
        </Link>
        {friendLabel ? (
          friendStatus === "none" ? (
            <Link
              href={inviteHref}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              {friendLabel}
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600">
              {friendLabel}
            </span>
          )
        ) : null}
      </div>
    </section>
  );
}
