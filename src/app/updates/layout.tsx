import type { Metadata } from "next";

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
  },
};

export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
