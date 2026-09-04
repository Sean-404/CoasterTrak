import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSavedMapView,
  getInitialMapView,
  MAP_VIEW_STORAGE_KEY,
  readSavedMapView,
  writeSavedMapView,
} from "@/lib/map-view-storage";

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("sessionStorage", memory);
  vi.stubGlobal("window", { sessionStorage: memory });
  return memory;
}

beforeEach(() => {
  installMemorySessionStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("map-view-storage", () => {
  it("round-trips a valid view", () => {
    writeSavedMapView({ lat: 52.1, lng: -1.2, zoom: 7, parkId: 42, coasterId: null });
    expect(readSavedMapView()).toEqual({
      lat: 52.1,
      lng: -1.2,
      zoom: 7,
      parkId: 42,
      coasterId: null,
    });
  });

  it("rejects invalid payloads", () => {
    sessionStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify({ lat: 999, lng: 0, zoom: 2 }));
    expect(readSavedMapView()).toBeNull();
  });

  it("falls back to world view when empty", () => {
    expect(getInitialMapView()).toEqual({ lat: 25, lng: 10, zoom: 2 });
  });

  it("clears stored view", () => {
    writeSavedMapView({ lat: 40, lng: -74, zoom: 5 });
    clearSavedMapView();
    expect(readSavedMapView()).toBeNull();
  });

  it("swallows storage errors", () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
      clear: () => undefined,
    };
    vi.stubGlobal("sessionStorage", broken);
    vi.stubGlobal("window", { sessionStorage: broken });
    expect(() => writeSavedMapView({ lat: 1, lng: 2, zoom: 3 })).not.toThrow();
  });
});
