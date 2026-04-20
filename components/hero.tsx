import Link from "next/link";
import { Compass, Languages, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const points = [
  {
    title: "Cross-protocol monitoring",
    description: "Track governance activity across major DAO spaces without jumping between forums and Snapshot pages.",
    icon: Compass,
  },
  {
    title: "Readable proposal intelligence",
    description: "Translate governance language into structured summaries, key facts, and participation context.",
    icon: Languages,
  },
  {
    title: "Risk-aware scanning",
    description: "Surface treasury, execution, and strategic governance proposals that deserve closer delegate attention.",
    icon: ShieldCheck,
  },
];

export function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.25fr_0.75fr] md:px-8 md:py-16">
        <div className="relative overflow-hidden border border-border bg-card p-8 shadow-panel md:p-12">
          <div className="absolute inset-0 bg-grid bg-[size:28px_28px] opacity-30" />
          <div className="relative flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Governance Radar for Serious Operators</span>
              <h1 className="max-w-4xl font-serif text-5xl leading-[1.02] md:text-7xl">
                UnderTide reads the hidden current beneath Web3 governance.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Aggregate DAO proposals, governance spaces, and AI-assisted context into one product-grade workflow for scanning, understanding, and participating.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/proposals">Browse Proposals</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/spaces">Explore Spaces</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/search" className="inline-flex items-center gap-2">
                  Search Everything <Search className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-px border border-border bg-border">
          {points.map((point) => (
            <div key={point.title} className="flex gap-4 bg-background p-6">
              <point.icon className="mt-1 size-5 text-[#1d3a32]" />
              <div className="flex flex-col gap-2">
                <h2 className="font-serif text-2xl">{point.title}</h2>
                <p className="text-sm leading-7 text-muted-foreground">{point.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
