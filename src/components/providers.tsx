"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
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

// The saved preference lives in localStorage; the server render and hydration use imperial.
let chosenUnits: Units | null = null;
const unitsListeners = new Set<() => void>();

function subscribeUnits(listener: () => void) {
  unitsListeners.add(listener);
  return () => {
    unitsListeners.delete(listener);
  };
}

function getUnitsSnapshot(): Units {
  if (chosenUnits) return chosenUnits;
  const stored = localStorage.getItem(STORAGE_KEY) as Units | null;
  return stored && UNITS_CYCLE.includes(stored) ? stored : "imperial";
}

function getServerUnitsSnapshot(): Units {
  return "imperial";
}

function setUnits(next: Units) {
  chosenUnits = next;
  unitsListeners.forEach((listener) => listener());
  localStorage.setItem(STORAGE_KEY, next);
}

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const units = useSyncExternalStore(subscribeUnits, getUnitsSnapshot, getServerUnitsSnapshot);

  return (
    <UnitsContext.Provider value={{ units, setUnits }}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits() {
  return useContext(UnitsContext);
}
