import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CoasterGuessr",
  description: "Pin the park from a coaster photo.",
  robots: { index: false, follow: false },
};

export default function GuessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
