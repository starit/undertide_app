import Link from "next/link";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/spaces", label: "Spaces" },
  { href: "/proposals", label: "Proposals" },
  { href: "/search", label: "Search" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center border border-border bg-[#1d3a32] text-[#f4efe6]">
              <Waves className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Governance Intelligence</span>
              <span className="font-serif text-2xl leading-none">UnderTide</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
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
        </div>
        <nav className="flex flex-wrap gap-2 md:hidden">
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
      </div>
    </header>
  );
}
