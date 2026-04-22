import Link from "next/link";
import { Compass, Languages, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Locale, getDictionary } from "@/lib/i18n";

export function Hero({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale);
  const stats = [
    { label: copy.home.trackedSpaces, value: "120+" },
    { label: copy.home.proposalSignals, value: "4.8k" },
    { label: copy.home.readableBriefs, value: copy.home.multiLang },
  ];

  const points = [
    {
      title: copy.home.crossProtocolMonitoring,
      description: copy.home.crossProtocolMonitoringDescription,
      icon: Compass,
    },
    {
      title: copy.home.readableProposalIntelligence,
      description: copy.home.readableProposalIntelligenceDescription,
      icon: Languages,
    },
    {
      title: copy.home.riskAwareScanning,
      description: copy.home.riskAwareScanningDescription,
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[1.25fr_0.75fr] md:px-8 md:py-8">
        <div className="relative overflow-hidden border border-border bg-card p-6 shadow-panel md:p-8">
          <div className="absolute inset-0 bg-grid bg-[size:28px_28px] opacity-30" />
          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">{copy.home.heroEyebrow}</span>
              <h1 className="max-w-4xl font-serif text-4xl leading-[1.02] md:text-6xl">
                {copy.home.heroTitle}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                {copy.home.heroDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/proposals">{copy.home.browseProposals}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/spaces">{copy.home.exploreSpaces}</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/search" className="inline-flex items-center gap-2">
                  {copy.home.searchEverything} <Search className="size-4" />
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
