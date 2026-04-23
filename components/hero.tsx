import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bot, Compass, Languages, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformStats } from "@/lib/types";

type HeroProps = {
  stats: PlatformStats;
};

export async function Hero({ stats }: HeroProps) {
  const tHome = await getTranslations("home");
  const heroStats = [
    { label: tHome("trackedSpaces"), value: stats.spacesCount.toLocaleString() },
    { label: tHome("proposalSignals"), value: stats.proposalsCount.toLocaleString() },
    { label: tHome("activeProposals"), value: stats.activeProposalsCount.toLocaleString() },
  ];

  const points = [
    {
      title: tHome("crossProtocolMonitoring"),
      description: tHome("crossProtocolMonitoringDescription"),
      icon: Compass,
    },
    {
      title: tHome("readableProposalIntelligence"),
      description: tHome("readableProposalIntelligenceDescription"),
      icon: Languages,
    },
    {
      title: tHome("aiAgentFriendly"),
      description: tHome("aiAgentFriendlyDescription"),
      icon: Bot,
    },
  ];

  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:grid-cols-[1.25fr_0.75fr] md:gap-6 md:px-8 md:py-8">
        <div className="relative overflow-hidden border border-border bg-card p-5 shadow-panel md:p-8">
          <div className="absolute inset-0 bg-grid bg-[size:28px_28px] opacity-30" />
          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground md:text-xs md:tracking-[0.3em]">{tHome("heroEyebrow")}</span>
              <h1 className="max-w-4xl font-serif text-[2.25rem] leading-[1.02] md:text-6xl">
                {tHome("heroTitle")}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                {tHome("heroDescription")}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/proposals">{tHome("browseProposals")}</Link>
              </Button>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/spaces">{tHome("exploreSpaces")}</Link>
              </Button>
              <Button variant="ghost" asChild className="w-full sm:w-auto">
                <Link href="/search" className="inline-flex items-center gap-2">
                  {tHome("searchEverything")} <Search className="size-4" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
              {heroStats.map((stat) => (
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
            <div key={point.title} className="flex gap-3 bg-background p-4 md:p-5">
              <point.icon className="mt-0.5 size-5 shrink-0 text-brand" />
              <div className="flex flex-col gap-1.5">
                <h2 className="font-serif text-lg md:text-xl">{point.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{point.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
