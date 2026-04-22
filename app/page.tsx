import type { Metadata } from "next";
import { getPlatformStats, listProposals, listSpaces } from "@/lib/repository";
import { Hero } from "@/components/hero";
import {
  FeaturedProposalSection,
  FeaturedSpacesSection,
  MethodologySection,
  QuickEntrySection,
} from "@/components/home-sections";

export const metadata: Metadata = {
  title: "Web3 Governance Intelligence",
  description: "Monitor DAO proposals, governance spaces, and AI-assisted decision context from a single Web3 governance dashboard.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "UnderTide | Web3 Governance Intelligence",
    description: "Monitor DAO proposals, governance spaces, and AI-assisted decision context from a single Web3 governance dashboard.",
    url: "https://undertide.xyz",
  },
};

export default async function HomePage() {
  const [stats, proposals, spaces] = await Promise.all([
    getPlatformStats(),
    listProposals({ sort: "time", limit: 2 }),
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
