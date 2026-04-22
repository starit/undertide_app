import type { Metadata } from "next";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "About UnderTide",
  description: "Learn how UnderTide aggregates Web3 governance data, builds readable context, and supports DAO decision-making.",
  alternates: {
    canonical: "/about",
  },
};

export default async function AboutPage() {
  const locale = await getServerLocale();
  const copy = getDictionary(locale);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={copy.about.eyebrow}
        title={copy.about.title}
        description={copy.about.description}
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{copy.about.mission}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {copy.about.missionDescription}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{copy.about.methodology}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {copy.about.methodologyDescription}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{copy.about.community}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {copy.about.communityDescription}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 border border-border bg-card p-8 md:grid-cols-2">
        <div>
          <h2 className="font-serif text-3xl">{copy.about.supportContact}</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {copy.about.supportContactDescription}
          </p>
        </div>
        <div className="grid gap-4 text-sm">
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.about.communityChannels}</p>
            <p className="mt-2">{copy.about.communityChannelsValue}</p>
          </div>
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.about.donate}</p>
            <p className="mt-2">{copy.about.donateValue}</p>
          </div>
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{copy.about.contact}</p>
            <p className="mt-2">hello@undertide.xyz</p>
          </div>
        </div>
      </div>
    </section>
  );
}
