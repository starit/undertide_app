import {
  defaultSpacingTokens,
  defaultTransitionTokens,
  defaultTypographyTokens,
  type Theme,
} from "@themed.js/core";

/**
 * themed.js validates colors, font families, radius and shadow tokens from the LLM,
 * but writes font sizes, weights, line heights, spacing and transitions into a
 * <style> block as-is. Replace anything that is not a plain CSS value with the default
 * so a prompt-injected value such as `1rem}body{...}` cannot reach the stylesheet.
 */
export function sanitizeGeneratedTheme(theme: Theme): Theme {
  const { typography } = theme.tokens;

  return {
    ...theme,
    tokens: {
      ...theme.tokens,
      typography: {
        ...typography,
        fontSize: sanitizeGroup(typography.fontSize, defaultTypographyTokens.fontSize, isCssLength),
        fontWeight: sanitizeGroup(typography.fontWeight, defaultTypographyTokens.fontWeight, isFontWeight),
        lineHeight: sanitizeGroup(typography.lineHeight, defaultTypographyTokens.lineHeight, isLineHeight),
      },
      spacing: sanitizeGroup(theme.tokens.spacing, defaultSpacingTokens, isCssLength),
      transition: sanitizeGroup(theme.tokens.transition, defaultTransitionTokens, isCssDuration),
    },
  };
}

function sanitizeGroup<T extends object>(
  group: Partial<T> | undefined,
  defaults: T,
  isValid: (value: unknown) => boolean
): T {
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = group?.[key];
    if (isValid(value)) result[key] = value as T[keyof T];
  }
  return result;
}

function isCssLength(value: unknown): boolean {
  return typeof value === "string" && /^-?(\d+|\d*\.\d+)(px|rem|em|%)?$/.test(value.trim());
}

function isCssDuration(value: unknown): boolean {
  return typeof value === "string" && /^(\d+|\d*\.\d+)m?s$/.test(value.trim());
}

function isFontWeight(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 900;
}

function isLineHeight(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 4;
}
