import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "World Coaster Map",
  description:
    "Explore roller coasters around the world on the CoasterTrak map. Filter by country and park, open ride pages, and plan your next credits.",
  alternates: {
    canonical: "/map",
  },
  openGraph: {
    title: "World Coaster Map | CoasterTrak",
    description:
      "Explore roller coasters around the world on an interactive map and open park pages to browse rides.",
    url: "/map",
    type: "website",
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
