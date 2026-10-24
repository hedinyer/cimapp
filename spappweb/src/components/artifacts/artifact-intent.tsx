"use client";

import { useEffect, useRef } from "react";

export function dispatchArtifactIntent(
  id: string,
  detail: Record<string, unknown>,
) {
  window.dispatchEvent(new CustomEvent(`artifact-intent:${id}`, { detail }));
}

export function useArtifactIntent(
  id: string,
  apply: (detail: Record<string, unknown>) => void,
) {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const name = `artifact-intent:${id}`;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (detail && typeof detail === "object") applyRef.current(detail);
    };
    window.addEventListener(name, onEvent);
    return () => window.removeEventListener(name, onEvent);
  }, [id]);
}
