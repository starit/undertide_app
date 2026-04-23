import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { getSpaceBySlug, listSpaceProposals } from "@/lib/repository";
import { ProposalsBrowser } from "@/components/proposals-browser";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const tSpaces = await getTranslations("spaces");
  const { slug } = await params;
  const [space, proposals] = await Promise.all([getSpaceBySlug(slug), listSpaceProposals(slug, { sort: "time" })]);

  if (!space) notFound();

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
        <div className="border border-border bg-card p-5 shadow-panel md:p-8">
          <div className="flex items-start gap-4">
            <Avatar className="size-12 shrink-0 md:size-14">
              {space.avatar ? <AvatarImage src={space.avatar} alt={space.name} /> : null}
              <AvatarFallback>{space.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <h1 className="text-balance font-serif text-3xl leading-tight md:text-5xl">{space.name}</h1>
                {space.verified ? <BadgeCheck className="size-5 shrink-0 text-info" /> : null}
              </div>
              <p className="mt-2 break-all font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:text-xs md:tracking-[0.24em]">{space.slug}</p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">{space.summary}</p>
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
            <CardTitle>{tSpaces("governanceProfile")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tSpaces("followersLabel")}</p>
                <p className="mt-2 text-xl font-semibold">{space.followers.toLocaleString()}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tSpaces("activity")}</p>
                <p className="mt-2 text-xl font-semibold">{space.activityScore} / 100</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tSpaces("proposalsLabel")}</p>
                <p className="mt-2 text-xl font-semibold">{space.proposals}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tSpaces("verification")}</p>
                <p className="mt-2 text-xl font-semibold">{space.verified ? tSpaces("verifiedStatus") : tSpaces("unverifiedStatus")}</p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href={space.website} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                {tSpaces("officialSite")} <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={space.forum} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                {tSpaces("governanceForum")} <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 md:mt-12">
        <div className="mb-6 flex flex-col gap-2 md:mb-8 md:gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground md:text-xs md:tracking-[0.28em]">
            {tSpaces("proposalListEyebrow")}
          </span>
          <h2 className="font-serif text-[1.7rem] md:text-4xl">{tSpaces("proposalListTitle")}</h2>
        </div>
        <ProposalsBrowser proposals={proposals} initialSpaceSlug={space.slug} />
      </div>
    </section>
  );
}
