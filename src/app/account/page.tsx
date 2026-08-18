"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AppPageHeading } from "@/components/app-page-heading";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AVATAR_OPTIONS, DEFAULT_AVATAR_KEY, normalizeAvatarKey, type AvatarKey } from "@/lib/avatars";
import { getSupabaseBrowserClient, getSupabaseUserSafe } from "@/lib/supabase";
import { validateDisplayName } from "@/lib/display-name";
import { isStatsVisibility, type StatsVisibility } from "@/lib/ride-photos";
import { AVATAR_ACCEPT, removeAvatar, signAvatarUrls, uploadAvatar } from "@/lib/profile-photos";

function countryNameFromCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "Unknown country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

type CountryOption = {
  code: string;
  name: string;
};

type RideSearchResult = {
  id: number;
  name: string;
  parkLabel: string;
};

type ParkSearchResult = {
  id: number;
  name: string;
  country: string;
};

function buildCountryOptions(): CountryOption[] {
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  const byName = new Map<string, CountryOption>();
  const excludedRegionNames = new Set<string>([
    "united nations",
    "european union",
    "world",
  ]);
  const codes: string[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      codes.push(String.fromCharCode(a, b));
    }
  }

  for (const code of codes) {
    const name = display.of(code);
    if (!name || name === code || name.toLowerCase().includes("unknown")) continue;
    const key = name.trim().toLowerCase();
    if (excludedRegionNames.has(key)) continue;
    const existing = byName.get(key);
    if (!existing || code < existing.code) {
      byName.set(key, { code, name });
    }
  }

  return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name));
}

function parkLabelFromJoin(
  parks: { name: string | null; country: string | null } | { name: string | null; country: string | null }[] | null | undefined,
): string {
  if (!parks) return "";
  const park = Array.isArray(parks) ? parks[0] : parks;
  if (!park) return "";
  const name = (park.name ?? "").trim();
  const country = (park.country ?? "").trim();
  if (name && country) return `${name} · ${country}`;
  return name || country;
}

function canonicalParkSuggestionKey(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const withoutLocationTail = trimmed.split(",")[0] ?? trimmed;
  return withoutLocationTail
    .replace(/['’]s\b/g, "s")
    .replace(/\s+at\s+.+$/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const aBigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2);
    aBigrams.set(gram, (aBigrams.get(gram) ?? 0) + 1);
  }

  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2);
    const count = aBigrams.get(gram) ?? 0;
    if (count > 0) {
      overlap++;
      aBigrams.set(gram, count - 1);
    }
  }

  return (2 * overlap) / (a.length + b.length - 2);
}

function isLikelyDuplicateParkName(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return diceCoefficient(a, b) >= 0.78;
}

function isBroadParkLabel(name: string): boolean {
  const n = name.toLowerCase();
  const hasBroadKeyword =
    n.includes("resort") ||
    n.includes("destination") ||
    n.includes("theme parks") ||
    n.includes("entertainment complex");
  const commaParts = name.split(",").map((part) => part.trim()).filter(Boolean);
  return hasBroadKeyword || commaParts.length >= 3;
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) overlap++;
  }
  return overlap / Math.min(ta.size, tb.size);
}

function shouldHideBroadMatch(
  candidate: ParkSearchResult,
  allCandidates: ParkSearchResult[],
): boolean {
  if (!isBroadParkLabel(candidate.name)) return false;
  const candidateCanonical = canonicalParkSuggestionKey(candidate.name);
  const candidateCountry = candidate.country.trim().toLowerCase();

  return allCandidates.some((other) => {
    if (other.name === candidate.name && other.country === candidate.country) return false;
    if (other.country.trim().toLowerCase() !== candidateCountry) return false;
    if (isBroadParkLabel(other.name)) return false;
    const otherCanonical = canonicalParkSuggestionKey(other.name);
    const overlap = overlapScore(candidateCanonical, otherCanonical);
    const fuzzy = diceCoefficient(candidateCanonical, otherCanonical);
    return overlap >= 0.33 || fuzzy >= 0.55;
  });
}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

