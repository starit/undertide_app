import { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Locale } from "@/lib/i18n";

export function PageShell({ children, locale }: { children: ReactNode; locale: Locale }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader locale={locale} />
      <main>{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
