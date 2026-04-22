import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listProposals, listSpaces } from "@/lib/repository";
import { SearchResults } from "@/components/search-results";
import { SectionHeading } from "@/components/section-heading";

const INITIAL_SEARCH_LIMIT = 6;

export const metadata: Metadata = {
  title: "Search Governance Data",
  description: "Search Web3 governance proposals, protocol spaces, and governance themes from one unified interface.",
  alternates: {
    canonical: "/search",
  },
};

export default async function SearchPage() {
  const tSearch = await getTranslations("search");
  const [proposals, spaces] = await Promise.all([
    listProposals({ sort: "time", limit: INITIAL_SEARCH_LIMIT }),
    listSpaces({ sort: "activity", verified: true, limit: INITIAL_SEARCH_LIMIT }),
  ]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={tSearch("eyebrow")}
        title={tSearch("title")}
        description={tSearch("description")}
      />
      <div className="mt-10">
        <SearchResults proposals={proposals} spaces={spaces} />
      </div>
    </section>
  );
}
