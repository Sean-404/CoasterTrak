import { initialsFromName, normalizeAvatarKey, type AvatarKey } from "@/lib/avatars";

type ProfileAvatarProps = {
  avatarKey?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  title?: string;
};

const SIZE_CLASS = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

const AVATAR_THEME: Record<AvatarKey, string> = {
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  emerald: "bg-emerald-500",
  slate: "bg-slate-600",
  cyan: "bg-cyan-500",
};

export function ProfileAvatar({
  avatarKey,
  name,
  size = "md",
  className = "",
  title,
}: ProfileAvatarProps) {
  const key = normalizeAvatarKey(avatarKey);
  const initials = initialsFromName(name);

  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-white shadow-sm ring-1 ring-black/5",
        AVATAR_THEME[key],
        SIZE_CLASS[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {initials}
    </span>
  );
}
