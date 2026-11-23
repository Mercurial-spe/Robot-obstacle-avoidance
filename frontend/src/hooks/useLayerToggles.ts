import { useCallback, useState } from "react";

/** Toggleable visualization layers, in legend order. */
export const LAYER_IDS = [
  "inflation",
  "astarGrid",
  "plannedPath",
  "trajectory",
  "robotHeading",
  "obstacleVelocity",
  "apfForce",
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export type LayerToggles = Record<LayerId, boolean>;

const STORAGE_KEY = "workbench.layer-toggles";

const DEFAULT_TOGGLES: LayerToggles = {
  inflation: true,
  astarGrid: false,
  plannedPath: true,
  trajectory: true,
  robotHeading: true,
  obstacleVelocity: true,
  apfForce: false,
};

function readStored(): LayerToggles {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOGGLES;
    const parsed = JSON.parse(raw) as Partial<LayerToggles>;
    const merged = { ...DEFAULT_TOGGLES };
    for (const id of LAYER_IDS) {
      if (typeof parsed[id] === "boolean") merged[id] = parsed[id] as boolean;
    }
    return merged;
  } catch {
    return DEFAULT_TOGGLES;
  }
}

/**
 * View state for the map's toggleable layers. Persisted to localStorage so the
 * demonstration setup survives a page reload; purely presentational state —
 * it never influences the simulation.
 */
export function useLayerToggles(): {
  layers: LayerToggles;
  toggleLayer: (id: LayerId) => void;
} {
  const [layers, setLayers] = useState<LayerToggles>(readStored);

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode) — toggles stay session-local
      }
      return next;
    });
  }, []);

  return { layers, toggleLayer };
}
