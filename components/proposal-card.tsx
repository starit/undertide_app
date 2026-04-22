import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Proposal } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Locale, getDictionary } from "@/lib/i18n";

export function ProposalCard({ proposal, compact = false, locale = "en" }: { proposal: Proposal; compact?: boolean; locale?: Locale }) {
  const copy = getDictionary(locale);

  return (
    <Card className="h-full">
      <CardHeader className={compact ? "p-5" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{proposal.protocol}</Badge>
          <Badge>{proposal.status}</Badge>
        </div>
        <CardTitle className={compact ? "text-xl" : undefined}>{proposal.title}</CardTitle>
      </CardHeader>
      <CardContent className={compact ? "p-5 pt-0" : undefined}>
        <p className="text-sm leading-7 text-muted-foreground">{proposal.summary}</p>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <Clock3 className="size-4" />
          <span>{copy.proposals.heat} {proposal.heat}</span>
        </div>
        <Link href={`/proposals/${proposal.id}`} className="inline-flex items-center gap-2 text-sm font-medium">
          {copy.home.open} <ArrowUpRight className="size-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
