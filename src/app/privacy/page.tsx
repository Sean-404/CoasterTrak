import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for CoasterTrak — how we collect, use, and protect your account and usage information.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Legal</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: 31 July 2026</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed text-slate-700">
          <p>
            This Privacy Policy explains how CoasterTrak (&quot;we&quot;, &quot;us&quot;) collects, uses, and shares
            information when you use coastertrak.com and related services (the &quot;Service&quot;).
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Account information.</strong> When you create an account we store your email address,
              authentication credentials (handled by our auth provider), and optional profile details such as a
              display name.
            </li>
            <li>
              <strong>Ride and preference data.</strong> Content you add in the app — for example logged rides,
              wishlist items, friend connections, and unit preferences — is stored so the Service can work across
              visits and devices.
            </li>
            <li>
              <strong>Usage and device data.</strong> We use privacy-oriented analytics (including Vercel Analytics
              and Speed Insights) that may collect aggregated performance and traffic metrics. We do not sell your
              personal information.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900">How we use information</h2>
          <p>We use the information above to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide, maintain, and improve the Service</li>
            <li>Authenticate you and secure your account</li>
            <li>Remember your ride history, wishlist, and settings</li>
            <li>Understand aggregate usage and fix performance issues</li>
            <li>Comply with legal obligations when required</li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900">Service providers</h2>
          <p>
            We rely on trusted processors to run the Service, including hosting and database/auth providers (such as
            Vercel and Supabase). They process data only as needed to provide their services to us, under their own
            privacy terms.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Advertising</h2>
          <p>
            We may display third-party advertisements (for example via Google AdSense) on selected content pages.
            Advertising partners may use cookies or similar technologies to serve ads based on your prior visits to
            this or other websites. You can learn more about Google&apos;s use of data in advertising and manage
            preferences through Google&apos;s ad settings. Ads are not shown on every page; authentication and empty
            utility screens are kept free of publisher ads.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Cookies and local storage</h2>
          <p>
            We use cookies and local storage for authentication sessions, remembering preferences (such as display
            units), and — when ads are enabled — advertising-related cookies from partners. You can control cookies
            through your browser settings; disabling some cookies may limit parts of the Service.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Data retention</h2>
          <p>
            We keep account and ride data while your account remains active. You can request deletion of your account
            data by contacting us using the details below. Aggregated analytics may be retained in anonymised form.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Children</h2>
          <p>
            The Service is not directed at children under 13 (or the minimum age required in your country). We do not
            knowingly collect personal information from children. If you believe a child has provided us data, contact
            us and we will take appropriate steps to delete it.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Your choices</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Update profile details from your account settings when signed in.</li>
            <li>Sign out at any time from the site header.</li>
            <li>
              Contact us to request access to or deletion of personal data we hold about you, subject to applicable
              law.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900">Changes</h2>
          <p>
            We may update this policy from time to time. The &quot;Last updated&quot; date at the top will change when
            we do. Continued use of the Service after updates constitutes acceptance of the revised policy.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
          <p>
            Questions about privacy can be sent to{" "}
            <a href="mailto:privacy@coastertrak.com" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              privacy@coastertrak.com
            </a>
            . See also our{" "}
            <Link href="/terms" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
