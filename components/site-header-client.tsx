"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Waves, X } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
};

export function SiteHeaderClient({
  navItems,
  governanceLabel,
}: {
  navItems: NavItem[];
  governanceLabel: string;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="relative z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-4 md:px-8 md:py-4">
        <Link href="/" className="logo-link flex min-w-0 flex-1 items-center gap-2.5 md:gap-3">
          <div className="logo-icon-box flex size-9 shrink-0 items-center justify-center border border-border bg-brand text-brand-foreground md:size-11">
            <Waves className="logo-icon size-4 md:size-5" />
          </div>
          <div className="flex min-w-0 flex-col overflow-hidden">
            <span className="logo-subtitle hidden truncate font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:block md:text-[11px] md:tracking-[0.28em]">
              {governanceLabel}
            </span>
            <span className="truncate font-serif text-lg leading-none md:text-2xl">UnderTide</span>
          </div>
        </Link>
        <div className="hidden items-center gap-4 md:flex">
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "border px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-border bg-card text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <LocaleSwitcher />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-9 shrink-0 p-0 md:hidden"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
      </div>
      {mobileMenuOpen && (
        <div className="absolute left-0 right-0 top-full z-50 grid gap-3 border-b border-border bg-background/95 p-3 backdrop-blur md:hidden">
          <nav className="grid gap-1">
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "border px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-border bg-card text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <LocaleSwitcher />
        </div>
      )}
    </header>
  );
}

function isNavItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
