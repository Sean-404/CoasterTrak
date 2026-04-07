"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { SiteHeader } from "@/components/site-header";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type WishlistItem = {
  coaster_id: number;
  coasters?: { name: string; coaster_type: string; status: string }[] | null;
};

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [message, setMessage] = useState("Loading wishlist...");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Add Supabase env vars to load wishlist.");
      return;
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setMessage("Sign in to view wishlist.");
        return;
      }

      const { data: rows, error } = await supabase
        .from("wishlist")
        .select("coaster_id, coasters(name, coaster_type, status)")
        .eq("user_id", data.user.id);

      if (error) {
        setMessage(error.message);
        return;
      }

      setItems((rows ?? []) as WishlistItem[]);
      setMessage(rows?.length ? "" : "No wishlist rides yet.");
    });
  }, []);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Your wishlist</h1>
        <AuthGate>
          {items.length ? (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.coaster_id} className="rounded border border-slate-200 bg-white p-3">
                  <p className="font-medium">{item.coasters?.[0]?.name ?? `Coaster ${item.coaster_id}`}</p>
                  <p className="text-sm text-slate-600">
                    {item.coasters?.[0]?.coaster_type} - {item.coasters?.[0]?.status}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-600">{message}</p>
          )}
        </AuthGate>
      </main>
    </div>
  );
}
