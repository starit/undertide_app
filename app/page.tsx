import { listProposals, listSpaces } from "@/lib/repository";
import { Hero } from "@/components/hero";
import {
  FeaturedProposalSection,
  FeaturedSpacesSection,
  MethodologySection,
  QuickEntrySection,
} from "@/components/home-sections";

export default async function HomePage() {
  const [proposals, spaces] = await Promise.all([
    listProposals({ sort: "time", limit: 2 }),
    listSpaces({ sort: "activity", limit: 3 }),
  ]);

  return (
    <>
      <Hero />
      <QuickEntrySection />
      <FeaturedProposalSection proposals={proposals} />
      <FeaturedSpacesSection spaces={spaces} />
      <MethodologySection />
    </>
  );
}
