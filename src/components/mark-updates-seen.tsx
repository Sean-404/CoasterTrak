"use client";

import { useEffect } from "react";
import { markUpdatesSeen } from "@/lib/product-updates-seen";
import { latestProductUpdate } from "@/lib/product-updates";

/** Clears the header “new updates” badge when the user opens What’s New. */
export function MarkUpdatesSeen() {
  useEffect(() => {
    markUpdatesSeen(latestProductUpdate()?.id);
  }, []);

  return null;
}
