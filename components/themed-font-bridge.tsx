"use client";

import { useTheme as useThemedJsTheme } from "@themed.js/react";
import { useEffect, useMemo } from "react";
import { applyFontStacksFromThemeTokens, clearFontStackVars } from "@/lib/theme-font-bridge";

export function ThemedFontBridge() {
  const { theme, initialized } = useThemedJsTheme();

  const fontSignature = useMemo(() => {
    if (!theme?.tokens?.typography?.fontFamily) return "";
    const { sans, serif, mono } = theme.tokens.typography.fontFamily;
    return `${sans}\0${serif}\0${mono}`;
  }, [theme?.tokens?.typography?.fontFamily]);

  useEffect(() => {
    if (!initialized || typeof document === "undefined") return;
    const el = document.documentElement;
    if (!theme?.tokens) {
      clearFontStackVars(el);
      return;
    }
    applyFontStacksFromThemeTokens(el, theme.tokens);
  }, [fontSignature, initialized, theme]);

  return null;
}
