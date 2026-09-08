import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "CoasterGuessr",
  description:
    "CoasterGuessr is a free coaster photo game. Look at a roller coaster photo, pin the park on the world map, and see how close you were.",
  alternates: {
    canonical: "/guess",
  },
  openGraph: {
    title: "CoasterGuessr | CoasterTrak",
    description:
      "Pin the park from a coaster photo. A free browser game for roller coaster fans, built into CoasterTrak.",
    url: "/guess",
    type: "website",
  },
};

export default function GuessLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CoasterGuessr",
    url: `${SITE_URL}/guess`,
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    isPartOf: {
      "@type": "WebSite",
      name: "CoasterTrak",
      url: SITE_URL,
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "Free coaster photo game. Pin the park from a roller coaster photo and see how close you were.",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
