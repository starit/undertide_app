import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const tFooter = await getTranslations("footer");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p>{tFooter("summary")}</p>
        <p className="font-mono text-xs uppercase tracking-[0.24em]">{tFooter("methodology")}</p>
      </div>
    </footer>
  );
}
