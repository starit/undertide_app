import { ProposalsBrowser } from "@/components/proposals-browser";
import { SectionHeading } from "@/components/section-heading";

export default function ProposalsPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <SectionHeading
        eyebrow="Proposals"
        title="Browse governance proposals across protocols."
        description="Search, filter, sort, and switch reading modes to move from high-level scanning into detailed proposal analysis."
      />
      <div className="mt-10">
        <ProposalsBrowser />
      </div>
    </section>
  );
}
