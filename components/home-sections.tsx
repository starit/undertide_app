import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Proposal, Space } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalCard } from "@/components/proposal-card";
import { SectionHeading } from "@/components/section-heading";
import { SpaceCard } from "@/components/space-card";
import { Locale, getDictionary } from "@/lib/i18n";

export function QuickEntrySection({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale);
  const entries = [
    { title: copy.nav.spaces, description: copy.home.spacesEntryDescription, href: "/spaces" },
    { title: copy.nav.proposals, description: copy.home.proposalsEntryDescription, href: "/proposals" },
    { title: copy.nav.search, description: copy.home.searchEntryDescription, href: "/search" },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <SectionHeading
        eyebrow={copy.home.quickEntryEyebrow}
        title={copy.home.quickEntryTitle}
        description={copy.home.quickEntryDescription}
      />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.title}>
            <CardHeader className="p-5">
              <CardTitle className="text-xl">{entry.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              <p className="text-sm leading-6 text-muted-foreground">{entry.description}</p>
              <Link href={entry.href} className="inline-flex items-center gap-2 text-sm font-medium">
                {copy.home.open} {entry.title} <ChevronRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function FeaturedProposalSection({ proposals, locale }: { proposals: Proposal[]; locale: Locale }) {
  const copy = getDictionary(locale);
  const featured = proposals.slice(0, 2);
  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <SectionHeading
          eyebrow={copy.home.featuredProposalsEyebrow}
          title={copy.home.featuredProposalsTitle}
          description={copy.home.featuredProposalsDescription}
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {featured.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} compact locale={locale} />
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
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {proposals.slice(3).map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} compact />
        ))}
      </div>
    </section>
  );
}

export function FeaturedSpacesSection({ spaces, locale }: { spaces: Space[]; locale: Locale }) {
  const copy = getDictionary(locale);
  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow={copy.home.featuredSpacesEyebrow}
            title={copy.home.featuredSpacesTitle}
            description={copy.home.featuredSpacesDescription}
          />
          <Button variant="outline" asChild>
            <Link href="/spaces">{copy.home.allSpaces}</Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {spaces.slice(0, 3).map((space) => (
            <SpaceCard key={space.slug} space={space} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function MethodologySection({ locale }: { locale: Locale }) {
  const copy = getDictionary(locale);
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
      <div className="grid gap-6 border border-border bg-card p-6 md:grid-cols-[0.9fr_1.1fr] md:p-8">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">{copy.home.methodologyEyebrow}</span>
          <h2 className="font-serif text-3xl leading-tight">{copy.home.methodologyTitle}</h2>
        </div>
        <div className="grid gap-4 text-sm leading-6 text-muted-foreground">
          <p>{copy.home.methodologyDescriptionOne}</p>
          <p>{copy.home.methodologyDescriptionTwo}</p>
        </div>
      </div>
    </section>
  );
}
