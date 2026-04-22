import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProposalDetailClient } from "@/components/proposal-detail-client";
import { getProposalDetail } from "@/lib/repository";
import { getServerLocale } from "@/lib/i18n-server";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}): Promise<Metadata> {
  const [{ id }, { locale }] = await Promise.all([params, searchParams]);
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) {
    return {
      title: "Proposal Not Found",
    };
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

export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const uiLocale = await getServerLocale();
  const [{ id }, { locale }] = await Promise.all([params, searchParams]);
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) notFound();

  return <ProposalDetailClient proposalId={id} initialProposal={proposal} initialLocale={locale ?? "en"} uiLocale={uiLocale} />;
}
