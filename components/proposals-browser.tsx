"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { Proposal, ProposalStatus } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setProposalView } from "@/store/ui-slice";
import { ProposalCard } from "@/components/proposal-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Locale, getDictionary } from "@/lib/i18n";

const statusOptions: Array<ProposalStatus | "All"> = ["All", "Active", "Upcoming", "Closed", "Executed"];
const sortOptions = ["Time", "Heat"] as const;

export function ProposalsBrowser({
  proposals,
  initialSpaceSlug,
  locale,
}: {
  proposals: Proposal[];
  initialSpaceSlug?: string;
  locale: Locale;
}) {
  const dispatch = useAppDispatch();
  const view = useAppSelector((state) => state.ui.proposalView);
  const copy = getDictionary(locale);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("All");
  const [sort, setSort] = useState<(typeof sortOptions)[number]>("Time");
  const [visibleCount, setVisibleCount] = useState(4);

  const filtered = useMemo(() => {
    const base = proposals.filter((proposal) => {
      const matchesSpace = initialSpaceSlug ? proposal.spaceSlug === initialSpaceSlug : true;
      const matchesQuery =
        proposal.title.toLowerCase().includes(query.toLowerCase()) ||
        proposal.protocol.toLowerCase().includes(query.toLowerCase()) ||
        proposal.summary.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "All" ? true : proposal.status === status;
      return matchesSpace && matchesQuery && matchesStatus;
    });

    return [...base].sort((a, b) => {
      if (sort === "Heat") return b.heat - a.heat;
      return +new Date(b.publishedAt) - +new Date(a.publishedAt);
    });
  }, [initialSpaceSlug, proposals, query, sort, status]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:p-5">
        <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.proposals.searchPlaceholder}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <Button
              key={option}
              variant={option === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatus(option)}
            >
              {statusLabel(option, copy)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sortOptions.map((option) => (
            <Button
              key={option}
              variant={sort === option ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort(option)}
            >
              {option === "Time" ? copy.proposals.time : copy.proposals.heat}
            </Button>
          ))}
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => dispatch(setProposalView("list"))}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => dispatch(setProposalView("grid"))}
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      <div className={view === "grid" ? "grid gap-6 lg:grid-cols-2" : "grid gap-6"}>
        {visible.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} compact={view === "list"} locale={locale} />
        ))}
      </div>

      {visible.length < filtered.length ? (
        <div>
          <Button variant="outline" onClick={() => setVisibleCount((count) => count + 4)}>
            {copy.proposals.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: ProposalStatus | "All", copy: ReturnType<typeof getDictionary>) {
  switch (status) {
    case "Active":
      return copy.proposals.active;
    case "Upcoming":
      return copy.proposals.upcoming;
    case "Closed":
      return copy.proposals.closed;
    case "Executed":
      return copy.proposals.executed;
    default:
      return copy.proposals.all;
  }
}
