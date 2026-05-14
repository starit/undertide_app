"use client";

import { ThemeScript } from "@themed.js/react";

/** Injects `<style id="themed-js-styles">` for SSR / first paint; must stay a client module (not imported from RSC `layout.tsx`). */
export function ThemedJsSSRStyle() {
  return <ThemeScript defaultTheme="light" />;
}
