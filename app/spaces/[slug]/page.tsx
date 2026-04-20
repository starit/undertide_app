import { notFound } from "next/navigation";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { getSpace } from "@/lib/data";
import { ProposalsBrowser } from "@/components/proposals-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SpaceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const space = getSpace(slug);

  if (!space) notFound();

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
        <div className="border border-border bg-card p-8 shadow-panel">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-5xl leading-tight">{space.name}</h1>
            {space.verified ? <BadgeCheck className="size-5 text-[#1d3a32]" /> : null}
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
            <CardTitle>Governance Profile</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Followers</p>
                <p className="mt-2 text-xl font-semibold">{space.followers.toLocaleString()}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Activity</p>
                <p className="mt-2 text-xl font-semibold">{space.activityScore} / 100</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Proposals</p>
                <p className="mt-2 text-xl font-semibold">{space.proposals}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Verification</p>
                <p className="mt-2 text-xl font-semibold">{space.verified ? "Verified" : "Unverified"}</p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href={space.website} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                Official Site <ArrowUpRight className="size-4" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={space.forum} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                Governance Forum <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-12">
        <div className="mb-8 flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">Proposal List</span>
          <h2 className="font-serif text-4xl">Proposals in this space</h2>
        </div>
        <ProposalsBrowser initialSpaceSlug={space.slug} />
      </div>
    </section>
  );
}
