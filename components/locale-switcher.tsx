"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent } from "react";
import { Languages } from "lucide-react";
import { Locale, localeLabels, locales, UI_LOCALE_COOKIE } from "@/lib/i18n";

type Props = {
  currentLocale: Locale;
  label: string;
};

export function LocaleSwitcher({ currentLocale, label }: Props) {
  const router = useRouter();

  function handleLocaleChange(nextLocale: Locale) {
    document.cookie = `${UI_LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    handleLocaleChange(event.target.value as Locale);
  }

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        <Languages className="size-3.5" />
        {label}
      </span>
      <select
        aria-label={label}
        value={currentLocale}
        onChange={handleChange}
        className="min-w-0 border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {localeLabels[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
