import type { ColorTokens } from "@themed.js/core";
import { clearFontStackVars } from "@/lib/theme-font-bridge";

/** Session keys for AI-driven HSL (rehydrate after refresh). */
export const AI_HSL_SESSION_ACTIVE = "undertide.hslAi.active";
export const AI_HSL_SESSION_THEME = "undertide.hslAi.theme";

const OVERRIDE_PROPS = [
  "color-scheme",
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-hover",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--brand",
  "--brand-foreground",
  "--brand-muted",
  "--info",
  "--info-foreground",
  "--warning",
  "--warning-foreground",
  "--page-radial-accent",
  "--page-linear-highlight",
  "--selection-highlight",
  "--code-background",
  "--code-border",
  "--code-header-background",
  "--code-header-foreground",
  "--code-foreground",
  "--syntax-comment",
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-function",
  "--syntax-number",
  "--shadow-color",
  "--grid-line",
  "--avatar-gradient-sat",
  "--avatar-gradient-light-a",
  "--avatar-gradient-sat-accent",
  "--avatar-gradient-light-b",
] as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const s = hex.trim();
  const long = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
  if (long) {
    return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
  }
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(s);
  if (short) {
    return [
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}

/** HSL triplet for `hsl(var(--token))`: `H S% L%` (no `hsl()` wrapper). */
export function rgbToHslTriplet(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function colorToHslTriplet(input: string): string | null {
  const rgb = hexToRgb(input);
  if (!rgb) return null;
  return rgbToHslTriplet(rgb[0], rgb[1], rgb[2]);
}

function parseTriplet(t: string): { h: number; s: number; l: number } | null {
  const m = /^(\d+)\s+(\d+)%\s+(\d+)%$/.exec(t.trim());
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function tripletToString(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

export function adjustTripletLightness(triplet: string, deltaL: number): string {
  const p = parseTriplet(triplet);
  if (!p) return triplet;
  const l = Math.max(0, Math.min(100, p.l + deltaL));
  return tripletToString(p.h, p.s, l);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function isDarkSurface(colors: ColorTokens): boolean {
  const rgb = hexToRgb(colors.background);
  if (!rgb) return false;
  return relativeLuminance(rgb[0], rgb[1], rgb[2]) < 0.22;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function mixHexTriplet(ca: string, cb: string, t: number): string | null {
  const a = hexToRgb(ca);
  const b = hexToRgb(cb);
  if (!a || !b) return null;
  const m = mixRgb(a, b, t);
  return rgbToHslTriplet(m[0], m[1], m[2]);
}

/** Maps themed.js `ColorTokens` to app HSL custom properties (same contract as `app/globals.css`). */
export function buildAppHslVarsFromColorTokens(colors: ColorTokens): Record<string, string> {
  const bg = colorToHslTriplet(colors.background) ?? "0 0% 96%";
  const fg = colorToHslTriplet(colors.textPrimary) ?? "0 0% 10%";
  const surface = colorToHslTriplet(colors.surface) ?? bg;
  const primary = colorToHslTriplet(colors.primary) ?? "165 33% 17%";
  const primaryFg = colorToHslTriplet(colors.textInverse) ?? "0 0% 100%";
  const secondary = colorToHslTriplet(colors.secondary) ?? surface;
  const secondaryFg = colorToHslTriplet(colors.textPrimary) ?? fg;
  const muted = colorToHslTriplet(colors.borderLight) ?? adjustTripletLightness(surface, -4);
  const mutedFg = colorToHslTriplet(colors.textSecondary) ?? adjustTripletLightness(fg, 0);
  const accent = colorToHslTriplet(colors.accent) ?? primary;
  const accentFg = colorToHslTriplet(colors.textInverse) ?? fg;
  const destructive = colorToHslTriplet(colors.error) ?? "0 72% 51%";
  const info = colorToHslTriplet(colors.info) ?? "217 91% 60%";
  const warning = colorToHslTriplet(colors.warning) ?? "24 77% 34%";
  const border = colorToHslTriplet(colors.border) ?? muted;
  const dark = isDarkSurface(colors);

  const primaryHover = adjustTripletLightness(primary, dark ? 6 : -6);
  const brandMuted =
    mixHexTriplet(colors.primary, colors.surface, 0.35) ?? adjustTripletLightness(primary, dark ? 8 : -8);

  const pageRadial =
    mixHexTriplet(colors.background, colors.primary, dark ? 0.45 : 0.22) ?? adjustTripletLightness(bg, -6);
  const pageLinear = dark
    ? adjustTripletLightness(fg, -55)
    : mixHexTriplet(colors.background, "#ffffff", 0.55) ?? "0 0% 100%";

  const shadowBase = dark ? "220 25% 5%" : fg;

  const codeBg = dark
    ? adjustTripletLightness(bg, -4)
    : rgbToHslTriplet(...mixRgb(hexToRgb(colors.background) ?? [250, 250, 250], [15, 23, 42], 0.88));
  const codeBorder = adjustTripletLightness(codeBg, dark ? 8 : 6);
  const codeHeaderBg = adjustTripletLightness(codeBg, dark ? 4 : 3);
  const ph = parseTriplet(codeBg);
  const codeHeaderFg = ph ? tripletToString(ph.h, Math.max(ph.s - 8, 0), Math.min(ph.l + 38, 75)) : "215 16% 47%";
  const codeFg = ph ? tripletToString(ph.h, Math.min(ph.s + 5, 35), Math.min(ph.l + 72, 96)) : "214 32% 91%";

  const pk = parseTriplet(primary) ?? { h: 200, s: 50, l: 50 };
  const syntaxKeyword = tripletToString((pk.h + 115) % 360, Math.min(pk.s + 35, 95), Math.min(pk.l + 28, 78));
  const syntaxString = tripletToString((pk.h + 160) % 360, 55, Math.min(pk.l + 12, 55));
  const syntaxFunction = tripletToString((pk.h + 55) % 360, 80, 68);
  const syntaxNumber = tripletToString((pk.h + 35) % 360, 88, 55);
  const syntaxComment = adjustTripletLightness(codeHeaderFg, dark ? 4 : -6);

  const vars: Record<string, string> = {
    "--background": bg,
    "--foreground": fg,
    "--card": surface,
    "--card-foreground": fg,
    "--popover": surface,
    "--popover-foreground": fg,
    "--primary": primary,
    "--primary-hover": primaryHover,
    "--primary-foreground": primaryFg,
    "--secondary": secondary,
    "--secondary-foreground": secondaryFg,
    "--muted": muted,
    "--muted-foreground": mutedFg,
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--destructive": destructive,
    "--destructive-foreground": "0 0% 100%",
    "--border": border,
    "--input": border,
    "--ring": primary,
    "--brand": primary,
    "--brand-foreground": primaryFg,
    "--brand-muted": brandMuted,
    "--info": info,
    "--info-foreground": dark ? fg : "0 0% 100%",
    "--warning": warning,
    "--warning-foreground": fg,
    "--page-radial-accent": pageRadial,
    "--page-linear-highlight": pageLinear,
    "--selection-highlight": primary,
    "--code-background": codeBg,
    "--code-border": codeBorder,
    "--code-header-background": codeHeaderBg,
    "--code-header-foreground": codeHeaderFg,
    "--code-foreground": codeFg,
    "--syntax-comment": syntaxComment,
    "--syntax-keyword": syntaxKeyword,
    "--syntax-string": syntaxString,
    "--syntax-function": syntaxFunction,
    "--syntax-number": syntaxNumber,
    "--shadow-color": shadowBase,
    "--grid-line": fg,
    "--avatar-gradient-sat": dark ? "42%" : "45%",
    "--avatar-gradient-light-a": dark ? "36%" : "28%",
    "--avatar-gradient-sat-accent": dark ? "50%" : "55%",
    "--avatar-gradient-light-b": dark ? "46%" : "38%",
  };

  return vars;
}

export function applyAppHslVarsToElement(el: HTMLElement, colors: ColorTokens): void {
  const vars = buildAppHslVarsFromColorTokens(colors);
  el.style.setProperty("color-scheme", isDarkSurface(colors) ? "dark" : "light");
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}

export function clearAppHslVarsFromElement(el: HTMLElement): void {
  for (const k of OVERRIDE_PROPS) {
    el.style.removeProperty(k);
  }
  clearFontStackVars(el);
}

export function isAiHslSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AI_HSL_SESSION_ACTIVE) === "1";
}

export function persistAiHslThemeJson(themeJson: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AI_HSL_SESSION_ACTIVE, "1");
  sessionStorage.setItem(AI_HSL_SESSION_THEME, themeJson);
}

export function clearPersistedAiHslTheme(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(AI_HSL_SESSION_ACTIVE);
  sessionStorage.removeItem(AI_HSL_SESSION_THEME);
}
