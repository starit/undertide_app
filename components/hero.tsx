import Link from "next/link";
import { Compass, Languages, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const stats = [
  { label: "Tracked Spaces", value: "120+" },
  { label: "Proposal Signals", value: "4.8k" },
  { label: "Readable Briefs", value: "Multi-lang" },
];

const points = [
  {
    title: "Cross-protocol monitoring",
    description: "Track major DAO spaces without hopping between forums and voting pages.",
    icon: Compass,
  },
  {
    title: "Readable proposal intelligence",
    description: "Turn governance text into summaries, facts, and decision context.",
    icon: Languages,
  },
  {
    title: "Risk-aware scanning",
    description: "Surface treasury, execution, and strategic proposals that deserve attention.",
    icon: ShieldCheck,
  },
];

export function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[1.25fr_0.75fr] md:px-8 md:py-8">
        <div className="relative overflow-hidden border border-border bg-card p-6 shadow-panel md:p-8">
          <div className="absolute inset-0 bg-grid bg-[size:28px_28px] opacity-30" />
          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Governance Radar for Serious Operators</span>
              <h1 className="max-w-4xl font-serif text-4xl leading-[1.02] md:text-6xl">
                UnderTide reads the hidden current beneath Web3 governance.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
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
            <div className="grid gap-px border border-border bg-border md:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-background px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 font-serif text-2xl">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-px border border-border bg-border">
          {points.map((point) => (
            <div key={point.title} className="flex gap-3 bg-background p-4">
              <point.icon className="mt-1 size-5 text-[#1d3a32]" />
              <div className="flex flex-col gap-1.5">
                <h2 className="font-serif text-xl">{point.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{point.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
