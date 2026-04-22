import { cookies } from "next/headers";
import { Locale, UI_LOCALE_COOKIE, isLocale } from "@/lib/i18n";

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(UI_LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}
