import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Achievements",
  description:
    "Track your coaster milestones, unlock badges, and compare your progress over time in CoasterTrak achievements.",
  alternates: {
    canonical: "/achievements",
  },
};

export default function AchievementsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
