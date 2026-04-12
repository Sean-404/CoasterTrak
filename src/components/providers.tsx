"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { UNITS_CYCLE, type Units } from "@/lib/units";

const STORAGE_KEY = "coastertrak-units";

type UnitsContextValue = {
  units: Units;
  setUnits: (u: Units) => void;
};

const UnitsContext = createContext<UnitsContextValue>({
  units: "imperial",
  setUnits: () => {},
});

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [units, setUnitsState] = useState<Units>("imperial");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Units | null;
    if (stored && UNITS_CYCLE.includes(stored)) setUnitsState(stored);
  }, []);

  function setUnits(next: Units) {
    setUnitsState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <UnitsContext.Provider value={{ units, setUnits }}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits() {
  return useContext(UnitsContext);
}
