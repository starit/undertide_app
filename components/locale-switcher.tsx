"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { Locale, localeLabels, locales, UI_LOCALE_COOKIE } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LocaleSwitcher() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("nav");

  function handleLocaleChange(nextLocale: Locale) {
    document.cookie = `${UI_LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        <Languages className="size-3.5" />
        {t("language")}
      </span>
      <Select value={locale} onValueChange={(value) => handleLocaleChange(value as Locale)}>
        <SelectTrigger aria-label={t("language")} className="w-[132px] min-w-0">
          <SelectValue placeholder={localeLabels[locale]} />
        </SelectTrigger>
        <SelectContent align="end" className="bg-card/95 backdrop-blur-none">
          <SelectGroup>
            <SelectLabel>{t("language")}</SelectLabel>
            {locales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {localeLabels[locale]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
