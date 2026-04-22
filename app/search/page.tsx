import type { Metadata } from "next";
import { listProposals, listSpaces } from "@/lib/repository";
import { SearchResults } from "@/components/search-results";
import { SectionHeading } from "@/components/section-heading";
import { getDictionary } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Search Governance Data",
  description: "Search Web3 governance proposals, protocol spaces, and governance themes from one unified interface.",
  alternates: {
    canonical: "/search",
  },
};

export default async function SearchPage() {
  const locale = await getServerLocale();
  const copy = getDictionary(locale);
  const [proposals, spaces] = await Promise.all([listProposals({ sort: "time" }), listSpaces({ sort: "activity" })]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow={copy.search.eyebrow}
        title={copy.search.title}
        description={copy.search.description}
      />
      <div className="mt-10">
        <SearchResults proposals={proposals} spaces={spaces} locale={locale} />
      </div>
    </section>
  );
}
