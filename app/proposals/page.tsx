import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPlatformStats, listProposals } from "@/lib/repository";
import { getServerLocale } from "@/lib/i18n-server";
import { ProposalsBrowser } from "@/components/proposals-browser";
import { SectionHeading } from "@/components/section-heading";

const INITIAL_PROPOSAL_LIMIT = 24;

export const metadata: Metadata = {
  title: "Governance Proposals",
  description: "Search and analyze governance proposals across Web3 protocols with structured, readable proposal intelligence.",
  alternates: {
    canonical: "/proposals",
  },
};

export default async function ProposalsPage() {
  const tProposals = await getTranslations("proposals");
  const locale = await getServerLocale();
  const [proposals, stats] = await Promise.all([
    listProposals({ sort: "time", limit: INITIAL_PROPOSAL_LIMIT, locale }),
    getPlatformStats(),
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={tProposals("eyebrow")}
        title={tProposals("title")}
        description={tProposals("description")}
      />
      <div className="mt-10">
        <ProposalsBrowser proposals={proposals} totalProposalsCount={stats.proposalsCount} />
      </div>
    </section>
  );
}
