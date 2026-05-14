"use client";

import { useTheme as useThemedJsTheme } from "@themed.js/react";
import { useTheme as useNextThemes } from "next-themes";
import { useEffect, useRef } from "react";
import { clearAppHslVarsFromElement, clearPersistedAiHslTheme, isAiHslSessionActive } from "@/lib/ai-theme-to-app-hsl";

/**
 * Maps app UI themes (next-themes, HSL tokens in globals.css) to closest themed.js
 * builtin palette so `--themed-*` variables stay visually coherent.
 */
function mapResolvedToThemedId(resolved: string | undefined): string {
  if (resolved === "dark") return "dark";
  if (resolved === "sepia") return "rose";
  return "light";
}

export function ThemedJsNextSync() {
  const { resolvedTheme, theme } = useNextThemes();
  const { apply, initialized } = useThemedJsTheme();
  const prevResolvedRef = useRef<string | undefined>(undefined);
  const prevSelectionRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!initialized) return;
    const resolved = resolvedTheme ?? "light";
    /** `theme` is the dropdown value (e.g. `system`); `resolvedTheme` is the computed light/dark. */
    const selection = theme ?? resolved;
    const prevResolved = prevResolvedRef.current;
    const prevSelection = prevSelectionRef.current;

    if (prevResolved === undefined) {
      if (isAiHslSessionActive()) {
        prevResolvedRef.current = resolved;
        prevSelectionRef.current = selection;
        return;
      }
      prevResolvedRef.current = resolved;
      prevSelectionRef.current = selection;
      void apply(mapResolvedToThemedId(resolved));
      return;
    }

    const resolvedChanged = prevResolved !== resolved;
    const selectionChanged = prevSelection !== selection;

    if (resolvedChanged || selectionChanged) {
      clearPersistedAiHslTheme();
      clearAppHslVarsFromElement(document.documentElement);
      prevResolvedRef.current = resolved;
      prevSelectionRef.current = selection;
      void apply(mapResolvedToThemedId(resolved));
    }
  }, [apply, initialized, resolvedTheme, theme]);

  return null;
}
