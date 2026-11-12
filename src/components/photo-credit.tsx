import type { PhotoCredit as PhotoCreditData } from "@/lib/commons-credit";

type PhotoCreditProps = {
  credit: PhotoCreditData;
  /** "dark" for captions over the black lightbox, "light" for page content. */
  tone?: "light" | "dark";
  className?: string;
  /**
   * Link "Wikimedia Commons" to the file page. CoasterGuessr turns this off until the answer is
   * revealed, because Commons file names usually name the ride.
   */
  linkSource?: boolean;
};

/** "Photo: Author, CC BY-SA 4.0, via Wikimedia Commons", as the photo's licence requires. */
export function PhotoCredit({ credit, tone = "light", className = "", linkSource = true }: PhotoCreditProps) {
  const text = tone === "dark" ? "text-white/80" : "text-slate-500";
  const link =
    tone === "dark"
      ? "underline decoration-white/40 underline-offset-2 hover:text-white"
      : "underline decoration-slate-300 underline-offset-2 hover:text-slate-700";

  return (
    <p className={`text-xs leading-snug ${text} ${className}`}>
      Photo
      {credit.author ? <>: {credit.author}</> : null}
      {credit.license ? (
        <>
          ,{" "}
          {credit.licenseUrl ? (
            <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license" className={link}>
              {credit.license}
            </a>
          ) : (
            credit.license
          )}
        </>
      ) : null}
      , via{" "}
      {linkSource ? (
        <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>
          Wikimedia Commons
        </a>
      ) : (
        "Wikimedia Commons"
      )}
    </p>
  );
}
