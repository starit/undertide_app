import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { getSpaceBySlug, listSpaceProposals } from "@/lib/repository";
import { ProposalsBrowser } from "@/components/proposals-browser";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const space = await getSpaceBySlug(slug);

  if (!space) {
    return {
      title: "Space Not Found",
    };
  }

  return {
    title: `${space.name} Governance Space`,
    description: space.summary,
    alternates: {
      canonical: `/spaces/${space.slug}`,
    },
    openGraph: {
      title: `${space.name} Governance Space | UnderTide`,
      description: space.summary,
      url: `https://undertide.xyz/spaces/${space.slug}`,
    },
  };
}

export default async function SpaceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await getServerLocale();
  const copy = getDictionary(locale);
  const { slug } = await params;
  const [space, proposals] = await Promise.all([getSpaceBySlug(slug), listSpaceProposals(slug, { sort: "time" })]);

  if (!space) notFound();

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
        <div className="border border-border bg-card p-8 shadow-panel">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              {space.avatar ? <AvatarImage src={space.avatar} alt={space.name} /> : null}
              <AvatarFallback>{space.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="font-serif text-5xl leading-tight">{space.name}</h1>
                {space.verified ? <BadgeCheck className="size-5 text-[#1d3a32]" /> : null}
              </div>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">{space.slug}</p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">{space.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {space.categories.map((category) => (
              <Badge key={category} variant="muted">
                {category}
              </Badge>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{copy.spaces.governanceProfile}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.spaces.followersLabel}</p>
                <p className="mt-2 text-xl font-semibold">{space.followers.toLocaleString()}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.spaces.activity}</p>
                <p className="mt-2 text-xl font-semibold">{space.activityScore} / 100</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.spaces.proposalsLabel}</p>
                <p className="mt-2 text-xl font-semibold">{space.proposals}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.spaces.verification}</p>
                <p className="mt-2 text-xl font-semibold">{space.verified ? copy.spaces.verifiedStatus : copy.spaces.unverifiedStatus}</p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href={space.website} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                {copy.spaces.officialSite} <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={space.forum} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                {copy.spaces.governanceForum} <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12">
        <div className="mb-8 flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">{copy.spaces.proposalListEyebrow}</span>
          <h2 className="font-serif text-4xl">{copy.spaces.proposalListTitle}</h2>
        </div>
        <ProposalsBrowser proposals={proposals} initialSpaceSlug={space.slug} locale={locale} />
      </div>
    </section>
  );
}
