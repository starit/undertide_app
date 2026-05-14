"use client";

import { useTheme as useThemedJsTheme } from "@themed.js/react";
import { useEffect } from "react";
import {
  AI_HSL_SESSION_THEME,
  applyAppHslVarsToElement,
  clearPersistedAiHslTheme,
  isAiHslSessionActive,
} from "@/lib/ai-theme-to-app-hsl";

export function AiHslThemeRehydrate() {
  const { importTheme, apply, initialized } = useThemedJsTheme();

  useEffect(() => {
    if (!initialized || typeof document === "undefined") return;
    if (!isAiHslSessionActive()) return;
    const raw = sessionStorage.getItem(AI_HSL_SESSION_THEME);
    if (!raw) {
      clearPersistedAiHslTheme();
      return;
    }
    try {
      const theme = importTheme(raw);
      void apply(theme.id).then(() => {
        applyAppHslVarsToElement(document.documentElement, theme.tokens.colors);
      });
    } catch {
      clearPersistedAiHslTheme();
    }
  }, [apply, importTheme, initialized]);

  return null;
}
