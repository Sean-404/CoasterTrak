import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for using CoasterTrak, the roller coaster tracking web application.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Legal</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: 31 July 2026</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed text-slate-700">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of CoasterTrak at coastertrak.com
            (the &quot;Service&quot;). By using the Service you agree to these Terms.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">The Service</h2>
          <p>
            CoasterTrak provides tools to explore theme parks and roller coasters, log rides, manage wishlists, view
            personal stats, and interact with friends&apos; progress. Features may change as we improve the product.
            Some features require a free account.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Accounts</h2>
          <p>
            You are responsible for the accuracy of information you provide and for keeping your login credentials
            secure. You must be old enough to form a binding contract in your jurisdiction (and at least 13 years of
            age, or the higher age required where you live). Do not share your account or use the Service for unlawful
            purposes.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Your content</h2>
          <p>
            You retain ownership of content you submit (such as ride logs and profile details). By submitting content
            you grant us a limited licence to host, store, and display it as needed to operate the Service. Do not
            submit content that infringes others&apos; rights or that is abusive, illegal, or harmful.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Catalog and third-party data</h2>
          <p>
            Park and coaster information shown in the Service may come from third-party or community sources. It is
            provided for personal, informational use and may contain errors or omissions. Always confirm ride
            availability, height restrictions, and park hours with the park itself before travelling. CoasterTrak is
            not affiliated with or endorsed by the parks or manufacturers listed unless we say otherwise.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Acceptable use</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Do not attempt to disrupt, scrape at abusive rates, or reverse engineer the Service.</li>
            <li>Do not use automated systems to create fake accounts or manipulate stats.</li>
            <li>Do not harass other users through friends or messaging features.</li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900">Advertising</h2>
          <p>
            The Service may display advertisements. Ad placements are intended for pages with meaningful publisher
            content and may change over time.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Disclaimer</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
            whether express or implied, including merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that the Service will be uninterrupted or error-free.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, CoasterTrak and its operators will not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill,
            arising from your use of the Service. Our total liability for any claim relating to the Service will not
            exceed the greater of (a) the amount you paid us to use the Service in the twelve months before the claim
            or (b) fifty pounds sterling (£50).
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Termination</h2>
          <p>
            We may suspend or terminate access if you violate these Terms or misuse the Service. You may stop using
            the Service at any time. Provisions that by their nature should survive (including disclaimers and
            liability limits) will survive termination.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Changes</h2>
          <p>
            We may update these Terms periodically. The &quot;Last updated&quot; date will change when we do. If you
            continue using the Service after changes take effect, you accept the revised Terms.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
          <p>
            Questions about these Terms:{" "}
            <a href="mailto:hello@coastertrak.com" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              hello@coastertrak.com
            </a>
            . Privacy details are in our{" "}
            <Link href="/privacy" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
