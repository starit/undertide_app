import { Locale, getDictionary } from "@/lib/i18n";

export function SiteFooter({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale);

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p>{copy.footer.summary}</p>
        <p className="font-mono text-xs uppercase tracking-[0.24em]">{copy.footer.methodology}</p>
      </div>
    </footer>
  );
}
