import { getRequestConfig } from "next-intl/server";
import { getServerLocale } from "@/lib/i18n-server";
import { getMessagesForLocale } from "@/lib/i18n";

export default getRequestConfig(async () => {
  const locale = await getServerLocale();

  return {
    locale,
    messages: getMessagesForLocale(locale),
  };
});
