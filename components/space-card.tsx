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
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <Link href={href} className="flex items-center gap-4 rounded-sm outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar>
              {space.avatar ? <AvatarImage src={space.avatar} alt={space.name} /> : null}
              <AvatarFallback>{space.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl">{space.name}</CardTitle>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{space.slug}</p>
              <p className="mt-2 text-sm text-muted-foreground">{space.tagline}</p>
            </div>
          </Link>
          {space.verified ? <BadgeCheck className="size-5 text-[#1d3a32]" /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {space.categories.map((category) => (
            <Badge key={category} variant="muted">
              {category}
            </Badge>
          ))}
        </div>
        <p className="text-sm leading-7 text-muted-foreground">{space.summary}</p>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
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
