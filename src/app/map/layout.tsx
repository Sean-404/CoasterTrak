import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "World Coaster Map",
  description:
    "Explore roller coasters around the world on the CoasterTrak map. Switch to park or coaster lists, filter by country, and plan your next credits.",
  alternates: {
    canonical: "/map",
  },
  openGraph: {
    title: "World Coaster Map | CoasterTrak",
    description:
      "Explore roller coasters around the world on an interactive map, then switch to park or coaster lists.",
    url: "/map",
    type: "website",
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
