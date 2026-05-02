"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LayoutGrid, List, Search } from "lucide-react";
import { Proposal, ProposalStatus } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setProposalView } from "@/store/ui-slice";
import { ProposalCard } from "@/components/proposal-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const statusOptions: Array<ProposalStatus | "All"> = ["All", "Active", "Upcoming", "Closed", "Executed"];
const sortOptions = ["Time", "Heat"] as const;
const DEFAULT_PROPOSAL_LIMIT = 24;
const LOAD_MORE_STEP = 12;

export function ProposalsBrowser({
  proposals,
  initialSpaceSlug,
  totalProposalsCount,
}: {
  proposals: Proposal[];
  initialSpaceSlug?: string;
  totalProposalsCount?: number;
}) {
  const dispatch = useAppDispatch();
  const view = useAppSelector((state) => state.ui.proposalView);
  const locale = useLocale();
  const tProposals = useTranslations("proposals");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All");
  const [sort, setSort] = useState<(typeof sortOptions)[number]>("Time");
  const [translatedOnly, setTranslatedOnly] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_PROPOSAL_LIMIT);
  const [results, setResults] = useState(proposals);
  const [isLoading, setIsLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setResults(proposals);
  }, [proposals]);

  useEffect(() => {
    setLimit(DEFAULT_PROPOSAL_LIMIT);
  }, [deferredQuery, sort, status, translatedOnly, initialSpaceSlug]);

  useEffect(() => {
    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      sort: sort.toLowerCase(),
      limit: String(limit),
    });

    if (locale && locale !== "en") {
      searchParams.set("locale", locale);
      if (translatedOnly) {
        searchParams.set("translatedOnly", "true");
      }
    }

    if (deferredQuery.trim()) {
      searchParams.set("q", deferredQuery.trim());
    }

    if (status !== "All") {
      searchParams.set("status", status);
    }

    if (initialSpaceSlug) {
      searchParams.set("spaceSlug", initialSpaceSlug);
    }

    async function loadProposals() {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/snapshot/proposals?${searchParams.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Proposals request failed: ${response.status}`);
        }

        const payload = (await response.json()) as { data?: Proposal[] };
        if (!controller.signal.aborted) {
          setResults(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[ProposalsBrowser] failed to load proposals", error);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProposals();

    return () => controller.abort();
  }, [deferredQuery, initialSpaceSlug, limit, locale, sort, status, translatedOnly]);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="grid gap-3 border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-4 md:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tProposals("searchPlaceholder")}
            className="pl-10"
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {statusOptions.map((option) => (
            <Button
              key={option}
              variant={option === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(option)}
              className="shrink-0"
            >
              {statusLabel(option, tProposals)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 md:justify-start">
          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((option) => (
              <Button
                key={option}
                variant={sort === option ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSort(option)}
              >
                {option === "Time" ? tProposals("time") : tProposals("heat")}
              </Button>
            ))}
            {locale !== "en" ? (
              <Button
                variant={translatedOnly ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTranslatedOnly((value) => !value)}
              >
                {tProposals("translatedOnly")}
              </Button>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => dispatch(setProposalView("list"))}
              aria-label="List view"
            >
              <List className="size-4" />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => dispatch(setProposalView("grid"))}
              aria-label="Grid view"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
          {typeof totalProposalsCount === "number" ? (
            <span>{tProposals("supportedProposals", { count: totalProposalsCount })}</span>
          ) : null}
          <span>{isLoading ? tProposals("searching") : tProposals("loaded", { count: results.length })}</span>
        </div>
      </div>

      <div className={view === "grid" ? "grid gap-4 md:gap-6 lg:grid-cols-2" : "grid gap-4 md:gap-6"}>
        {results.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} compact={view === "list"} />
        ))}
      </div>

      {results.length >= limit ? (
        <div>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setLimit((count) => count + LOAD_MORE_STEP)}>
            {tProposals("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: ProposalStatus | "All", tProposals: ReturnType<typeof useTranslations<"proposals">>) {
  switch (status) {
    case "Active":
      return tProposals("active");
    case "Upcoming":
      return tProposals("upcoming");
    case "Closed":
      return tProposals("closed");
    case "Executed":
      return tProposals("executed");
    default:
      return tProposals("all");
  }
}
