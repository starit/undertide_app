import type { ThemeTokens } from "@themed.js/core";

/** Tailwind `font-sans` / `font-serif` / `font-mono` read these (see `tailwind.config.ts`). */
export const FONT_STACK_VAR_SANS = "--font-sans";
export const FONT_STACK_VAR_SERIF = "--font-serif";
export const FONT_STACK_VAR_MONO = "--font-mono";

const FONT_VARS = [FONT_STACK_VAR_SANS, FONT_STACK_VAR_SERIF, FONT_STACK_VAR_MONO] as const;

function normalizeStack(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim();
}

/** Writes `--font-sans|serif|mono` on `el` from themed.js typography tokens. */
export function applyFontStacksFromThemeTokens(el: HTMLElement, tokens: ThemeTokens): void {
  const ff = tokens.typography?.fontFamily;
  if (!ff) {
    clearFontStackVars(el);
    return;
  }
  const sans = normalizeStack(ff.sans);
  const serif = normalizeStack(ff.serif);
  const mono = normalizeStack(ff.mono);
  if (!sans || !serif || !mono) {
    clearFontStackVars(el);
    return;
  }
  el.style.setProperty(FONT_STACK_VAR_SANS, sans);
  el.style.setProperty(FONT_STACK_VAR_SERIF, serif);
  el.style.setProperty(FONT_STACK_VAR_MONO, mono);
}

export function clearFontStackVars(el: HTMLElement): void {
  for (const key of FONT_VARS) {
    el.style.removeProperty(key);
  }
}
