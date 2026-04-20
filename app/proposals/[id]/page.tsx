import { notFound } from "next/navigation";
import { ArrowUpRight, Link2 } from "lucide-react";
import { getProposalById } from "@/lib/repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proposal = await getProposalById(id);

  if (!proposal) notFound();

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-8">
          <div className="border border-border bg-card p-8 shadow-panel">
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">{proposal.protocol}</Badge>
              <Badge>{proposal.status}</Badge>
              <Badge variant={proposal.importance === "Treasury Risk" ? "warning" : "signal"}>{proposal.importance}</Badge>
            </div>
            <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-tight">{proposal.title}</h1>
            <div className="mt-6 grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">Published</p>
                <p className="mt-2">{new Date(proposal.publishedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">Closes</p>
                <p className="mt-2">{new Date(proposal.closesAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">Heat</p>
                <p className="mt-2">{proposal.heat} / 100</p>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>AI Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-8 text-muted-foreground">{proposal.aiSummary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Readable Proposal Content</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-8 text-muted-foreground">{proposal.readableContent}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Key Facts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {proposal.facts.map((fact) => (
                <div key={fact} className="border-l-2 border-[#1d3a32] pl-4 text-sm leading-7 text-muted-foreground">
                  {fact}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk / Importance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {proposal.risks.map((risk) => (
                <div key={risk} className="border-l-2 border-[#9a3412] pl-4 text-sm leading-7 text-muted-foreground">
                  {risk}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source Links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Button variant="outline" asChild>
                <a href={proposal.proposalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                  Original Proposal <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={proposal.discussionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                  Discussion Thread <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Separator />
              <Button variant="ghost" className="justify-start">
                <Link2 className="size-4" />
                Share Summary
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
