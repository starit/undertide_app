"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Proposal } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ProposalCard({ proposal, compact = false }: { proposal: Proposal; compact?: boolean }) {
  const tHome = useTranslations("home");
  const tProposals = useTranslations("proposals");

  return (
    <Card className="h-full">
      <CardHeader className={compact ? "p-5" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{proposal.protocol}</Badge>
          <Badge>{proposal.status}</Badge>
        </div>
        <CardTitle className={compact ? "text-xl" : "text-xl md:text-2xl"}>
          <Link href={`/proposals/${proposal.id}`} className="transition-opacity hover:opacity-80">
            {proposal.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className={compact ? "p-5 pt-0" : undefined}>
        <p className="text-sm leading-6 text-muted-foreground md:leading-7">{proposal.summary}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <Clock3 className="size-4" />
          <span>{tProposals("heat")} {proposal.heat}</span>
        </div>
        <Link href={`/proposals/${proposal.id}`} className="inline-flex items-center gap-2 text-sm font-medium">
          {tHome("open")} <ArrowUpRight className="size-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
