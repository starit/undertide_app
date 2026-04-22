"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const tSpaces = useTranslations("spaces");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categoryOptions)[number]>("All");
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [sort, setSort] = useState<"Activity" | "Followers">("Activity");
  const [results, setResults] = useState(spaces);
  const [isLoading, setIsLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setResults(spaces);
  }, [spaces]);

  useEffect(() => {
    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      sort: sort.toLowerCase(),
      limit: "200",
    });

    if (deferredQuery.trim()) {
      searchParams.set("q", deferredQuery.trim());
    }

    if (category !== "All") {
      searchParams.set("category", category);
    }

    if (verifiedOnly) {
      searchParams.set("verified", "true");
    }

    async function loadSpaces() {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/spaces?${searchParams.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Spaces request failed: ${response.status}`);
        }

        const payload = (await response.json()) as { data?: Space[] };
        if (!controller.signal.aborted) {
          setResults(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[SpacesBrowser] failed to load spaces", error);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadSpaces();

    return () => controller.abort();
  }, [category, deferredQuery, sort, verifiedOnly]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto] md:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tSpaces("searchPlaceholder")}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: "Activity", label: tSpaces("activity") },
            { value: "Followers", label: tSpaces("followers") },
          ].map((option) => (
            <Button
              key={option.value}
              variant={sort === option.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort(option.value as "Activity" | "Followers")}
            >
              {option.label}
            </Button>
          ))}
          <Button variant={verifiedOnly ? "default" : "outline"} size="sm" onClick={() => setVerifiedOnly((value) => !value)}>
            {tSpaces("verified")}
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

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categoryOptions.map((option) => (
          <Button
            key={option}
            variant={category === option ? "default" : "outline"}
            size="sm"
            onClick={() => setCategory(option)}
            className="shrink-0"
          >
            {option}
          </Button>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {isLoading ? tSpaces("searching") : tSpaces("loaded", { count: results.length })}
        </span>
      </div>

      <div className={view === "grid" ? "grid gap-6 lg:grid-cols-2" : "grid gap-6"}>
        {results.map((space) => (
          <SpaceCard key={space.slug} space={space} />
        ))}
      </div>
    </div>
  );
}
