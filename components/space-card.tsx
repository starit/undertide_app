"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { Space } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function SpaceCard({ space }: { space: Space }) {
  const href = `/spaces/${space.slug}`;
  const tSpaces = useTranslations("spaces");

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <Link href={href} className="flex min-w-0 items-center gap-3 rounded-sm outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring md:gap-4">
            <Avatar className="shrink-0">
              {space.avatar ? <AvatarImage src={space.avatar} alt={space.name} /> : null}
              <AvatarFallback>{space.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg md:text-xl">{space.name}</CardTitle>
              <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{space.slug}</p>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{space.tagline}</p>
            </div>
          </Link>
          {space.verified ? <BadgeCheck className="mt-0.5 size-5 shrink-0 text-info" /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {space.categories.map((category) => (
            <Badge key={category} variant="muted">
              {category}
            </Badge>
          ))}
        </div>
        <p className="line-clamp-4 text-sm leading-6 text-muted-foreground md:leading-7">{space.summary}</p>
      </CardContent>
      <CardFooter className="min-h-24 flex flex-col items-start gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{tSpaces("followersLabel")}</p>
            <p className="mt-1 font-semibold">{space.followers.toLocaleString()}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{tSpaces("proposalsLabel")}</p>
            <p className="mt-1 font-semibold">{space.proposals}</p>
          </div>
        </div>
        <Link href={href} className="inline-flex items-center gap-2 text-sm font-medium">
          {tSpaces("profile")} <ArrowUpRight className="size-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
