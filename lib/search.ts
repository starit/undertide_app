/** Longest search term accepted; longer input is cut so LIKE patterns and cache keys stay bounded. */
export const MAX_SEARCH_QUERY_LENGTH = 100;

export function normalizeSearchQuery(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
  return normalized ? normalized : undefined;
}

/** `%term%` for ILIKE, with `%`, `_` and `\` in the term matched literally. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}
