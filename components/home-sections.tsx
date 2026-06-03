import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ChevronRight, Clock, Compass, Search } from "lucide-react";
import { PlatformStats, Proposal, Space } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalCard } from "@/components/proposal-card";
import { SectionHeading } from "@/components/section-heading";
import { SpaceCard } from "@/components/space-card";

export async function QuickEntrySection() {
  const tHome = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const entries = [
    { title: tNav("spaces"), description: tHome("spacesEntryDescription"), href: "/spaces" },
    { title: tNav("proposals"), description: tHome("proposalsEntryDescription"), href: "/proposals" },
    { title: tNav("search"), description: tHome("searchEntryDescription"), href: "/search" },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-7">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground md:text-xs md:tracking-[0.28em]">
          {tHome("quickEntryEyebrow")}
        </span>
        <p className="text-xs leading-5 text-muted-foreground">{tHome("quickEntryDescription")}</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.title}>
            <CardHeader className="p-3 pb-2 md:p-4 md:pb-2">
              <CardTitle className="text-base md:text-lg">
                <Link href={entry.href} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground/80">
                  {entry.title}
                  <ChevronRight className="size-4" />
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <p className="text-sm leading-5 text-muted-foreground">{entry.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export async function ActivityAtAGlance({ stats }: { stats: PlatformStats }) {
  const tHome = await getTranslations("home");
  const tProposals = await getTranslations("proposals");
  const tSpaces = await getTranslations("spaces");

  return (
    <section className="border-y border-border">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <SectionHeading
          eyebrow={tHome("activityAtAGlance")}
          title={tHome("activityDescription")}
          description=""
        />
        <div className="mt-6 grid gap-px border border-border bg-border sm:grid-cols-4">
          {[
            { label: tSpaces("supportedSpaces", { count: stats.spacesCount }), value: stats.spacesCount.toLocaleString() },
            { label: tProposals("supportedProposals", { count: stats.proposalsCount }), value: stats.proposalsCount.toLocaleString() },
            { label: tHome("activeProposals"), value: stats.activeProposalsCount.toLocaleString() },
            { label: tSpaces("verifiedStatus"), value: stats.verifiedSpacesCount.toLocaleString() },
          ].map((stat) => (
            <div key={stat.label} className="bg-background px-4 py-4">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function FeaturedProposalSection({ proposals }: { proposals: Proposal[] }) {
  const tHome = await getTranslations("home");
  const featured = proposals.slice(0, 6);

  return (
    <section className="bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <SectionHeading
          eyebrow={tHome("featuredProposalsEyebrow")}
          title={tHome("featuredProposalsTitle")}
          description={tHome("featuredProposalsDescription")}
        />
        {featured.length === 0 ? (
          <EmptySectionCard message={tHome("emptyProposals")} />
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} compact />
            ))}
          </div>
        )}
        {featured.length > 0 && (
          <div className="mt-6">
            <Button variant="outline" asChild>
              <Link href="/proposals" className="inline-flex items-center gap-2">
                {tHome("browseProposals")} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

export async function FeaturedSpacesSection({ spaces }: { spaces: Space[] }) {
  const tHome = await getTranslations("home");
  const featured = spaces.slice(0, 6);

  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow={tHome("featuredSpacesEyebrow")}
            title={tHome("featuredSpacesTitle")}
            description={tHome("featuredSpacesDescription")}
          />
          <Button variant="outline" asChild>
            <Link href="/spaces">{tHome("allSpaces")}</Link>
          </Button>
        </div>
        {featured.length === 0 ? (
          <EmptySectionCard message={tHome("emptySpaces")} />
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((space) => (
              <SpaceCard key={space.slug} space={space} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export async function CategoryBreakdownSection({ stats }: { stats: PlatformStats }) {
  const tHome = await getTranslations("home");

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow={tHome("categoriesEyebrow")}
            title={tHome("categoriesTitle")}
            description=""
          />
          <Button variant="outline" asChild>
            <Link href="/spaces" className="inline-flex items-center gap-2">
              <Compass className="size-4" /> {tHome("exploreSpaces")}
            </Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {[
            {
              title: "Protocol",
              description: "Core protocol governance",
              href: "/spaces?category=protocol",
            },
            {
              title: "DeFi",
              description: "Lending, DEX, yield protocols",
              href: "/spaces?category=defi",
            },
            {
              title: "Gaming",
              description: "Web3 gaming & metaverse",
              href: "/spaces?category=gaming",
            },
            {
              title: "Service",
              description: "Infrastructure & middleware",
              href: "/spaces?category=service",
            },
            {
              title: "Social",
              description: "Social & community DAOs",
              href: "/spaces?category=social",
            },
            {
              title: "DeFAI",
              description: "AI x DeFi protocols",
              href: "/spaces?category=defai",
            },
            {
              title: "Grant",
              description: "Ecosystem funding DAOs",
              href: "/spaces?category=grant",
            },
            {
              title: "RWA",
              description: "Real-world assets",
              href: "/spaces?category=rwa",
            },
          ].map((category) => (
            <Link key={category.title} href={category.href}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">{category.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{category.description}</p>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function MethodologySection() {
  const tHome = await getTranslations("home");
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <div className="grid gap-6 border border-border bg-card p-5 md:grid-cols-[0.9fr_1.1fr] md:p-8">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">{tHome("methodologyEyebrow")}</span>
          <h2 className="font-serif text-2xl leading-tight md:text-3xl">{tHome("methodologyTitle")}</h2>
        </div>
        <div className="grid gap-4 text-sm leading-6 text-muted-foreground">
          <p>{tHome("methodologyDescriptionOne")}</p>
          <p>{tHome("methodologyDescriptionTwo")}</p>
        </div>
      </div>
    </section>
  );
}

function formatTimeLeft(endTs: number): string {
  const now = Date.now() / 1000;
  const diff = endTs - now;
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

export async function ExpiringProposalsSection({ proposals }: { proposals: Proposal[] }) {
  const tHome = await getTranslations("home");
  const now = Date.now() / 1000;
  const active = proposals.filter((p) => p.endTs && p.endTs > now && p.status === "Active").slice(0, 4);

  return (
    <section className="border-b border-border bg-amber-50/30 dark:bg-amber-950/10">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <SectionHeading
          eyebrow={tHome("expiringEyebrow")}
          title={tHome("expiringTitle")}
          description=""
        />
        {active.length === 0 ? (
          <EmptySectionCard message={tHome("expiringEmpty")} />
        ) : (
          <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {active.map((proposal) => (
              <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                <Card className="h-full transition-colors hover:border-amber-500/50 hover:shadow-sm">
                  <CardHeader className="p-3 pb-1 md:p-4 md:pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      <Clock className="size-3.5" />
                      <span>{proposal.endTs ? formatTimeLeft(proposal.endTs) : "—"}</span>
                    </div>
                    <CardTitle className="mt-1 line-clamp-2 text-sm font-medium leading-snug md:text-base">
                      {proposal.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
                    {proposal.protocol && (
                      <p className="truncate text-xs text-muted-foreground">
                        {proposal.protocol}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
        {active.length > 0 && (
          <div className="mt-6">
            <Button variant="outline" asChild>
              <Link href="/proposals?status=active&sort=expiring" className="inline-flex items-center gap-2">
                {tHome("browseProposals")} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptySectionCard({ message }: { message: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 border border-border bg-card p-10 text-center">
      <Search className="size-8 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
