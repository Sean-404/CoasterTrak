import type { Metadata } from "next";
import { Bungee, Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "CoasterTrak",
  description: "Track coasters, wishlist rides, and view your stats.",
  metadataBase: new URL("https://coastertrak.vercel.app"),
  openGraph: {
    title: "CoasterTrak",
    description: "Track every roller coaster you ride. Map, wishlist, and stats.",
    siteName: "CoasterTrak",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CoasterTrak",
    description: "Track every roller coaster you ride. Map, wishlist, and stats.",
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
      </body>
    </html>
  );
}
