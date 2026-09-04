import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTACT_EMAIL, INSTAGRAM_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Contact CoasterTrak",
  description:
    "Email CoasterTrak about catalog corrections, privacy requests, or questions about the free roller coaster tracker.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact CoasterTrak",
    description:
      "Reach the CoasterTrak team about catalog data, privacy, or how the roller coaster tracker works.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Contact</p>
        <h1 className="font-bungee mt-3 text-4xl leading-tight text-slate-900 sm:text-5xl">Get in touch</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-700">
          CoasterTrak is a small independent project. There is no call centre — email is the best way to reach us.
        </p>

        <div className="mt-8 space-y-6 text-base leading-relaxed text-slate-700">
          <p>
            Email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            . We read every message, but replies can take a few days. For product notes, see{" "}
            <Link href="/updates" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              What’s new
            </Link>
            ; trip photos are on{" "}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline-offset-2 hover:underline"
            >
              @coastertrak on Instagram
            </a>
            .
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">Catalog corrections</h2>
          <p>
            Park lineups change, and third-party sources are sometimes wrong. If a ride is missing, linked to the
            wrong park, or showing a bad photo or name, include:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>The park and ride names as they appear on CoasterTrak</li>
            <li>The page URL if you have it</li>
            <li>What looks wrong, and what it should be</li>
            <li>A park or manufacturer page we can check against, when you have one</li>
          </ul>
          <p>
            We cannot promise an instant catalog edit, and we still ask you to confirm operating status with the park
            before you travel.
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">Privacy and accounts</h2>
          <p>
            To request a copy of your data, or deletion of your account, email from the address on the account and
            say what you need. Details of what we store are in the{" "}
            <Link href="/privacy" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">Product questions</h2>
          <p>
            For how unique coaster credits are counted, start with the{" "}
            <Link href="/coaster-credits" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              coaster credit tracker
            </Link>
            . For map, wishlist, and stats screens, see the{" "}
            <Link href="/coaster-tracker" className="font-medium text-amber-700 underline-offset-2 hover:underline">
              roller coaster tracker guide
            </Link>
            . If something in the app is broken, describe the page and what you expected to happen.
          </p>

          <h2 className="pt-2 text-xl font-semibold text-slate-900">What we do not handle here</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Park tickets, FastPass-style reservations, or ride closures — contact the park.</li>
            <li>Please do not email to ask us to click ads or inflate traffic. That violates ad programme rules.</li>
          </ul>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
