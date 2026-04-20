import { SearchResults } from "@/components/search-results";
import { SectionHeading } from "@/components/section-heading";

export default function SearchPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="Search"
        title="Unified discovery across proposals and spaces."
        description="Search governance topics, protocols, risk themes, and proposal content from one interface."
      />
      <div className="mt-10">
        <SearchResults />
      </div>
    </section>
  );
}
