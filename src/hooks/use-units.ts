"use client";

import { useEffect, useState } from "react";
import { UNITS_CYCLE, type Units } from "@/lib/units";

const STORAGE_KEY = "coastertrak-units";

export function useUnits() {
  const [units, setUnits] = useState<Units>("imperial");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Units | null;
    if (stored && UNITS_CYCLE.includes(stored)) setUnits(stored);
  }, []);

  function setAndPersist(next: Units) {
    setUnits(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return { units, setUnits: setAndPersist };
}
