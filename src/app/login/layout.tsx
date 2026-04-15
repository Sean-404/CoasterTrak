import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to CoasterTrak to track rides, build your wishlist, and view your stats.",
  alternates: {
    canonical: "/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
