import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coaster Map",
  description:
    "Explore roller coasters around the world, filter by country and park, and plan your next rides with CoasterTrak.",
  alternates: {
    canonical: "/map",
  },
};

export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
