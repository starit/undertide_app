import { Hero } from "@/components/hero";
import {
  FeaturedProposalSection,
  FeaturedSpacesSection,
  MethodologySection,
  ProposalBrowseSection,
  QuickEntrySection,
} from "@/components/home-sections";

export default function HomePage() {
  return (
    <>
      <Hero />
      <QuickEntrySection />
      <FeaturedProposalSection />
      <ProposalBrowseSection />
      <FeaturedSpacesSection />
      <MethodologySection />
    </>
  );
}
