import type { Metadata } from "next";
import { getPlatformStats, listProposals, listSpaces } from "@/lib/repository";
import { getServerLocale } from "@/lib/i18n-server";
import { Hero } from "@/components/hero";
import {
  FeaturedProposalSection,
  FeaturedSpacesSection,
  MethodologySection,
  QuickEntrySection,
} from "@/components/home-sections";

export const metadata: Metadata = {
  title: "UnderTide | AI-Native Web3 Governance Context",
  description:
    "Built for AI, agents, and their users. UnderTide aggregates Web3 governance context to enable deeper analysis, stronger participation, and greater transparency.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "UnderTide | AI-Native Web3 Governance Context",
    description:
      "Built for AI, agents, and their users. UnderTide aggregates Web3 governance context to enable deeper analysis, stronger participation, and greater transparency.",
    url: "https://undertide.xyz",
  },
};

export default async function HomePage() {
  const locale = await getServerLocale();
  const [stats, proposals, spaces] = await Promise.all([
    getPlatformStats(),
    listProposals({ sort: "time", limit: 2, locale }),
    listSpaces({ sort: "activity", limit: 3 }),
  ]);

  return (
    <>
      <Hero stats={stats} />
      <QuickEntrySection />
      <FeaturedProposalSection proposals={proposals} />
      <FeaturedSpacesSection spaces={spaces} />
      <MethodologySection />
    </>
  );
}
