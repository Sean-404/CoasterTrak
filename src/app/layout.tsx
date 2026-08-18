import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Bungee, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { UnitsProvider } from "@/components/providers";
import { SITE_URL } from "@/lib/site-url";

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

const ADSENSE_CLIENT = "ca-pub-2576999274764112";
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.replace(
  /^google-site-verification=/i,
  "",
).trim();

export const metadata: Metadata = {
  title: {
    default: "CoasterTrak | Free Roller Coaster Tracker",
    template: "%s | CoasterTrak",
  },
  description:
    "CoasterTrak is a free roller coaster tracker (coaster trak) to log ride credits, explore theme parks on a world map, build a wishlist, and compare coaster stats with friends.",
  metadataBase: new URL(SITE_URL),
  applicationName: "CoasterTrak",
  keywords: [
    "CoasterTrak",
    "coaster trak",
    "coaster tracker",
    "roller coaster tracker",
    "roller coaster credit tracker",
    "coaster credits",
    "theme park tracker",
    "coaster map",
    "coaster wishlist",
    "coaster stats",
    "theme park rides",
  ],
  category: "travel",
  authors: [{ name: "CoasterTrak", url: SITE_URL }],
  creator: "CoasterTrak",
  publisher: "CoasterTrak",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/coastertrak-logo.png", sizes: "384x384", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "CoasterTrak | Free Roller Coaster Tracker",
    description:
      "Free roller coaster tracker to log credits, explore parks on a map, build a wishlist, and compare stats with friends.",
    siteName: "CoasterTrak",
    url: "/",
    type: "website",
    locale: "en_GB",
    images: [
      {
        url: "/coaster-hero.png",
        width: 1200,
        height: 630,
        alt: "CoasterTrak — free roller coaster tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CoasterTrak | Free Roller Coaster Tracker",
    description:
      "Free roller coaster tracker to log credits, explore parks on a map, build a wishlist, and compare stats.",
    images: ["/coaster-hero.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: googleVerification || undefined,
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
        <UnitsProvider>{children}</UnitsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
