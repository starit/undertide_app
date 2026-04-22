"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Proposal, Space } from "@/lib/types";
import { ProposalCard } from "@/components/proposal-card";
import { SectionHeading } from "@/components/section-heading";
import { SpaceCard } from "@/components/space-card";
import { Input } from "@/components/ui/input";

const DEFAULT_SEARCH_LIMIT = 6;
const LOAD_MORE_STEP = 4;

export function SearchResults({ proposals, spaces }: { proposals: Proposal[]; spaces: Space[] }) {
  const tSearch = useTranslations("search");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(DEFAULT_SEARCH_LIMIT);
  const [results, setResults] = useState({ proposals, spaces });
  const [isLoading, setIsLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setResults({ proposals, spaces });
  }, [proposals, spaces]);

  useEffect(() => {
    setLimit(DEFAULT_SEARCH_LIMIT);
  }, [deferredQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      limit: String(limit),
      verified: "true",
      sort: "activity",
    });

    if (deferredQuery.trim()) {
      searchParams.set("q", deferredQuery.trim());
    }

    async function loadResults() {
      setIsLoading(true);

      try {
        const [proposalsResponse, spacesResponse] = await Promise.all([
          fetch(`/api/proposals?${searchParams.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(`/api/spaces?${searchParams.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (!proposalsResponse.ok || !spacesResponse.ok) {
          throw new Error(`Search request failed: proposals=${proposalsResponse.status}, spaces=${spacesResponse.status}`);
        }

        const [proposalsJson, spacesJson] = (await Promise.all([
          proposalsResponse.json(),
          spacesResponse.json(),
        ])) as [{ data?: Proposal[] }, { data?: Space[] }];

        if (!controller.signal.aborted) {
          setResults({
            proposals: Array.isArray(proposalsJson.data) ? proposalsJson.data : [],
            spaces: Array.isArray(spacesJson.data) ? spacesJson.data : [],
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[SearchResults] failed to load search results", error);
          setResults({ proposals: [], spaces: [] });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadResults();

    return () => controller.abort();
  }, [deferredQuery, limit]);

  return (
    <div className="flex flex-col gap-12">
      <div className="border border-border bg-card p-5">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tSearch("placeholder")} />
      </div>

      <div className="text-sm text-muted-foreground">
        {isLoading
          ? tSearch("searching")
          : tSearch("loaded", {
              proposals: results.proposals.length,
              spaces: results.spaces.length,
            })}
      </div>

      <section className="flex flex-col gap-6">
        <SectionHeading
          eyebrow={tSearch("proposalResultsEyebrow")}
          title={tSearch("proposalResultsTitle")}
          description={tSearch("proposalResultsDescription")}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {results.proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} compact />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeading
          eyebrow={tSearch("spaceResultsEyebrow")}
          title={tSearch("spaceResultsTitle")}
          description={tSearch("spaceResultsDescription")}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {results.spaces.map((space) => (
            <SpaceCard key={space.slug} space={space} />
          ))}
        </div>
      </section>

      {(results.proposals.length >= limit || results.spaces.length >= limit) && (
        <button
          type="button"
          className="w-fit border border-border px-5 py-3 text-sm font-medium"
          onClick={() => setLimit((value) => value + LOAD_MORE_STEP)}
        >
          {tSearch("loadMore")}
        </button>
      )}
    </div>
  );
}
