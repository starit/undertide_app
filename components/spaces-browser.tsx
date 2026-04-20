"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { Space } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setSpaceView } from "@/store/ui-slice";
import { SpaceCard } from "@/components/space-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const categoryOptions = ["All", "Layer 2", "Treasury", "Risk", "Protocol", "DEX", "Identity", "Public Goods"] as const;

export function SpacesBrowser({ spaces }: { spaces: Space[] }) {
  const dispatch = useAppDispatch();
  const view = useAppSelector((state) => state.ui.spaceView);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categoryOptions)[number]>("All");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<"Activity" | "Followers">("Activity");

  const filtered = useMemo(() => {
    return [...spaces]
      .filter((space) => {
        const matchesQuery =
          space.name.toLowerCase().includes(query.toLowerCase()) ||
          space.summary.toLowerCase().includes(query.toLowerCase()) ||
          space.categories.join(" ").toLowerCase().includes(query.toLowerCase());
        const matchesCategory = category === "All" ? true : space.categories.includes(category);
        const matchesVerified = verifiedOnly ? space.verified : true;
        return matchesQuery && matchesCategory && matchesVerified;
      })
      .sort((a, b) => (sort === "Activity" ? b.activityScore - a.activityScore : b.followers - a.followers));
  }, [category, query, sort, verifiedOnly]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search protocols, categories, ecosystem themes..."
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {["Activity", "Followers"].map((option) => (
            <Button
              key={option}
              variant={sort === option ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort(option as "Activity" | "Followers")}
            >
              {option}
            </Button>
          ))}
          <Button variant={verifiedOnly ? "default" : "outline"} size="sm" onClick={() => setVerifiedOnly((value) => !value)}>
            Verified
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => dispatch(setSpaceView("list"))}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => dispatch(setSpaceView("grid"))}
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {categoryOptions.map((option) => (
          <Button
            key={option}
            variant={category === option ? "default" : "outline"}
            size="sm"
            onClick={() => setCategory(option)}
          >
            {option}
          </Button>
        ))}
      </div>

      <div className={view === "grid" ? "grid gap-6 lg:grid-cols-2" : "grid gap-6"}>
        {filtered.map((space) => (
          <SpaceCard key={space.slug} space={space} />
        ))}
      </div>
    </div>
  );
}
