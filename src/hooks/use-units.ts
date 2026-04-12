"use client";

import { useEffect, useState } from "react";
import type { Units } from "@/lib/units";

const STORAGE_KEY = "coastertrak-units";

export function useUnits() {
  const [units, setUnits] = useState<Units>("imperial");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "metric") setUnits("metric");
  }, []);

  function toggle() {
    const next: Units = units === "imperial" ? "metric" : "imperial";
    setUnits(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return { units, toggle };
}
