"use client";

import { useMemo, useState } from "react";
import { Proposal, Space } from "@/lib/types";
import { ProposalCard } from "@/components/proposal-card";
import { SectionHeading } from "@/components/section-heading";
import { SpaceCard } from "@/components/space-card";
import { Input } from "@/components/ui/input";
import { Locale, getDictionary } from "@/lib/i18n";

export function SearchResults({ proposals, spaces, locale }: { proposals: Proposal[]; spaces: Space[]; locale: Locale }) {
  const copy = getDictionary(locale);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(2);

  const results = useMemo(() => {
    const normalized = query.toLowerCase();
    return {
      proposals: proposals.filter((proposal) =>
        [proposal.title, proposal.protocol, proposal.summary].join(" ").toLowerCase().includes(normalized)
      ),
      spaces: spaces.filter((space) =>
        [space.name, space.summary, space.tagline, ...space.categories].join(" ").toLowerCase().includes(normalized)
      ),
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-12">
      <div className="border border-border bg-card p-5">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search.placeholder} />
      </div>

      <section className="flex flex-col gap-6">
        <SectionHeading
          eyebrow={copy.search.proposalResultsEyebrow}
          title={copy.search.proposalResultsTitle}
          description={copy.search.proposalResultsDescription}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {results.proposals.slice(0, limit).map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} compact locale={locale} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeading
          eyebrow={copy.search.spaceResultsEyebrow}
          title={copy.search.spaceResultsTitle}
          description={copy.search.spaceResultsDescription}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {results.spaces.slice(0, limit).map((space) => (
            <SpaceCard key={space.slug} space={space} locale={locale} />
          ))}
        </div>
      </section>

      {(results.proposals.length > limit || results.spaces.length > limit) && (
        <button
          type="button"
          className="w-fit border border-border px-5 py-3 text-sm font-medium"
          onClick={() => setLimit((value) => value + 2)}
        >
          {copy.search.loadMore}
        </button>
      )}
    </div>
  );
}
