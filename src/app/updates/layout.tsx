import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "What’s New — CoasterTrak",
  description:
    "Product updates for CoasterTrak: Wrapped, map improvements, catalog fixes, and other changes worth knowing about.",
  alternates: {
    canonical: "/updates",
  },
  openGraph: {
    title: "What’s New — CoasterTrak",
    description: "Recent CoasterTrak product updates in one place.",
    url: "/updates",
    type: "website",
    images: [SOCIAL_IMAGE],
  },
};

export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