export default function AccountPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(DEFAULT_AVATAR_KEY);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [favoriteRideQuery, setFavoriteRideQuery] = useState("");
  const [favoriteRideId, setFavoriteRideId] = useState<number | null>(null);
  const [favoriteRideName, setFavoriteRideName] = useState("");
  const [favoriteRideParkLabel, setFavoriteRideParkLabel] = useState("");
  const [favoriteParkQuery, setFavoriteParkQuery] = useState("");
  const [favoriteParkId, setFavoriteParkId] = useState<number | null>(null);
  const [favoriteParkName, setFavoriteParkName] = useState("");
  const [favoriteParkCountry, setFavoriteParkCountry] = useState("");
  const [statsVisibility, setStatsVisibility] = useState<StatsVisibility>("friends");
  const [favoriteRideResults, setFavoriteRideResults] = useState<RideSearchResult[]>([]);
  const [favoriteRideSearching, setFavoriteRideSearching] = useState(false);
  const [favoriteParkResults, setFavoriteParkResults] = useState<ParkSearchResult[]>([]);
  const [favoriteParkSearching, setFavoriteParkSearching] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(getSupabaseBrowserClient()));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const countryOptions = useMemo(() => buildCountryOptions(), []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void getSupabaseUserSafe().then((user) => {
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
      setEmail(user.email ?? "");
      void supabase
        .from("profiles")
        .select("display_name, country_code, avatar_key, avatar_path, favorite_ride_id, favorite_park_id, stats_visibility")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(async ({ data, error }) => {
          if (error) {
            setProfileError("Could not load profile. Please try again.");
          } else {
            setDisplayName(data?.display_name ?? "");
            setAvatarKey(normalizeAvatarKey(data?.avatar_key));
            setAvatarPath(typeof data?.avatar_path === "string" ? data.avatar_path : null);
            if (typeof data?.avatar_path === "string") {
              const signed = await signAvatarUrls(supabase, [data.avatar_path]);
              setAvatarUrl(signed.get(data.avatar_path) ?? null);
            } else {
              setAvatarUrl(null);
            }
            setCountryCode((data?.country_code ?? "").toUpperCase());
            setStatsVisibility(isStatsVisibility(data?.stats_visibility) ? data.stats_visibility : "friends");
            const selectedRideId = (data?.favorite_ride_id as number | null | undefined) ?? null;
            setFavoriteRideId(selectedRideId);
            if (selectedRideId != null) {
              const { data: coasterData } = await supabase
                .from("coasters")
                .select("id, name, parks(name, country)")
                .eq("id", selectedRideId)
                .maybeSingle();
              const rideName = coasterData?.name?.trim() ?? "";
              const parkInfo = parkLabelFromJoin(
                (coasterData?.parks ??
                  null) as { name: string | null; country: string | null } | { name: string | null; country: string | null }[] | null,
              );
              setFavoriteRideName(rideName);
              setFavoriteRideParkLabel(parkInfo);
              setFavoriteRideQuery(rideName);
            } else {
              setFavoriteRideName("");
              setFavoriteRideParkLabel("");
              setFavoriteRideQuery("");
            }
            const selectedParkId = (data?.favorite_park_id as number | null | undefined) ?? null;
            setFavoriteParkId(selectedParkId);
            if (selectedParkId != null) {
              const { data: parkData } = await supabase
                .from("parks")
                .select("id, name, country")
                .eq("id", selectedParkId)
                .maybeSingle();
              const name = parkData?.name?.trim() ?? "";
              const country = parkData?.country?.trim() ?? "";
              setFavoriteParkName(name);
              setFavoriteParkCountry(country);
              setFavoriteParkQuery(name);
            } else {
              setFavoriteParkName("");
              setFavoriteParkCountry("");
              setFavoriteParkQuery("");
            }
          }
          setLoading(false);
        });
    });
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const query = favoriteRideQuery.trim();
    if (query.length < 2) return;
    if (favoriteRideId != null && sameLabel(query, favoriteRideName)) return;

    let active = true;
    const timer = setTimeout(() => {
      void supabase
        .from("coasters")
        .select("id, name, parks(name, country)")
        .ilike("name", `%${query}%`)
        .limit(8)
        .then(({ data, error }) => {
          if (!active) return;
          setFavoriteRideSearching(false);
          if (error) {
            setFavoriteRideResults([]);
            return;
          }
          const seen = new Set<string>();
          const results: RideSearchResult[] = [];
          for (const row of (data ?? []) as Array<{
            id: number;
            name: string;
            parks: { name: string | null; country: string | null } | { name: string | null; country: string | null }[] | null;
          }>) {
            const name = row.name?.trim();
            if (!name) continue;
            const parkLabel = parkLabelFromJoin(row.parks);
            const key = `${name}|${parkLabel}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({ id: row.id, name, parkLabel });
          }
          setFavoriteRideResults(results);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [favoriteRideId, favoriteRideName, favoriteRideQuery]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const query = favoriteParkQuery.trim();
    if (query.length < 2) return;
    if (favoriteParkId != null && sameLabel(query, favoriteParkName)) return;

    let active = true;
    const timer = setTimeout(() => {
      void supabase
        .from("parks")
        .select("id, name, country")
        .ilike("name", `%${query}%`)
        .limit(8)
        .then(({ data, error }) => {
          if (!active) return;
          setFavoriteParkSearching(false);
          if (error) {
            setFavoriteParkResults([]);
            return;
          }
          const seen = new Set<string>();
          const results: ParkSearchResult[] = [];
          for (const row of (data ?? []) as Array<{ id: number; name: string; country: string }>) {
            const name = row.name?.trim();
            if (!name) continue;
            const country = row.country?.trim() ?? "";
            const canonical = canonicalParkSuggestionKey(name);
            const countryKey = country.toLowerCase();
            let isDuplicate = false;

            for (const existing of seen) {
              const [existingCountry, existingCanonical] = existing.split("|");
              if (existingCountry !== countryKey) continue;
              if (isLikelyDuplicateParkName(existingCanonical ?? "", canonical)) {
                isDuplicate = true;
                break;
              }
            }

            if (isDuplicate) continue;
            seen.add(`${countryKey}|${canonical}`);
            results.push({ id: row.id, name, country });
          }
          const narrowed = results.filter((result) => !shouldHideBroadMatch(result, results));
          setFavoriteParkResults(narrowed);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [favoriteParkId, favoriteParkName, favoriteParkQuery]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");

    if (!userId) {
      setProfileError("Please sign in again.");
      return;
    }

    const validation = validateDisplayName(displayName);
    if (!validation.ok) {
      setProfileError(validation.reason);
      return;
    }
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    if (normalizedCountryCode && !/^[A-Z]{2}$/.test(normalizedCountryCode)) {
      setProfileError("Country must be a 2-letter ISO code, like US, GB, or DE.");
      return;
    }
    const normalizedFavoriteRideQuery = favoriteRideQuery.trim();
    if (normalizedFavoriteRideQuery && favoriteRideId == null) {
      setProfileError("Please select a favorite ride from the search results.");
      return;
    }
    const normalizedFavoriteParkQuery = favoriteParkQuery.trim();
    if (normalizedFavoriteParkQuery && favoriteParkId == null) {
      setProfileError("Please select a favorite park from the search results.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setProfileSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          display_name: validation.normalized,
          avatar_key: avatarKey,
          avatar_path: avatarPath,
          country_code: normalizedCountryCode || null,
          favorite_ride_id: favoriteRideId,
          favorite_park_id: favoriteParkId,
          stats_visibility: statsVisibility,
        },
        { onConflict: "user_id" },
      );
    setProfileSaving(false);

    if (error) {
      const message = (error.message ?? "").toLowerCase();
      const isDuplicate = message.includes("profiles_display_name_lower_uidx") || message.includes("duplicate key");
      setProfileError(isDuplicate ? "That display name is already taken." : "Could not save display name. Try a different name.");
      return;
    }

    setDisplayName(validation.normalized);
    setCountryCode(normalizedCountryCode);
    if (favoriteRideId == null) {
      setFavoriteRideName("");
      setFavoriteRideParkLabel("");
      setFavoriteRideQuery("");
    } else {
      setFavoriteRideQuery(favoriteRideName);
    }
    if (favoriteParkId == null) {
      setFavoriteParkName("");
      setFavoriteParkCountry("");
      setFavoriteParkQuery("");
    } else {
      setFavoriteParkQuery(favoriteParkName);
    }
    setProfileSuccess("Profile saved.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 8) { setPwError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwError("Passwords do not match."); return; }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess("Password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-2xl p-6">
        <AppPageHeading className="mb-6">Account</AppPageHeading>
        {loading ? (
          <p className="text-slate-500">Loading&hellip;</p>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <ProfileAvatar
                  avatarKey={avatarKey}
                  imageUrl={avatarUrl}
                  name={displayName}
                  size="lg"
                  title="Your avatar"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Display name</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {displayName.trim() ? displayName : "Not set yet"}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Signed in as</p>
                  <p className="mt-1 truncate text-sm text-slate-600">{email}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Country</p>
              <p className="mt-1 text-sm text-slate-700">
                {countryCode ? countryNameFromCode(countryCode) : "Not set yet"}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Favorite ride</p>
              <p className="mt-1 text-sm text-slate-700">
                {favoriteRideName ? `${favoriteRideName}${favoriteRideParkLabel ? ` · ${favoriteRideParkLabel}` : ""}` : "Not set yet"}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Favorite park</p>
              <p className="mt-1 text-sm text-slate-700">
                {favoriteParkName ? `${favoriteParkName}${favoriteParkCountry ? ` · ${favoriteParkCountry}` : ""}` : "Not set yet"}
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Public profile</h2>
              <p className="mt-1 text-sm text-slate-500">
                This is what other users will see in social features. Emails and private details are never shown.
              </p>
              <form onSubmit={saveProfile} className="mt-3 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setProfileError("");
                    setProfileSuccess("");
                  }}
                  placeholder="Enter display name"
                  autoComplete="nickname"
                  maxLength={24}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <p className="text-xs text-slate-500">
                  3-24 chars. Letters/numbers, spaces, dot, dash, underscore. Must start/end with a letter or number.
                </p>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Profile photo</label>
                <div className="flex flex-wrap items-center gap-3">
                  <ProfileAvatar
                    avatarKey={avatarKey}
                    imageUrl={avatarUrl}
                    name={displayName}
                    size="lg"
                    title="Your profile photo"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">
                      JPEG, PNG, or WebP. Signed-in users can see this with your display name. Colour initials are used
                      if you do not add a photo.
                    </p>
                    {avatarError ? (
                      <p className="mt-2 text-xs font-medium text-red-500">{avatarError}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept={AVATAR_ACCEPT}
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file || !userId) return;
                          void (async () => {
                            const supabase = getSupabaseBrowserClient();
                            if (!supabase) return;
                            setAvatarError("");
                            setAvatarBusy(true);
                            const result = await uploadAvatar(supabase, userId, file);
                            setAvatarBusy(false);
                            if (!result.ok) {
                              setAvatarError(result.message);
                              return;
                            }
                            setAvatarPath(result.avatarPath);
                            setAvatarUrl(result.avatarUrl || null);
                            setProfileSuccess("Profile photo saved.");
                          })();
                        }}
                      />
                      <button
                        type="button"
                        disabled={avatarBusy || profileSaving}
                        onClick={() => avatarInputRef.current?.click()}
                        className="min-h-10 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:opacity-50"
                      >
                        {avatarBusy ? "Saving…" : avatarUrl ? "Replace photo" : "Add photo"}
                      </button>
                      {avatarUrl ? (
                        <button
                          type="button"
                          disabled={avatarBusy || profileSaving}
                          onClick={() => {
                            if (!userId) return;
                            void (async () => {
                              const supabase = getSupabaseBrowserClient();
                              if (!supabase) return;
                              setAvatarError("");
                              setAvatarBusy(true);
                              const result = await removeAvatar(supabase, userId, avatarPath);
                              setAvatarBusy(false);
                              if (!result.ok) {
                                setAvatarError(result.message);
                                return;
                              }
                              setAvatarPath(null);
                              setAvatarUrl(null);
                              setProfileSuccess("Profile photo removed.");
                            })();
                          }}
                          className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          Remove photo
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Avatar colour</label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {AVATAR_OPTIONS.map((option) => {
                    const selected = avatarKey === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setAvatarKey(option.key);
                          setProfileError("");
                          setProfileSuccess("");
                        }}
                        aria-pressed={selected}
                        aria-label={`Choose ${option.label} avatar colour`}
                        className={[
                          "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 transition",
                          selected
                            ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900/15"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <ProfileAvatar avatarKey={option.key} name={displayName} size="md" />
                        <span className="text-[10px] font-medium text-slate-600">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  Initials come from your display name. Pick a colour for when you do not have a photo.
                </p>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Country</label>
                <select
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    setProfileError("");
                    setProfileSuccess("");
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">Prefer not to share</option>
                  {countryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Pick your country from the list, or leave it blank.</p>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Favorite ride</label>
                <input
                  type="text"
                  value={favoriteRideQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFavoriteRideQuery(next);
                    if (!sameLabel(next, favoriteRideName) || favoriteRideId == null) {
                      setFavoriteRideId(null);
                      setFavoriteRideName("");
                      setFavoriteRideParkLabel("");
                    }
                    if (next.trim().length < 2) {
                      setFavoriteRideResults([]);
                      setFavoriteRideSearching(false);
                    } else {
                      setFavoriteRideSearching(true);
                    }
                    setProfileError("");
                    setProfileSuccess("");
                  }}
                  placeholder="e.g. Steel Vengeance"
                  maxLength={80}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-slate-500">Search catalog rides and pick one from the list.</p>
                {favoriteRideId != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setFavoriteRideId(null);
                      setFavoriteRideName("");
                      setFavoriteRideParkLabel("");
                      setFavoriteRideQuery("");
                      setFavoriteRideResults([]);
                      setFavoriteRideSearching(false);
                      setProfileError("");
                      setProfileSuccess("");
                    }}
                    className="block w-fit text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                  >
                    Clear favorite ride
                  </button>
                )}
                {favoriteRideSearching && (
                  <p className="text-xs text-slate-500">Searching rides...</p>
                )}
                {!favoriteRideSearching && favoriteRideQuery.trim().length >= 2 && favoriteRideResults.length > 0 && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                    {favoriteRideResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setFavoriteRideId(result.id);
                            setFavoriteRideName(result.name);
                            setFavoriteRideParkLabel(result.parkLabel);
                            setFavoriteRideQuery(result.name);
                            setFavoriteRideResults([]);
                            setFavoriteRideSearching(false);
                            setProfileError("");
                            setProfileSuccess("");
                          }}
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-white"
                        >
                          <span className="font-medium text-slate-900">{result.name}</span>
                          {result.parkLabel ? <span className="block text-xs text-slate-500">{result.parkLabel}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {favoriteRideQuery.trim().length > 0 && favoriteRideId == null && (
                  <p className="text-xs text-amber-700">Choose one of the suggested rides to save this field.</p>
                )}
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Favorite park</label>
                <input
                  type="text"
                  value={favoriteParkQuery}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFavoriteParkQuery(next);
                    if (!sameLabel(next, favoriteParkName) || favoriteParkId == null) {
                      setFavoriteParkId(null);
                      setFavoriteParkName("");
                      setFavoriteParkCountry("");
                    }
                    if (next.trim().length < 2) {
                      setFavoriteParkResults([]);
                      setFavoriteParkSearching(false);
                    } else {
                      setFavoriteParkSearching(true);
                    }
                    setProfileError("");
                    setProfileSuccess("");
                  }}
                  placeholder="e.g. Cedar Point"
                  maxLength={80}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-slate-500">Search catalog parks and pick one from the list.</p>
                {favoriteParkId != null && (
                  <button
                    type="button"
                    onClick={() => {
                      setFavoriteParkId(null);
                      setFavoriteParkName("");
                      setFavoriteParkCountry("");
                      setFavoriteParkQuery("");
                      setFavoriteParkResults([]);
                      setFavoriteParkSearching(false);
                      setProfileError("");
                      setProfileSuccess("");
                    }}
                    className="block w-fit text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                  >
                    Clear favorite park
                  </button>
                )}
                {favoriteParkSearching && (
                  <p className="text-xs text-slate-500">Searching parks...</p>
                )}
                {!favoriteParkSearching && favoriteParkQuery.trim().length >= 2 && favoriteParkResults.length > 0 && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                    {favoriteParkResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setFavoriteParkId(result.id);
                            setFavoriteParkName(result.name);
                            setFavoriteParkCountry(result.country);
                            setFavoriteParkQuery(result.name);
                            setFavoriteParkResults([]);
                            setFavoriteParkSearching(false);
                            setProfileError("");
                            setProfileSuccess("");
                          }}
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-white"
                        >
                          <span className="font-medium text-slate-900">{result.name}</span>
                          {result.country ? <span className="block text-xs text-slate-500">{result.country}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {favoriteParkQuery.trim().length > 0 && favoriteParkId == null && (
                  <p className="text-xs text-amber-700">Choose one of the suggested parks to save this field.</p>
                )}
                <fieldset className="pt-2">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Stats &amp; photos
                  </legend>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose who can see your ride stats, ratings, and ride photos. New accounts default to Friends only.
                    Search engines cannot index this.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label
                      className={[
                        "cursor-pointer rounded-xl border px-3 py-3 transition",
                        statsVisibility === "private"
                          ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900/15"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="stats_visibility"
                        value="private"
                        checked={statsVisibility === "private"}
                        onChange={() => {
                          setStatsVisibility("private");
                          setProfileError("");
                          setProfileSuccess("");
                        }}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-slate-900">Private</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Only you can see your stats and photos. You will not appear in search or in the public directory.
                      </span>
                    </label>
                    <label
                      className={[
                        "cursor-pointer rounded-xl border px-3 py-3 transition",
                        statsVisibility === "friends"
                          ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900/15"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="stats_visibility"
                        value="friends"
                        checked={statsVisibility === "friends"}
                        onChange={() => {
                          setStatsVisibility("friends");
                          setProfileError("");
                          setProfileSuccess("");
                        }}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-slate-900">Friends only</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        People can find you by name. Accepted friends can see your stats and photos. This is the default.
                      </span>
                    </label>
                    <label
                      className={[
                        "cursor-pointer rounded-xl border px-3 py-3 transition",
                        statsVisibility === "public"
                          ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900/15"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name="stats_visibility"
                        value="public"
                        checked={statsVisibility === "public"}
                        onChange={() => {
                          setStatsVisibility("public");
                          setProfileError("");
                          setProfileSuccess("");
                        }}
                        className="sr-only"
                      />
                      <span className="block text-sm font-semibold text-slate-900">Public</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Signed-in users can find you under Friends → Browse public profiles and open your stats and photos.
                      </span>
                    </label>
                  </div>
                </fieldset>
                {profileError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{profileError}</p>}
                {profileSuccess && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{profileSuccess}</p>}
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="mt-1 block cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Change password</h2>
              <form onSubmit={changePassword} className="mt-3 space-y-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPwError(""); }}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); }}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                {pwError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{pwError}</p>}
                {pwSuccess && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{pwSuccess}</p>}
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pwLoading ? "Updating\u2026" : "Update password"}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Sign out</h2>
              <p className="mt-1 text-sm text-slate-500">You&apos;ll be returned to the home page.</p>
              <button
                onClick={signOut}
                className="mt-4 cursor-pointer rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
              >
                Sign out
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
