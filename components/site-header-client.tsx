"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waves } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
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

  return (
    <header className="border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-3 md:px-8 md:py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center border border-border bg-[#1d3a32] text-[#f4efe6] md:size-11">
              <Waves className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground md:text-[11px] md:tracking-[0.28em]">
                {governanceLabel}
              </span>
              <span className="font-serif text-xl leading-none md:text-2xl">UnderTide</span>
            </div>
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            <nav className="flex items-center gap-2">
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
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "shrink-0 whitespace-nowrap border px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "border-border bg-card text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}

function isNavItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
