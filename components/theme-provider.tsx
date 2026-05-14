"use client";

import { ThemeProvider as ThemedJsThemeProvider } from "@themed.js/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { AiHslThemeRehydrate } from "@/components/ai-hsl-theme-rehydrate";
import { ThemedFontBridge } from "@/components/themed-font-bridge";
import { ThemedJsNextSync } from "@/components/themed-js-next-sync";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemedJsThemeProvider
      defaultTheme="light"
      storage={{ type: "none", autoSave: false, autoLoad: false }}
    >
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        themes={["light", "dark", "sepia", "system"]}
      >
        <ThemedJsNextSync />
        <AiHslThemeRehydrate />
        <ThemedFontBridge />
        {children}
      </NextThemesProvider>
    </ThemedJsThemeProvider>
  );
}
