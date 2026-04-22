"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Languages, Link2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProposalDetail, ProposalTranslation } from "@/lib/types";
import { formatMessage } from "@/lib/i18n";

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
};

export function ProposalDetailClient({ proposalId, initialProposal, initialLocale }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const uiLocale = useLocale();
  const tProposals = useTranslations("proposals");
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
  const selectableLocales = ["en", ...availableLocales.filter((locale) => locale !== "en")];
  const showReadingLocale = availableLocales.length > 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-16">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-8">
          <div className="border border-border bg-card p-5 shadow-panel md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/spaces/${proposal.spaceSlug}`} className="inline-flex">
                <Badge variant="muted" className="transition-colors hover:border-foreground/20 hover:bg-accent">
                  {proposal.protocol}
                </Badge>
              </Link>
              <Badge>{proposal.status}</Badge>
              <Badge variant="muted" className="gap-1">
                <Languages className="size-3.5" />
                {activeLocale.toUpperCase()}
              </Badge>
            </div>
            <h1 className="mt-5 max-w-4xl text-balance font-serif text-3xl leading-tight md:text-[2.75rem]">{proposal.title}</h1>
            {proposal.labels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {proposal.labels.map((label) => (
                  <Badge key={label} variant="muted" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 md:grid-cols-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("published")}</p>
                <p className="mt-2">{new Date(proposal.publishedAt).toLocaleString(uiLocale)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("closes")}</p>
                <p className="mt-2">{new Date(proposal.closesAt).toLocaleString(uiLocale)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("heat")}</p>
                <p className="mt-2">{proposal.heat} / 100</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("votes")}</p>
                <p className="mt-2">{proposal.votesCount.toLocaleString()}</p>
              </div>
              {proposal.type && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("votingType")}</p>
                  <p className="mt-2 capitalize">{proposal.type.replace(/-/g, " ")}</p>
                </div>
              )}
              {proposal.quorum != null && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("quorum")}</p>
                  <p className="mt-2">{proposal.quorum.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {showReadingLocale && (
            <Card>
              <CardHeader className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-base">{tProposals("readingLocale")}</CardTitle>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {localeOptions
                    .filter((option) => selectableLocales.includes(option.value))
                    .map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={activeLocale === option.value ? "default" : "outline"}
                        disabled={isPending}
                        onClick={() => handleLocaleChange(option.value)}
                        className="shrink-0"
                      >
                        {option.label}
                      </Button>
                    ))}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs leading-6 text-muted-foreground">
                  {isLoading
                    ? tProposals("refreshingProposalContent")
                    : proposal.translation
                      ? formatMessage(tProposals("translatedBy"), {
                          locale: proposal.translation.locale.toUpperCase(),
                          by: proposal.translation.translatedBy ?? "the translation pipeline",
                        })
                      : tProposals("defaultSourceContent")}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{tProposals("proposalContent")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="proposal-markdown min-w-0 text-muted-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                  }}
                >
                  {bodyContent}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{tProposals("sourceLinks")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Button variant="outline" asChild className="w-full">
                <a href={proposal.proposalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                  {tProposals("originalProposal")} <ArrowUpRight className="size-4" />
                </a>
              </Button>
              {proposal.discussion && (
                <Button variant="outline" asChild className="w-full">
                  <a href={proposal.discussion} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between">
                    {tProposals("discussionThread")} <ArrowUpRight className="size-4" />
                  </a>
                </Button>
              )}
              <Separator />
              <Button variant="ghost" className="justify-start">
                <Link2 className="size-4" />
                {tProposals("shareSummary")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
