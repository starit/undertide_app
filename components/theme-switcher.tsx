"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useTheme as useThemedJsTheme } from "@themed.js/react";
import { BookOpen, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyAppHslVarsToElement, persistAiHslThemeJson } from "@/lib/ai-theme-to-app-hsl";
const themes = [
  { value: "light", labelKey: "themeLight" as const, icon: Sun },
  { value: "dark", labelKey: "themeDark" as const, icon: Moon },
  { value: "sepia", labelKey: "themeSepia" as const, icon: BookOpen },
  { value: "system", labelKey: "themeSystem" as const, icon: Monitor },
] as const;

const MAX_PROMPT_LENGTH = 800;

export function ThemeSwitcher() {
  const t = useTranslations("nav");
  const { theme, setTheme } = useNextTheme();
  const { importTheme, apply } = useThemedJsTheme();
  const [mounted, setMounted] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/themes/generate");
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { configured?: boolean } };
        if (!cancelled) setAiConfigured(Boolean(json.data?.configured));
      } catch {
        if (!cancelled) setAiConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const generateFromPrompt = useCallback(async () => {
    const trimmed = aiPrompt.trim();
    setAiError(null);
    if (!trimmed) {
      setAiError(t("themeAiEmptyPrompt"));
      return;
    }
    if (trimmed.length > MAX_PROMPT_LENGTH) {
      setAiError(t("themeAiPromptTooLong", { max: MAX_PROMPT_LENGTH }));
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/themes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const json = (await res.json()) as { data?: unknown; error?: string; retryAfterSec?: number };
      if (!res.ok) {
        if (res.status === 429) {
          setAiError(t("themeAiRateLimited", { seconds: json.retryAfterSec ?? 5 }));
          return;
        }
        if (res.status >= 500) {
          setAiError(t("themeAiFailed"));
          return;
        }
        setAiError(typeof json.error === "string" ? json.error : t("themeAiFailed"));
        return;
      }
      if (!json.data) {
        setAiError(t("themeAiFailed"));
        return;
      }
      const themeJson = JSON.stringify(json.data);
      const registered = importTheme(themeJson);
      await apply(registered.id);
      applyAppHslVarsToElement(document.documentElement, registered.tokens.colors);
      persistAiHslThemeJson(themeJson);
      setAiPrompt("");
    } catch {
      setAiError(t("themeAiFailed"));
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, apply, importTheme, t]);

  return (
    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-3">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          <Sun className="size-3.5" />
          {t("theme")}
        </span>
        <Select value={mounted ? theme : undefined} onValueChange={setTheme}>
          <SelectTrigger aria-label={t("themeSelectAria")} className="w-[110px] min-w-0">
            <SelectValue placeholder={t("theme")} />
          </SelectTrigger>
          <SelectContent align="end" className="bg-card/95 backdrop-blur-none">
            <SelectGroup>
              <SelectLabel>{t("theme")}</SelectLabel>
              {themes.map(({ value, labelKey, icon: Icon }) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    <Icon className="size-3.5" />
                    {t(labelKey)}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-2 border border-border bg-card/40 p-3 md:max-w-[min(15rem,calc(100vw-12rem))] md:border-0 md:border-l md:border-border md:bg-transparent md:p-0 md:pl-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground md:sr-only">{t("themeAiLabel")}</p>
        <div className="flex min-w-0 gap-1">
          <Input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={t("themeAiPlaceholder")}
            disabled={aiLoading || aiConfigured === false}
            className="h-9 min-w-0 flex-1 text-xs md:h-8"
            maxLength={MAX_PROMPT_LENGTH}
            aria-label={t("themeAiPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void generateFromPrompt();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9 shrink-0 px-2 md:h-8"
            disabled={aiLoading || aiConfigured === false}
            title={t("themeAiGenerate")}
            aria-label={t("themeAiGenerate")}
            onClick={() => void generateFromPrompt()}
          >
            {aiLoading ? (
              <span className="text-[10px] font-mono uppercase tracking-wider">{t("themeAiGenerating")}</span>
            ) : (
              <Sparkles className="size-4" />
            )}
          </Button>
        </div>
        {aiConfigured === false ? (
          <p className="text-[11px] leading-snug text-muted-foreground md:truncate">{t("themeAiNotConfigured")}</p>
        ) : null}
        {aiError ? (
          <p className="text-[11px] leading-snug text-destructive md:line-clamp-2 md:max-h-8 md:overflow-hidden">{aiError}</p>
        ) : null}
      </div>
    </div>
  );
}
