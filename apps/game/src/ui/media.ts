import { useSyncExternalStore } from "react";

/** Primary pointer is a finger. Mouse and trackpad stay a fine pointer. */
export const COARSE_POINTER = "(pointer: coarse)";
export const PORTRAIT = "(orientation: portrait)";

function subscribe(query: string, onChange: () => void): () => void {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
