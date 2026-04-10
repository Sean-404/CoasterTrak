"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthErrorHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("error=")) return;

    const params = new URLSearchParams(hash.slice(1));
    const errorCode = params.get("error_code") ?? "";
    const isExpired = errorCode === "otp_expired" || errorCode === "otp_disabled";

    if (isExpired) {
      router.replace("/login?expired=1");
    }
  }, [router]);

  return null;
}
