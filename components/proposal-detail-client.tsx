"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Languages, Link2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProposalDetail, ProposalTranslation } from "@/lib/types";

const localeOptions = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
] as const;

function resolveMarkdownAssetUrl(url?: string | Blob | null) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("ipfs://")) {
    return `https://cloudflare-ipfs.com/ipfs/${url.slice(7)}`;
  }
  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url;
  }
  return "";
}

function formatAuthorAddress(address: string) {
  if (!address) return "";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getAuthorInitials(address: string) {
  const normalized = address.startsWith("0x") ? address.slice(2) : address;
  return (normalized.slice(0, 2) || "UT").toUpperCase();
}

function getAuthorAvatarStyle(address: string): CSSProperties {
  let hash = 0;
  for (let index = 0; index < address.length; index += 1) {
    hash = (hash * 31 + address.charCodeAt(index)) >>> 0;
  }

  const hue = hash % 360;
  const accentHue = (hue + 42) % 360;

  return {
    background: `linear-gradient(135deg, hsl(${hue} var(--avatar-gradient-sat) var(--avatar-gradient-light-a)), hsl(${accentHue} var(--avatar-gradient-sat-accent) var(--avatar-gradient-light-b)))`,
    color: "hsl(var(--background))",
  };
}

// ─── Vote outcome ─────────────────────────────────────────────────────────────

// Choices that indicate a positive outcome when they lead the vote.
const PASSING_CHOICE = /^(for|yes|yea|yay|approve[sd]?|in favor|support[s]?|pass(?:ed)?|accept(?:ed)?|agree[sd]?|赞成|同意|支持)\b/i;
// Choices that indicate a negative outcome when they lead the vote.
const FAILING_CHOICE = /^(against|no|nay|nope|reject(?:ed)?|oppose[sd]?|decline[sd]?|fail(?:ed)?|disagree[sd]?|反对|不同意|拒绝)\b/i;

type VoteOutcome = "passed" | "failed" | null;

/**
 * Best-effort inference of whether a closed proposal passed.
 * Returns null when the outcome can't be determined (complex vote types,
 * unrecognised choice names, or the proposal isn't closed yet).
 */
function deriveVoteOutcome(
  choices: string[],
  scores: number[] | null,
  scoresTotal: number | null,
  quorum: number | null,
  status: ProposalDetail["status"],
  type: string | null
): VoteOutcome {
  if (status !== "Closed" && status !== "Executed") return null;
  if (!choices.length || !scores?.length) return null;

  const effectiveTotal = (scoresTotal ?? 0) > 0 ? scoresTotal! : scores.reduce((a, b) => a + b, 0);

  // Quorum check: if a positive quorum threshold exists and wasn't reached, proposal failed.
  if (quorum != null && quorum > 0 && effectiveTotal < quorum) return "failed";

  // Only determine pass/fail for binary/simple vote types.
  // Approval, weighted, ranked-choice, quadratic etc. don't have a single "winner".
  const isSupportedType = type === "basic" || type === "single-choice" || type == null;
  if (!isSupportedType) return null;

  const leadingIdx = scores.indexOf(Math.max(...scores));
  const leadingChoice = choices[leadingIdx] ?? "";
  const leadingScore = scores[leadingIdx] ?? 0;

  // Abstain votes should not count as a "passing" or "failing" outcome
  if (/^abstain|弃权/i.test(leadingChoice)) return null;

  // Require the leading choice to have at least some votes
  if (leadingScore === 0) return null;

  if (PASSING_CHOICE.test(leadingChoice)) return "passed";
  if (FAILING_CHOICE.test(leadingChoice)) return "failed";
  return null;
}

function formatScore(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isFenceBoundary(line: string) {
  return line.trim().startsWith("```");
}

function isCodeLikeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^\/\/\//.test(trimmed)) return true;
  if (/^\/\//.test(trimmed)) return true;
  if (/^[A-Za-z_][\w.]*\([^)]*\);?$/.test(trimmed)) return true;
  if (/^[A-Za-z_][\w.]*\([^)]*\)\.[A-Za-z_][\w]*\([^)]*\);?$/.test(trimmed)) return true;
  if (/^[A-Za-z_][\w.]*\s*=\s*.+;?$/.test(trimmed)) return true;
  if (/[;{}]$/.test(trimmed) && /[A-Za-z_]/.test(trimmed)) return true;
  return false;
}

