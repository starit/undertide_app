import { notFound } from "next/navigation";
import { ProposalDetailClient } from "@/components/proposal-detail-client";
import { getProposalDetail } from "@/lib/repository";

export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const [{ id }, { locale }] = await Promise.all([params, searchParams]);
  const proposal = await getProposalDetail(id, locale);

  if (!proposal) notFound();

  return <ProposalDetailClient proposalId={id} initialProposal={proposal} initialLocale={locale ?? "en"} />;
}
