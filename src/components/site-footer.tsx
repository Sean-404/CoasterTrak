import Link from "next/link";

type SiteFooterProps = {
  variant?: "light" | "dark";
  className?: string;
};

export function SiteFooter({ variant = "light", className = "" }: SiteFooterProps) {
  const isDark = variant === "dark";

  return (
    <footer
      className={[
        "mt-auto",
        isDark ? "border-t border-white/10 bg-slate-950" : "border-t border-slate-200 bg-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bungee text-sm tracking-wide text-amber-500">CoasterTrak</p>
          <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Track roller coasters, explore parks, and build your ride history.
          </p>
        </div>
        <nav
          className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}
          aria-label="Legal"
        >
          <FooterLink href="/about" isDark={isDark}>
            About
          </FooterLink>
          <FooterLink href="/privacy" isDark={isDark}>
            Privacy
          </FooterLink>
          <FooterLink href="/terms" isDark={isDark}>
            Terms
          </FooterLink>
          <FooterLink href="/coaster-tracker" isDark={isDark}>
            Coaster tracker
          </FooterLink>
          <FooterLink href="/map" isDark={isDark}>
            Discover
          </FooterLink>
          <FooterLink href="/parks" isDark={isDark}>
            Parks
          </FooterLink>
          <FooterLink href="/coasters" isDark={isDark}>
            Coasters
          </FooterLink>
        </nav>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  isDark,
  children,
}: {
  href: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={isDark ? "transition hover:text-white" : "transition hover:text-slate-900"}
    >
      {children}
    </Link>
  );
}
