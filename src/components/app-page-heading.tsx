/** Shared title style for signed-in app pages (stats, account, wishlist, etc.). */
export const APP_PAGE_TITLE_CLASS =
  "font-bungee text-3xl leading-tight text-slate-900 sm:text-4xl";

export function AppPageHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h1 className={[APP_PAGE_TITLE_CLASS, className].filter(Boolean).join(" ")}>{children}</h1>;
}
