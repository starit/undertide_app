"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Languages, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProposalDetail, ProposalTranslation } from "@/lib/types";
import { formatMessage, Locale, getDictionary } from "@/lib/i18n";

const localeOptions = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
] as const;

type Props = {
  proposalId: string;
  initialProposal: ProposalDetail;
  initialLocale: string;
  uiLocale: Locale;
};

export function ProposalDetailClient({ proposalId, initialProposal, initialLocale, uiLocale }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const copy = getDictionary(uiLocale);
  const [isPending, startTransition] = useTransition();
  const [proposal, setProposal] = useState(initialProposal);
  const [availableLocales, setAvailableLocales] = useState<string[]>(
    initialProposal.translation ? [initialProposal.translation.locale] : []
  );
  const [isLoading, setIsLoading] = useState(false);

  const requestedLocale = searchParams.get("locale") ?? initialLocale;

  useEffect(() => {
    let cancelled = false;

    async function loadProposal() {
      setIsLoading(true);

      try {
        const localeQuery = requestedLocale && requestedLocale !== "en" ? `?locale=${requestedLocale}` : "";
        const [proposalResponse, translationsResponse] = await Promise.all([
          fetch(`/api/proposals/${proposalId}${localeQuery}`, {}),
          fetch(`/api/proposals/${proposalId}/translations`, {}),
        ]);

        if (!proposalResponse.ok) {
          throw new Error(`Proposal request failed: ${proposalResponse.status}`);
        }

        const proposalJson = (await proposalResponse.json()) as { data: ProposalDetail };
        const translationsJson = translationsResponse.ok
          ? ((await translationsResponse.json()) as { data: ProposalTranslation[] })
          : { data: [] };

        if (!cancelled) {
          setProposal(proposalJson.data);
          setAvailableLocales(translationsJson.data.map((item) => item.locale));
        }
      } catch {
        if (!cancelled) {
          setProposal(initialProposal);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProposal();

    return () => {
      cancelled = true;
    };
  }, [initialProposal, proposalId, requestedLocale]);

  function handleLocaleChange(nextLocale: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextLocale === "en") {
      nextParams.delete("locale");
    } else {
      nextParams.set("locale", nextLocale);
    }

    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    startTransition(() => {
      router.replace(nextUrl);
    });
  }

  const activeLocale = proposal.translation?.locale ?? "en";
  const bodyContent = proposal.body || proposal.summary;

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-8">
          <div className="border border-border bg-card p-8 shadow-panel">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">{proposal.protocol}</Badge>
              <Badge>{proposal.status}</Badge>
              <Badge variant="muted" className="gap-1">
                <Languages className="size-3.5" />
                {activeLocale.toUpperCase()}
              </Badge>
            </div>
            <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-tight">{proposal.title}</h1>
            {proposal.labels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {proposal.labels.map((label) => (
                  <Badge key={label} variant="muted" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-6 grid gap-4 text-sm text-muted-foreground md:grid-cols-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{copy.proposals.published}</p>
                <p className="mt-2">{new Date(proposal.publishedAt).toLocaleString(uiLocale)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{copy.proposals.closes}</p>
                <p className="mt-2">{new Date(proposal.closesAt).toLocaleString(uiLocale)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{copy.proposals.heat}</p>
                <p className="mt-2">{proposal.heat} / 100</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{copy.proposals.votes}</p>
                <p className="mt-2">{proposal.votesCount.toLocaleString()}</p>
              </div>
              {proposal.type && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{copy.proposals.votingType}</p>
                  <p className="mt-2 capitalize">{proposal.type.replace(/-/g, " ")}</p>
                </div>
              )}
              {proposal.quorum != null && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{copy.proposals.quorum}</p>
                  <p className="mt-2">{proposal.quorum.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>{copy.proposals.readingLocale}</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                {localeOptions.map((option) => {
                  const isAvailable = option.value === "en" || availableLocales.includes(option.value);
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={activeLocale === option.value ? "default" : "outline"}
                      disabled={!isAvailable || isPending}
                      onClick={() => handleLocaleChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-7 text-muted-foreground">
                {isLoading
                  ? copy.proposals.refreshingProposalContent
                  : proposal.translation
                    ? formatMessage(copy.proposals.translatedBy, {
                        locale: proposal.translation.locale.toUpperCase(),
                        by: proposal.translation.translatedBy ?? "the translation pipeline",
                      })
                    : copy.proposals.defaultSourceContent}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{copy.proposals.proposalContent}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-8 text-muted-foreground">{bodyContent}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{copy.proposals.sourceLinks}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Button variant="outline" asChild>
                <a href={proposal.proposalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                  {copy.proposals.originalProposal} <ArrowUpRight className="size-4" />
                </a>
              </Button>
              {proposal.discussion && (
                <Button variant="outline" asChild>
                  <a href={proposal.discussion} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                    {copy.proposals.discussionThread} <ArrowUpRight className="size-4" />
                  </a>
                </Button>
              )}
              <Separator />
              <Button variant="ghost" className="justify-start">
                <Link2 className="size-4" />
                {copy.proposals.shareSummary}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
