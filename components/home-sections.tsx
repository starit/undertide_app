import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Proposal, Space } from "@/lib/types";
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
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.title}>
            <CardHeader className="p-3 pb-2 md:p-4 md:pb-2">
              <CardTitle className="text-base md:text-lg">{entry.title}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
              <Link href={entry.href} className="text-sm leading-5 text-muted-foreground transition-colors hover:text-foreground">
                {entry.description}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export async function FeaturedProposalSection({ proposals }: { proposals: Proposal[] }) {
  const tHome = await getTranslations("home");
  const featured = proposals.slice(0, 2);
  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <SectionHeading
          eyebrow={tHome("featuredProposalsEyebrow")}
          title={tHome("featuredProposalsTitle")}
          description={tHome("featuredProposalsDescription")}
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {featured.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} compact />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProposalBrowseSection({ proposals }: { proposals: Proposal[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <SectionHeading
          eyebrow="More Coverage"
          title="Continue scanning the proposal stream."
          description="Beyond the featured layer, UnderTide keeps routine, strategic, and governance-process proposals discoverable."
        />
        <Button variant="outline" asChild>
          <Link href="/proposals" className="inline-flex items-center gap-2">
            All Proposals <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="mt-8 grid gap-6 md:mt-10 md:grid-cols-2">
        {proposals.slice(3).map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} compact />
        ))}
      </div>
    </section>
  );
}

export async function FeaturedSpacesSection({ spaces }: { spaces: Space[] }) {
  const tHome = await getTranslations("home");
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
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {spaces.slice(0, 3).map((space) => (
            <SpaceCard key={space.slug} space={space} />
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
