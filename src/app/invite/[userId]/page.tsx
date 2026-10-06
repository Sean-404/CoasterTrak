"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requestFriendNotification } from "@/lib/friend-notify-client";
import { storePendingInvite } from "@/lib/pending-invite";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";

type InviterInfo = {
  userId: string;
  displayName: string;
};

export default function InvitePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const inviterId = typeof params.userId === "string" ? decodeURIComponent(params.userId) : "";

  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "sent" | "error" | "missing">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!inviterId || !/^[0-9a-f-]{36}$/i.test(inviterId)) {
      setStatus("missing");
      return;
    }

    storePendingInvite(inviterId);

    const supabase = getSupabaseBrowserClient();
    void (async () => {
      // Prefer public API for inviter name when signed out — hit a tiny server endpoint via fetch to /api is heavy;
      // use anon client for profile when authenticated, else show generic until login.
      const user = await getSupabaseUserSafe();

      if (!supabase) {
        setInviter({ userId: inviterId, displayName: "a friend" });
        setStatus("ready");
        return;
      }

      if (!user) {
        // Signed-out: store invite and show CTA; name resolved after signup is optional.
        const res = await fetch(`/api/invite/${encodeURIComponent(inviterId)}`, { cache: "no-store" });
        if (res.ok) {
          const payload = (await res.json()) as { displayName?: string };
          setInviter({
            userId: inviterId,
            displayName: payload.displayName?.trim() || "a friend",
          });
        } else {
          setInviter({ userId: inviterId, displayName: "a friend" });
        }
        setStatus("ready");
        return;
      }

      if (user.id === inviterId) {
        setMessage("That invite link is yours — share it with someone else.");
        setStatus("error");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", inviterId)
        .maybeSingle();

      const displayName = profile?.display_name?.trim() || "a friend";
      setInviter({ userId: inviterId, displayName });

      const { data: existing } = await supabase
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${inviterId}),and(requester_id.eq.${inviterId},addressee_id.eq.${user.id})`,
        )
        .maybeSingle();

      if (existing?.status === "accepted") {
        setMessage(`You are already friends with ${displayName}.`);
        setStatus("sent");
        return;
      }
      if (existing?.status === "pending") {
        setMessage(`Friend request with ${displayName} is already pending.`);
        setStatus("sent");
        return;
      }
      if (existing?.status === "blocked") {
        setMessage("You cannot send a friend request for this invite.");
        setStatus("error");
        return;
      }

      if (existing?.status === "declined") {
        const { data: updated, error } = await supabase
          .from("friendships")
          .update({ status: "pending", requester_id: user.id, addressee_id: inviterId })
          .eq("id", existing.id)
          .select("id")
          .maybeSingle();
        if (error || !updated) {
          setStatus("error");
          setMessage("Could not send friend request.");
          return;
        }
        void requestFriendNotification("friend_request", String(updated.id));
      } else {
        const { data: inserted, error } = await supabase
          .from("friendships")
          .insert({ requester_id: user.id, addressee_id: inviterId, status: "pending" })
          .select("id")
          .maybeSingle();
        if (error || !inserted) {
          setStatus("error");
          setMessage("Could not send friend request.");
          return;
        }
        void requestFriendNotification("friend_request", String(inserted.id));
      }

      try {
        window.localStorage.removeItem("ct_pending_invite");
      } catch {
        // ignore
      }
      setMessage(`Friend request sent to ${displayName}.`);
      setStatus("sent");
      router.prefetch("/friends");
    })();
  }, [inviterId, router]);

  const name = inviter?.displayName ?? "a friend";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Invite</p>
          <h1 className="font-bungee mt-3 text-3xl leading-tight text-slate-900">Join {name} on CoasterTrak</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Free coaster credit tracker in your browser. Accept this invite to connect and compare tallies.
          </p>

          {status === "loading" ? (
            <p className="mt-6 text-sm text-slate-500">Loading invite…</p>
          ) : null}
          {status === "missing" ? (
            <p className="mt-6 text-sm text-red-600">This invite link is invalid.</p>
          ) : null}
          {message ? (
            <p
              className={`mt-6 rounded-lg px-3 py-2 text-sm ${
                status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {message}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {status === "ready" ? (
              <Link
                href={`/login?next=${encodeURIComponent(`/invite/${inviterId}`)}`}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
              >
                Sign up or sign in
              </Link>
            ) : null}
            {status === "sent" ? (
              <Link
                href="/friends"
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
              >
                Open friends
              </Link>
            ) : null}
            <Link
              href="/guides"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400"
            >
              Credit guides
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
