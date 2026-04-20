import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { proposals, spaces } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalCard } from "@/components/proposal-card";
import { SectionHeading } from "@/components/section-heading";
import { SpaceCard } from "@/components/space-card";

export function QuickEntrySection() {
  const entries = [
    { title: "Spaces", description: "Protocol governance hubs, activity signals, and discovery.", href: "/spaces" },
    { title: "Proposals", description: "Search and sort active, upcoming, and executed governance proposals.", href: "/proposals" },
    { title: "Search", description: "Unified discovery across protocol spaces and proposal archives.", href: "/search" },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
      <SectionHeading
        eyebrow="Quick Entry"
        title="Start from the layer you need."
        description="Some users begin with a protocol, others with a high-signal vote. UnderTide supports both navigation patterns."
      />
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.title}>
            <CardHeader>
              <CardTitle>{entry.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <p className="text-sm leading-7 text-muted-foreground">{entry.description}</p>
              <Link href={entry.href} className="inline-flex items-center gap-2 text-sm font-medium">
                Open {entry.title} <ChevronRight className="size-4" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function FeaturedProposalSection() {
  const featured = proposals.slice(0, 3);
  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <SectionHeading
          eyebrow="Featured Proposals"
          title="What likely matters this week."
          description="A curated view of governance events with the strongest treasury, protocol, or strategic implications."
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {featured.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProposalBrowseSection() {
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

export function FeaturedSpacesSection() {
  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="Featured Spaces"
            title="Protocol governance hubs worth following."
            description="Track verified governance spaces, follower scale, activity, and their proposal histories in one place."
          />
          <Button variant="outline" asChild>
            <Link href="/spaces">All Spaces</Link>
          </Button>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {spaces.map((space) => (
            <SpaceCard key={space.slug} space={space} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function MethodologySection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
      <div className="grid gap-8 border border-border bg-card p-8 md:grid-cols-[1fr_1.2fr] md:p-12">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">Trust + Methodology</span>
          <h2 className="font-serif text-4xl leading-tight">Structured aggregation, not opaque opinion.</h2>
        </div>
        <div className="grid gap-6 text-sm leading-7 text-muted-foreground">
          <p>UnderTide aggregates proposals and governance space metadata, then adds readable AI summaries and structured tags to improve scanning efficiency.</p>
          <p>Risk and importance labels are interpretive cues, not investment advice. Original proposal pages and discussion links remain first-class sources throughout the product.</p>
        </div>
      </div>
    </section>
  );
}
