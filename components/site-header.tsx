import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "@/components/locale-switcher";

export async function SiteHeader() {
  const tNav = await getTranslations("nav");
  const navItems = [
    { href: "/", label: tNav("home") },
    { href: "/spaces", label: tNav("spaces") },
    { href: "/proposals", label: tNav("proposals") },
    { href: "/search", label: tNav("search") },
    { href: "/about", label: tNav("about") },
  ];

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center border border-border bg-[#1d3a32] text-[#f4efe6]">
              <Waves className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{tNav("governanceIntelligence")}</span>
              <span className="font-serif text-2xl leading-none">UnderTide</span>
            </div>
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            <nav className="flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn("border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground")}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <LocaleSwitcher />
          </div>
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
