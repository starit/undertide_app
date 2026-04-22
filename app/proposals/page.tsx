import type { Metadata } from "next";
import { listProposals } from "@/lib/repository";
import { ProposalsBrowser } from "@/components/proposals-browser";
import { SectionHeading } from "@/components/section-heading";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Governance Proposals",
  description: "Search and analyze governance proposals across Web3 protocols with structured, readable proposal intelligence.",
  alternates: {
    canonical: "/proposals",
  },
};

export default async function ProposalsPage() {
  const locale = await getServerLocale();
  const copy = getDictionary(locale);
  const proposals = await listProposals({ sort: "time" });

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={copy.proposals.eyebrow}
        title={copy.proposals.title}
        description={copy.proposals.description}
      />
      <div className="mt-10">
        <ProposalsBrowser proposals={proposals} locale={locale} />
      </div>
    </section>
  );
}
