import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getProposalDetail } from "@/lib/repository";
import { getServerLocale } from "@/lib/i18n-server";

/**
 * Supports Snapshot-style URLs: /:spaceSlug/:proposalId
 * e.g. /hvax.eth/0xd24124e854673...
 *
 * Validates the proposal exists and belongs to the given space,
 * then redirects to the canonical /proposals/:id URL.
 */

type Params = Promise<{ spaceSlug: string; proposalId: string }>;
type SearchParams = Promise<{ locale?: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const serverLocale = await getServerLocale();
  const [{ proposalId }, { locale }] = await Promise.all([params, searchParams]);
  const proposal = await getProposalDetail(proposalId, locale ?? serverLocale);

  if (!proposal) {
    return { title: "Proposal Not Found" };
  }

  return {
    title: proposal.title,
    description: proposal.summary,
    alternates: {
      canonical: `/proposals/${proposal.id}`,
    },
    openGraph: {
      title: `${proposal.title} | UnderTide`,
      description: proposal.summary,
      url: `https://undertide.xyz/proposals/${proposal.id}`,
    },
  };
}

export default async function SpaceProposalShortlinkPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ spaceSlug, proposalId }, { locale }] = await Promise.all([params, searchParams]);

  const proposal = await getProposalDetail(proposalId);

  if (!proposal) notFound();

  // Validate the proposal actually belongs to the given space.
  // spaceSlug in the URL may be an ENS name or a plain slug — compare case-insensitively.
  if (proposal.spaceSlug.toLowerCase() !== spaceSlug.toLowerCase()) {
    notFound();
  }

  // Redirect to canonical URL, preserving locale query param if present.
  const canonical = locale
    ? `/proposals/${proposal.id}?locale=${locale}`
    : `/proposals/${proposal.id}`;

  redirect(canonical);
}
