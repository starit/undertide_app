import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="About"
        title="Why UnderTide exists."
        description="UnderTide is built for users who need governance context quickly: delegates, researchers, contributors, and protocol operators."
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              Make governance activity legible across Web3 protocols by turning fragmented proposal streams into a structured intelligence workflow.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Methodology</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              Aggregate source proposals and governance-space metadata, then layer AI summaries, translated prose, risk labels, and decision-support fields.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Community</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              Follow the project, suggest new spaces, support development, or send governance datasets and feedback to the UnderTide team.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 border border-border bg-card p-8 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-3xl">Support + Contact</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Governance data suggestions, partnerships, and media inquiries can be routed through the UnderTide community inbox.
          </p>
        </div>
        <div className="grid gap-4 text-sm">
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Community</p>
            <p className="mt-2">X / Farcaster / governance research circles</p>
          </div>
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Donate / Support</p>
            <p className="mt-2">Sponsor coverage, open data work, or research tooling.</p>
          </div>
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Contact</p>
            <p className="mt-2">hello@undertide.xyz</p>
          </div>
        </div>
      </div>
    </section>
  );
}
