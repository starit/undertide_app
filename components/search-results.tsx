"use client";

import { useMemo, useState } from "react";
import { Proposal, Space } from "@/lib/types";
import { ProposalCard } from "@/components/proposal-card";
import { SectionHeading } from "@/components/section-heading";
import { SpaceCard } from "@/components/space-card";
import { Input } from "@/components/ui/input";

export function SearchResults({ proposals, spaces }: { proposals: Proposal[]; spaces: Space[] }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(2);

  const results = useMemo(() => {
    const normalized = query.toLowerCase();
    return {
      proposals: proposals.filter((proposal) =>
        [proposal.title, proposal.protocol, proposal.summary, proposal.aiSummary].join(" ").toLowerCase().includes(normalized)
      ),
      spaces: spaces.filter((space) =>
        [space.name, space.summary, space.tagline, ...space.categories].join(" ").toLowerCase().includes(normalized)
      ),
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-12">
      <div className="border border-border bg-card p-5">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals, spaces, topics, or governance themes..." />
      </div>

      <section className="flex flex-col gap-6">
        <SectionHeading
          eyebrow="Proposal Results"
          title="Proposal matches"
          description="Mixed search surfaces proposal titles, summaries, and AI-generated context."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {results.proposals.slice(0, limit).map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} compact />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeading
          eyebrow="Space Results"
          title="Governance space matches"
          description="Search also spans verified protocol governance spaces and their category metadata."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {results.spaces.slice(0, limit).map((space) => (
            <SpaceCard key={space.slug} space={space} />
          ))}
        </div>
      </section>

      {(results.proposals.length > limit || results.spaces.length > limit) && (
        <button
          type="button"
          className="w-fit border border-border px-5 py-3 text-sm font-medium"
          onClick={() => setLimit((value) => value + 2)}
        >
          Load More
        </button>
      )}
    </div>
  );
}
