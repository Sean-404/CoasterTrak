import { readAffiliateEnv } from "@/lib/affiliates";

/** Privacy Policy section. Stays unpublished until the affiliate flag is on. */
export function AffiliatePrivacySection() {
  if (!readAffiliateEnv().enabled) return null;

  return (
    <>
      <h2 className="text-xl font-semibold text-slate-900">Affiliate links</h2>
      <p>
        Some park pages include a &quot;Plan your visit&quot; box with a link to GetYourGuide, a ticket seller. These
        are advertising links, labelled as ads: if you click one and book, we may earn a commission, at no extra cost
        to you.
      </p>
      <p>
        The box is a plain link. It loads no partner scripts, and nothing is shared with GetYourGuide unless you click
        it. When you do, you leave CoasterTrak, your browser tells GetYourGuide you came from coastertrak.com, and it
        may set cookies so the booking can be credited to us. We do not pass on your account details or ride history.
        What happens on GetYourGuide&apos;s site is covered by its own privacy policy.
      </p>
    </>
  );
}

/** About page paragraph. Stays unpublished until the affiliate flag is on. */
export function AffiliateAboutParagraph() {
  if (!readAffiliateEnv().enabled) return null;

  return (
    <p>
      Some park pages also carry clearly labelled affiliate links to GetYourGuide. If you book through one, we may
      earn a commission at no extra cost to you, which helps cover hosting. Ticket partners have no say in the catalog.
    </p>
  );
}
