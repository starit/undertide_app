import type { Metadata } from "next";
import { X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About UnderTide",
  description:
    "UnderTide is built for AI, agents, and their users, delivering richer Web3 governance context for deeper analysis, better participation, and greater transparency.",
  alternates: {
    canonical: "/about",
  },
};

export default async function AboutPage() {
  const tAbout = await getTranslations("about");

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={tAbout("eyebrow")}
        title={tAbout("title")}
        description={tAbout("description")}
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{tAbout("mission")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {tAbout("missionDescription")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tAbout("methodology")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {tAbout("methodologyDescription")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tAbout("community")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {tAbout("communityDescription")}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 border border-border bg-card p-5 md:grid-cols-2 md:p-8">
        <div>
          <h2 className="font-serif text-2xl md:text-3xl">{tAbout("supportContact")}</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {tAbout("supportContactDescription")}
          </p>
        </div>
        <div className="grid gap-4 text-sm">
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tAbout("communityChannels")}</p>
            <p className="mt-2">
              <a
                href="https://x.com/UnderTide_xyz"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-foreground"
              >
                <span className="inline-flex size-4 items-center justify-center rounded-full border border-border">
                  <X className="size-2.5" />
                </span>
                @UnderTide_xyz
              </a>
            </p>
          </div>
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tAbout("donate")}</p>
            <p className="mt-2">{tAbout("donateValue")}</p>
          </div>
          <div className="border border-border p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{tAbout("contact")}</p>
            <p className="mt-2">
              <a href="mailto:hello@undertide.xyz" className="underline underline-offset-4 hover:text-foreground">
                hello@undertide.xyz
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