function normalizeMarkdownCodeFences(markdown: string) {
  if (!markdown.trim()) return markdown;

  const lines = markdown.split("\n");
  const normalized: string[] = [];
  let index = 0;
  let inFence = false;

  while (index < lines.length) {
    const currentLine = lines[index];

    if (isFenceBoundary(currentLine)) {
      inFence = !inFence;
      normalized.push(currentLine);
      index += 1;
      continue;
    }

    if (inFence || !isCodeLikeLine(currentLine)) {
      normalized.push(currentLine);
      index += 1;
      continue;
    }

    let cursor = index;
    let codeLineCount = 0;
    const block: string[] = [];

    while (cursor < lines.length) {
      const candidate = lines[cursor];
      if (isFenceBoundary(candidate)) break;
      if (!candidate.trim()) {
        block.push(candidate);
        cursor += 1;
        continue;
      }
      if (!isCodeLikeLine(candidate)) break;
      codeLineCount += 1;
      block.push(candidate);
      cursor += 1;
    }

    if (codeLineCount >= 3) {
      normalized.push("```");
      normalized.push(...block);
      normalized.push("```");
      index = cursor;
      continue;
    }

    normalized.push(currentLine);
    index += 1;
  }

  return normalized.join("\n");
}

function VotingResults({
  choices,
  scores,
  scoresTotal,
  votesCount,
  quorum,
  status,
  type,
}: {
  choices: string[];
  scores: number[] | null;
  scoresTotal: number | null;
  votesCount: number;
  quorum: number | null;
  status: ProposalDetail["status"];
  type: string | null;
}) {
  const tProposals = useTranslations("proposals");

  if (choices.length === 0 || !scores || scores.length === 0) return null;
  if (status === "Upcoming") return null;

  const total = scoresTotal != null && scoresTotal > 0 ? scoresTotal : scores.reduce((a, b) => a + b, 0);
  const leadingIndex = scores.indexOf(Math.max(...scores));
  const isLive = status === "Active";
  const quorumMet = quorum != null && quorum > 0 ? total >= quorum : null;
  const outcome = deriveVoteOutcome(choices, scores, scoresTotal, quorum, status, type);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isLive ? tProposals("liveResults") : tProposals("votingResults")}</CardTitle>
        {type && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {tProposals("votingType")}: <span className="capitalize">{type.replace(/-/g, " ")}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {outcome && (
          <div className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold ${
            outcome === "passed"
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          }`}>
            <span className="text-base leading-none">{outcome === "passed" ? "✓" : "✗"}</span>
            {outcome === "passed" ? tProposals("outcomePassed") : tProposals("outcomeNotPassed")}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {choices.map((choice, i) => {
            const score = scores[i] ?? 0;
            const pct = total > 0 ? (score / total) * 100 : 0;
            const isLeading = i === leadingIndex && score > 0;
            return (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={`truncate font-medium ${isLeading ? "text-foreground" : "text-muted-foreground"}`}>
                    {choice}
                    {isLeading && !isLive ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-success">
                        {tProposals("leading")}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${isLeading ? "bg-primary" : "bg-muted-foreground/40"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">{formatScore(score)}</p>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{tProposals("totalVotes")}</p>
            <p className="mt-1 font-semibold">{votesCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{tProposals("totalScore")}</p>
            <p className="mt-1 font-semibold">{formatScore(total)}</p>
          </div>
        </div>

        {quorum != null && quorum > 0 ? (
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${quorumMet ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
              {tProposals("quorum")}
            </span>
            <span className="ml-auto">{formatScore(quorum)}</span>
            <span className="shrink-0">{quorumMet ? tProposals("quorumMet") : tProposals("quorumNotMet")}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type Props = {
  proposalId: string;
  initialProposal: ProposalDetail;
  initialLocale: string;
  children?: React.ReactNode;
};

export function ProposalDetailClient({ proposalId, initialProposal, initialLocale, children }: Props) {
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
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const requestedLocale = searchParams.get("locale") ?? initialLocale;

  useEffect(() => {
    let cancelled = false;

    async function loadProposal() {
      setIsLoading(true);

      try {
        const localeQuery = requestedLocale && requestedLocale !== "en" ? `?locale=${requestedLocale}` : "";
        const [proposalResponse, translationsResponse] = await Promise.all([
          fetch(`/api/snapshot/proposals/${proposalId}${localeQuery}`, {}),
          fetch(`/api/snapshot/proposals/${proposalId}/translations`, {}),
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

  useEffect(() => {
    setIsSummaryExpanded(false);
  }, [proposal.id, requestedLocale]);

  function handleLocaleChange(nextLocale: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("locale", nextLocale);

    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    startTransition(() => {
      router.replace(nextUrl);
    });
  }

  const activeLocale = proposal.translation?.locale ?? "en";
  const summaryText = proposal.summary?.trim() ?? "";
  const isSummaryLong = summaryText.length > 280;
  const bodyContent = normalizeMarkdownCodeFences(proposal.body || proposal.summary);
  const selectableLocales = ["en", ...availableLocales.filter((locale) => locale !== "en")];
  const showReadingLocale = availableLocales.length > 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-16">
      {children}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <div className="flex min-w-0 flex-col gap-8 lg:order-1">
          <div className="break-words border border-border bg-card p-5 shadow-panel md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/spaces/${proposal.spaceSlug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-2.5 py-1.5 transition-colors hover:border-foreground/20 hover:bg-accent/10"
              >
                <Avatar className="size-5">
                  {proposal.spaceAvatar ? <AvatarImage src={proposal.spaceAvatar} alt={proposal.protocol} /> : null}
                  <AvatarFallback className="text-[10px]">{proposal.protocol.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground">{proposal.protocol}</span>
              </Link>
              <Badge>{proposal.status}</Badge>
              {(() => {
                const outcome = deriveVoteOutcome(
                  proposal.choices,
                  proposal.scores,
                  proposal.scoresTotal,
                  proposal.quorum,
                  proposal.status,
                  proposal.type
                );
                if (!outcome) return null;
                return (
                  <Badge className={outcome === "passed"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                  }>
                    {outcome === "passed" ? tProposals("outcomePassed") : tProposals("outcomeNotPassed")}
                  </Badge>
                );
              })()}
              <Badge variant="muted" className="gap-1">
                <Languages className="size-3.5" />
                {activeLocale.toUpperCase()}
              </Badge>
            </div>
            <h1 className="mt-5 max-w-4xl text-balance font-serif text-[1.75rem] leading-tight md:text-[2.5rem]">{proposal.title}</h1>
            {proposal.labels.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {proposal.labels.map((label) => (
                  <Badge key={label} variant="muted" className="text-xs">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-6 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("published")}</p>
                <p className="mt-2">{new Date(proposal.publishedAt).toLocaleString(uiLocale)}</p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em]">{tProposals("closes")}</p>
                <p className="mt-2">{new Date(proposal.closesAt).toLocaleString(uiLocale)}</p>
              </div>
            </div>
            {(proposal.author || showReadingLocale) && (
              <>
                <Separator className="mt-6" />
                <div className="mt-5 grid gap-4 md:grid-cols-2 md:items-start">
                  {proposal.author ? (
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {tProposals("author")}
                      </p>
                      <a
                        href={proposal.authorProfileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group mt-2 inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Avatar className="size-5 shrink-0">
                          <AvatarFallback style={getAuthorAvatarStyle(proposal.author)} className="text-[9px]">
                            {getAuthorInitials(proposal.author)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate font-mono text-foreground" title={proposal.author}>
                          {formatAuthorAddress(proposal.author)}
                        </span>
                        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
                      </a>
                    </div>
                  ) : null}

                </div>
              </>
            )}
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>{tProposals("proposalContent")}</CardTitle>
              {showReadingLocale ? (
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
              ) : null}
            </CardHeader>
            <CardContent>
              {showReadingLocale ? (
                <p className="mb-4 text-xs leading-6 text-muted-foreground">
                  {isLoading
                    ? tProposals("refreshingProposalContent")
                    : proposal.translation
                      ? tProposals("translatedBy", {
                          locale: proposal.translation.locale.toUpperCase(),
                          by: proposal.translation.translatedBy ?? "the translation pipeline",
                        })
                      : tProposals("defaultSourceContent")}
                </p>
              ) : null}
              {summaryText ? (
                <div className="mb-5 border-l-2 border-border bg-muted/40 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {tProposals("summary")}
                  </p>
                  <p className={`mt-2 break-words text-sm leading-6 text-foreground/90 ${!isSummaryExpanded && isSummaryLong ? "line-clamp-4" : ""}`}>
                    {summaryText}
                  </p>
                  {isSummaryLong ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-0 text-xs"
                      onClick={() => setIsSummaryExpanded((value) => !value)}
                    >
                      {isSummaryExpanded ? tProposals("showLess") : tProposals("showMore")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="proposal-markdown min-w-0 text-muted-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                    img: ({ node: _node, src, alt, ...props }) => {
                      const resolvedSrc = resolveMarkdownAssetUrl(src);
                      if (!resolvedSrc) return null;
                      return <img {...props} src={resolvedSrc} alt={alt ?? ""} loading="lazy" />;
                    },
                    pre: ({ node: _node, children, ...props }) => {
                      const firstChild = Array.isArray(children) ? children[0] : children;
                      const className =
                        firstChild && typeof firstChild === "object" && "props" in firstChild
                          ? ((firstChild as { props?: { className?: string } }).props?.className ?? "")
                          : "";
                      const languageMatch = /language-([\w-]+)/.exec(className);
                      const languageLabel = languageMatch?.[1]?.toUpperCase() ?? "CODE";

                      return (
                        <div className="proposal-code-block">
                          <div className="proposal-code-block-header">{languageLabel}</div>
                          <pre {...props} className="proposal-code-block-pre">
                            {children}
                          </pre>
                        </div>
                      );
                    },
                    code: ({ node: _node, className, children, ...props }) => {
                      const codeText = String(children ?? "");
                      const isBlockCode =
                        Boolean(className && (className.includes("language-") || className.includes("hljs"))) ||
                        codeText.includes("\n");
                      if (isBlockCode) {
                        return (
                          <code {...props} className={className}>
                            {children}
                          </code>
                        );
                      }

                      return (
                        <code {...props} className={["proposal-inline-code", className].filter(Boolean).join(" ")}>
                          {children}
                        </code>
                      );
                    },
                    table: ({ node: _node, className, ...props }) => (
                      <div className="proposal-table-wrap">
                        <table {...props} className={className} />
                      </div>
                    ),
                    blockquote: ({ node: _node, className, ...props }) => (
                      <blockquote
                        {...props}
                        className={["proposal-quote", className].filter(Boolean).join(" ")}
                      />
                    ),
                    ul: ({ node: _node, className, ...props }) => (
                      <ul
                        {...props}
                        className={["proposal-list proposal-list-unordered", className].filter(Boolean).join(" ")}
                      />
                    ),
                    ol: ({ node: _node, className, ...props }) => (
                      <ol
                        {...props}
                        className={["proposal-list proposal-list-ordered", className].filter(Boolean).join(" ")}
                      />
                    ),
                    li: ({ node: _node, className, ...props }) => (
                      <li
                        {...props}
                        className={["proposal-list-item", className].filter(Boolean).join(" ")}
                      />
                    ),
                    input: ({ node: _node, className, ...props }) => (
                      <input
                        {...props}
                        disabled
                        className={["proposal-task-checkbox", className].filter(Boolean).join(" ")}
                      />
                    ),
                  }}
                >
                  {bodyContent}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <VotingResults
            choices={proposal.choices}
            scores={proposal.scores}
            scoresTotal={proposal.scoresTotal}
            votesCount={proposal.votesCount}
            quorum={proposal.quorum}
            status={proposal.status}
            type={proposal.type}
          />
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
