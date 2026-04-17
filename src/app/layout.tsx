import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Bungee, Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { UnitsProvider } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bungee = Bungee({
  variable: "--font-bungee",
  subsets: ["latin"],
  weight: "400",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://coastertrak.com";
const ADSENSE_CLIENT = "ca-pub-2576999274764112";

export const metadata: Metadata = {
  title: {
    default: "CoasterTrak",
    template: "%s | CoasterTrak",
  },
  description:
    "Track every roller coaster you ride. Explore parks on a world map, build your wishlist, and compare stats with friends.",
  metadataBase: new URL(SITE_URL),
  applicationName: "CoasterTrak",
  keywords: [
    "roller coaster tracker",
    "coaster stats",
    "coaster map",
    "coaster wishlist",
    "theme park rides",
    "CoasterTrak",
  ],
  alternates: {
    canonical: "/",
  },
  category: "travel",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/coastertrak-logo.png", type: "image/png", sizes: "384x384" },
      { url: "/coastertrak-logo.png", type: "image/png" },
    ],
    shortcut: [{ url: "/coastertrak-logo.png", type: "image/png" }],
    apple: [{ url: "/coastertrak-logo.png", type: "image/png", sizes: "384x384" }],
  },
  openGraph: {
    title: "CoasterTrak",
    description:
      "Track every roller coaster you ride. Explore parks on a map, build your wishlist, and compare stats.",
    siteName: "CoasterTrak",
    url: "/",
    type: "website",
    locale: "en_GB",
    images: [
      {
        url: "/coaster-hero.png",
        width: 1200,
        height: 630,
        alt: "CoasterTrak hero image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CoasterTrak",
    description:
      "Track every roller coaster you ride. Explore parks on a map, build your wishlist, and compare stats.",
    images: ["/coaster-hero.png"],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
  other: {
    "google-adsense-account": ADSENSE_CLIENT,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="overflow-y-scroll">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} antialiased`}
      >
        <Script
          id="adsense-script"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        <UnitsProvider>{children}</UnitsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
