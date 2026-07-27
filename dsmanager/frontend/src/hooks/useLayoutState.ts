import { useState, useCallback, useEffect } from "react";

const LAYOUT_STORAGE_KEY = "grace_layout_state";

/**
 * The type of content currently displayed in the middle/third column slot.
 * - "ab-test": Default A/B ResponseCard comparison view
 * - "content": Injected content from another panel (e.g., prompt output, 3D model, diagram)
 * - null: Slot is closed / no output requested yet
 */
export type MiddleSlotType = "ab-test" | "content" | "output" | null;

/** Serializable metadata about injected middle-column content (body is not serializable) */
export interface MiddleSlotMeta {
  title?: string;
  source?: string;
  /** Timestamp of last injection, for reload awareness */
  injectedAt?: number;
}

export interface LayoutState {
  /** Whether the left and right columns are flipped (swapped sides) */
  flipped: boolean;
  /** What the middle column is currently hosting */
  middleSlot: MiddleSlotType;
  /** Metadata about injected content (persisted, body is not) */
  middleSlotMeta: MiddleSlotMeta | null;
}

const DEFAULT_STATE: LayoutState = {
  flipped: false,
  middleSlot: null,
  middleSlotMeta: null,
};

function loadSavedState(): LayoutState {
  try {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_STATE;
}

export function useLayoutState() {
  const [state, setState] = useState<LayoutState>(loadSavedState);

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const toggleFlip = useCallback(() => {
    setState((prev) => ({ ...prev, flipped: !prev.flipped }));
  }, []);

  /** Register what the middle column is currently showing */
  const setMiddleSlot = useCallback(
    (slot: MiddleSlotType, meta?: MiddleSlotMeta | null) => {
      setState((prev) => ({
        ...prev,
        middleSlot: slot,
        middleSlotMeta: meta ?? null,
      }));
    },
    [],
  );

  const resetLayout = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  return {
    flipped: state.flipped,
    middleSlot: state.middleSlot,
    middleSlotMeta: state.middleSlotMeta,
    toggleFlip,
    setMiddleSlot,
    resetLayout,
  };
}